import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  Controller,
  Delete,
  type ExceptionFilter,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  Query,
  Res,
  type StreamableFile,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_PER_RECORD,
  type ApiErrorBody,
  type AttachmentDto,
} from '@apartman/shared';
import type { Response } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { activeOn, toDateString } from '../../common/dates';
import { AttachmentUploadQueryDto } from '../../common/finance.dto';
import { sendFile } from '../../common/http';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteRoles, SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { assertDateOpen } from './finance.ledger';
import { attachmentSelect, toAttachmentDto } from './finance.mapper';
import { detectFileType, FileStorage } from './storage';

export interface UploadedFileData {
  originalname: string;
  size: number;
  buffer: Buffer;
}

@Catch(PayloadTooLargeException)
class FileTooLargeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost) {
    const body: ApiErrorBody = {
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      message: `Dosya en fazla ${ATTACHMENT_MAX_BYTES / 1024 / 1024} MB olabilir`,
    };
    host.switchToHttp().getResponse<Response>().status(body.statusCode).json(body);
  }
}

function cleanFileName(raw: string, ext: string): string {
  const codes = [...raw].map((c) => c.codePointAt(0)!);
  let decoded = raw;
  if (codes.some((c) => c >= 0x80) && codes.every((c) => c <= 0xff)) {
    const utf8 = Buffer.from(raw, 'latin1').toString('utf8');
    if (!utf8.includes(String.fromCharCode(0xfffd))) decoded = utf8;
  }
  const base = [...path.basename(decoded)]
    .filter((c) => c.charCodeAt(0) >= 0x20 && c.charCodeAt(0) !== 0x7f && !'"\\/:*?<>|'.includes(c))
    .join('')
    .trim();
  const stem = (base.replace(/\.[^.]+$/, '') || 'belge').slice(0, 120);
  return `${stem}.${ext}`;
}

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly storage: FileStorage,
  ) {}

  async upload(query: AttachmentUploadQueryDto, file: UploadedFileData | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('Dosya seçin');
    const type = detectFileType(file.buffer);
    if (!type)
      throw new BadRequestException('Yalnızca PDF, JPG, PNG veya WEBP dosyası yüklenebilir');

    const target = { [`${query.target}Id`]: query.targetId };
    await this.assertTarget(query.target, query.targetId);
    const count = await this.tenant.db.attachment.count({ where: target });
    if (count >= ATTACHMENT_MAX_PER_RECORD) {
      throw new BadRequestException(
        `Bir kayda en fazla ${ATTACHMENT_MAX_PER_RECORD} dosya eklenebilir`,
      );
    }

    const siteId = this.tenant.siteId;
    const storageKey = `${siteId}/${randomUUID()}.${type.ext}`;
    await this.storage.save(storageKey, file.buffer);
    try {
      const attachment = await this.tenant.db.attachment.create({
        data: {
          siteId,
          fileName: cleanFileName(file.originalname, type.ext),
          mimeType: type.mime,
          sizeBytes: file.size,
          storageKey,
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
          uploadedById: this.tenant.userId ?? null,
          ...target,
        },
        select: attachmentSelect,
      });
      await this.audit.record({
        action: 'UPLOAD',
        entityType: 'Attachment',
        entityId: attachment.id,
        after: { ...query, fileName: attachment.fileName, sizeBytes: file.size },
      });
      return toAttachmentDto(attachment);
    } catch (error) {
      await this.storage.remove(storageKey);
      throw error;
    }
  }

  async open(id: string) {
    const attachment = await this.tenant.db.attachment.findUnique({
      where: { id },
      include: {
        transaction: { select: { type: true, visibleToResidents: true, cancelledAt: true } },
        work: { select: { visibleToResidents: true } },
        payment: { select: { unitId: true } },
      },
    });
    if (!attachment) throw new NotFoundException('Dosya bulunamadı');
    if (this.tenant.isResident && !(await this.residentCanSee(attachment))) {
      throw new NotFoundException('Dosya bulunamadı');
    }
    return { attachment, stream: this.storage.open(attachment.storageKey) };
  }

  async remove(id: string): Promise<void> {
    const attachment = await this.tenant.db.attachment.findUnique({
      where: { id },
      include: { transaction: { select: { date: true } }, payment: { select: { paidAt: true } } },
    });
    if (!attachment) throw new NotFoundException('Dosya bulunamadı');
    const date = attachment.transaction?.date ?? attachment.payment?.paidAt;
    if (date) await assertDateOpen(this.prisma, this.tenant.siteId, toDateString(date));
    await this.tenant.db.attachment.delete({ where: { id } });
    await this.storage.remove(attachment.storageKey);
    await this.audit.record({
      action: 'DELETE',
      entityType: 'Attachment',
      entityId: id,
      before: { fileName: attachment.fileName, sha256: attachment.sha256 },
    });
  }

  private async assertTarget(target: AttachmentUploadQueryDto['target'], id: string) {
    const found =
      target === 'transaction'
        ? await this.tenant.db.transaction.findFirst({ where: { id, cancelledAt: null } })
        : target === 'work'
          ? await this.tenant.db.work.findUnique({ where: { id } })
          : await this.tenant.db.payment.findFirst({ where: { id, cancelledAt: null } });
    if (!found) throw new NotFoundException('Dosyanın ekleneceği kayıt bulunamadı');
  }

  private async residentCanSee(a: {
    transaction: { type: string; visibleToResidents: boolean; cancelledAt: Date | null } | null;
    work: { visibleToResidents: boolean } | null;
    payment: { unitId: string } | null;
  }): Promise<boolean> {
    if (a.transaction) {
      return (
        a.transaction.type === 'EXPENSE' &&
        a.transaction.visibleToResidents &&
        !a.transaction.cancelledAt
      );
    }
    if (a.work) return a.work.visibleToResidents;
    if (a.payment) {
      const count = await this.tenant.db.occupancy.count({
        where: { unitId: a.payment.unitId, userId: this.tenant.userId, ...activeOn() },
      });
      return count > 0;
    }
    return false;
  }
}

@ApiTags('Gelir-gider')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseFilters(FileTooLargeFilter)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: ATTACHMENT_MAX_BYTES, files: 1 } }),
  )
  upload(
    @Query() query: AttachmentUploadQueryDto,
    @UploadedFile() file: UploadedFileData | undefined,
  ): Promise<AttachmentDto> {
    return this.attachments.upload(query, file);
  }

  @SiteRoles('SITE_MANAGER', 'RESIDENT')
  @Get(':id')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { attachment, stream } = await this.attachments.open(id);
    return sendFile(res, attachment.fileName, attachment.mimeType, stream, 'inline');
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.attachments.remove(id);
  }
}
