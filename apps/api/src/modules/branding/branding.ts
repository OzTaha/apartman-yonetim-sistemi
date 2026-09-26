import {
  type ArgumentsHost,
  BadRequestException,
  Body,
  Catch,
  Controller,
  Delete,
  type ExceptionFilter,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  NotFoundException,
  PayloadTooLargeException,
  Post,
  Put,
  Res,
  type StreamableFile,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  brandingSchema,
  DEFAULT_APP_NAME,
  LOGO_MAX_BYTES,
  LOGO_MAX_SIZE,
  LOGO_MIN_SIZE,
  type ApiErrorBody,
  type BrandingDto,
} from '@apartman/shared';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { randomUUID } from 'node:crypto';
import { Public } from '../../common/auth-user';
import { sendFile } from '../../common/http';
import { PlatformAdminOnly } from '../../common/platform-admin.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { UploadedFileData } from '../finance/attachments';
import { FinanceModule } from '../finance/finance.module';
import { FileStorage } from '../finance/storage';

class BrandingBody extends createZodDto(brandingSchema) {}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function pngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24 || !PNG_SIGNATURE.every((b, i) => buf[i] === b)) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

@Catch(PayloadTooLargeException)
class LogoTooLargeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost) {
    const body: ApiErrorBody = {
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      message: 'Logo en fazla 1 MB olabilir',
    };
    host.switchToHttp().getResponse<Response>().status(body.statusCode).json(body);
  }
}

@Injectable()
export class BrandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: FileStorage,
  ) {}

  async get(): Promise<BrandingDto> {
    const row = await this.prisma.branding.findUnique({ where: { id: 1 } });
    return {
      appName: row?.appName ?? DEFAULT_APP_NAME,
      logoUrl: row?.logoKey ? `/api/branding/logo?v=${row.updatedAt.getTime()}` : null,
    };
  }

  async update(input: BrandingBody): Promise<BrandingDto> {
    const before = await this.get();
    await this.prisma.branding.upsert({
      where: { id: 1 },
      create: { id: 1, appName: input.appName },
      update: { appName: input.appName },
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'Branding',
      entityId: '1',
      siteId: null,
      before,
      after: input,
    });
    return this.get();
  }

  async uploadLogo(file: UploadedFileData | undefined): Promise<BrandingDto> {
    if (!file?.buffer?.length) throw new BadRequestException('Logo dosyası seçin');
    const size = pngSize(file.buffer);
    if (!size) throw new BadRequestException('Logo PNG biçiminde olmalıdır');
    if (size.width !== size.height || size.width < LOGO_MIN_SIZE || size.width > LOGO_MAX_SIZE) {
      throw new BadRequestException(
        `Logo kare olmalı ve ${LOGO_MIN_SIZE}–${LOGO_MAX_SIZE} piksel arasında olmalıdır`,
      );
    }
    const key = `branding/${randomUUID()}.png`;
    await this.storage.save(key, file.buffer);
    const before = await this.prisma.branding.findUnique({ where: { id: 1 } });
    await this.prisma.branding.upsert({
      where: { id: 1 },
      create: { id: 1, appName: DEFAULT_APP_NAME, logoKey: key },
      update: { logoKey: key },
    });
    if (before?.logoKey) await this.storage.remove(before.logoKey);
    await this.audit.record({
      action: 'UPLOAD_LOGO',
      entityType: 'Branding',
      entityId: '1',
      siteId: null,
      after: { width: size.width, bytes: file.size },
    });
    return this.get();
  }

  async removeLogo(): Promise<BrandingDto> {
    const row = await this.prisma.branding.findUnique({ where: { id: 1 } });
    if (row?.logoKey) {
      await this.prisma.branding.update({ where: { id: 1 }, data: { logoKey: null } });
      await this.storage.remove(row.logoKey);
      await this.audit.record({
        action: 'DELETE_LOGO',
        entityType: 'Branding',
        entityId: '1',
        siteId: null,
      });
    }
    return this.get();
  }

  async logo() {
    const row = await this.prisma.branding.findUnique({ where: { id: 1 } });
    if (!row?.logoKey) throw new NotFoundException('Logo yüklenmemiş');
    return this.storage.open(row.logoKey);
  }

  async manifest() {
    const branding = await this.get();
    const icons = branding.logoUrl
      ? [{ src: branding.logoUrl, sizes: '512x512', type: 'image/png', purpose: 'any' }]
      : [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ];
    return {
      name: branding.appName,
      short_name: branding.appName,
      lang: 'tr',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#18181b',
      icons,
    };
  }
}

@ApiTags('Marka')
@Controller('branding')
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  @Public()
  @Get()
  get(): Promise<BrandingDto> {
    return this.branding.get();
  }

  @Public()
  @Get('manifest.webmanifest')
  @Header('Content-Type', 'application/manifest+json; charset=utf-8')
  @Header('Cache-Control', 'no-cache')
  manifest() {
    return this.branding.manifest();
  }

  @Public()
  @Get('logo')
  @Header('Cache-Control', 'public, max-age=86400')
  async logo(@Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    return sendFile(res, 'logo.png', 'image/png', await this.branding.logo(), 'inline');
  }

  @ApiBearerAuth()
  @PlatformAdminOnly()
  @Put()
  update(@Body() body: BrandingBody): Promise<BrandingDto> {
    return this.branding.update(body);
  }

  @ApiBearerAuth()
  @PlatformAdminOnly()
  @Post('logo')
  @ApiConsumes('multipart/form-data')
  @UseFilters(LogoTooLargeFilter)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: LOGO_MAX_BYTES, files: 1 } }))
  uploadLogo(@UploadedFile() file: UploadedFileData | undefined): Promise<BrandingDto> {
    return this.branding.uploadLogo(file);
  }

  @ApiBearerAuth()
  @PlatformAdminOnly()
  @Delete('logo')
  @HttpCode(200)
  removeLogo(): Promise<BrandingDto> {
    return this.branding.removeLogo();
  }
}

@Module({
  imports: [FinanceModule],
  controllers: [BrandingController],
  providers: [BrandingService],
})
export class BrandingModule {}
