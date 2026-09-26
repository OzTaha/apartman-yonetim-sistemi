import {
  type ArgumentsHost,
  BadRequestException,
  Body,
  Catch,
  Controller,
  type ExceptionFilter,
  HttpStatus,
  HttpCode,
  Injectable,
  Module,
  PayloadTooLargeException,
  Post,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  BANK_IMPORT_MAX_BYTES,
  BANK_IMPORT_MAX_ROWS,
  bankCommitSchema,
  bankMatchSchema,
  normalizeForMatch,
  unitLabel,
  type BankColumnMapping,
  type BankCommitResultDto,
  type BankMatchResultDto,
  type BankMatchRowDto,
  type BankParseResultDto,
} from '@apartman/shared';
import * as ExcelJSModule from 'exceljs';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { sha256 } from '../../common/crypto';
import { activeOn, dateOnly } from '../../common/dates';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { AccountService } from '../dues/account';
import { DuesModule } from '../dues/dues.module';
import { PaymentsService } from '../dues/payments';
import { loadSiteSettings } from '../dues/site-settings';
import { compareUnits } from '../residents/occupancy.mapper';

const ExcelJS = ((ExcelJSModule as unknown as { default?: typeof ExcelJSModule }).default ??
  ExcelJSModule) as typeof ExcelJSModule;

@Catch(PayloadTooLargeException)
class FileTooLargeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost) {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(HttpStatus.PAYLOAD_TOO_LARGE)
      .json({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        message: `Dosya en fazla ${BANK_IMPORT_MAX_BYTES / 1024 / 1024} MB olabilir`,
      });
  }
}

class BankMatchDto extends createZodDto(bankMatchSchema) {}
class BankCommitDto extends createZodDto(bankCommitSchema) {}

interface UploadedFileData {
  buffer: Buffer;
  originalname: string;
  size: number;
}

type Row = { date: string; description: string; amountKurus: number };

export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ''));
}

function cellText(value: ExcelJSModule.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((r) => r.text).join('');
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('result' in value) return cellText(value.result as ExcelJSModule.CellValue);
    return '';
  }
  return String(value).trim();
}

const HEADER_HINTS = {
  date: /tar[iİı]h|date/i,
  description: /a[cç][iİı]klama|description|detay/i,
  amount: /tutar|alacak|miktar|amount|giri[sş]/i,
};

export function findHeader(rows: string[][]): number {
  const index = rows
    .slice(0, 30)
    .findIndex(
      (r) => r.some((c) => HEADER_HINTS.date.test(c)) && r.some((c) => HEADER_HINTS.amount.test(c)),
    );
  return index === -1 ? 0 : index;
}

function guessMapping(headers: string[]): BankColumnMapping | null {
  const pick = (pattern: RegExp) => headers.find((h) => pattern.test(h));
  const date = pick(HEADER_HINTS.date);
  const description = pick(HEADER_HINTS.description);
  const amount = pick(HEADER_HINTS.amount);
  return date && description && amount ? { date, description, amount } : null;
}

export function unitPatterns(kind: 'APARTMENT' | 'SITE', blockName: string, number: string) {
  const n = normalizeForMatch(number);
  const b = normalizeForMatch(blockName);
  const unitWord = '(?:D|DA|DAIRE|DAIRESI|NO|NUMARA)';
  const patterns = [new RegExp(`(?:^| )${unitWord} ?${n}(?: |$)`)];
  if (kind === 'SITE') {
    patterns.push(
      new RegExp(`(?:^| )${b} ?(?:BLOK|BL)? ?(?:${unitWord})? ?${n}(?: |$)`),
      new RegExp(`(?:^| )${b}${n}(?: |$)`),
    );
  }
  return patterns;
}

@Injectable()
export class BankImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly accounts: AccountService,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
  ) {}

  async parse(file: UploadedFileData | undefined): Promise<BankParseResultDto> {
    if (!file?.buffer?.length) throw new BadRequestException('Dosya seçin');
    const buffer = file.buffer;
    let table: string[][];
    if (buffer.subarray(0, 2).toString() === 'PK') {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new BadRequestException('Dosyada sayfa bulunamadı');
      table = [];
      sheet.eachRow({ includeEmpty: false }, (row) => {
        const values = row.values as ExcelJSModule.CellValue[];
        table.push(values.slice(1).map(cellText));
      });
    } else if (buffer.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))) {
      throw new BadRequestException(
        'Eski Excel (.xls) dosyası okunamıyor. Dosyayı .xlsx veya .csv olarak kaydedip yükleyin.',
      );
    } else {
      const utf8 = buffer.toString('utf8');
      const text = utf8.includes('�') ? buffer.toString('latin1') : utf8;
      table = parseCsv(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
    }

    const headerIndex = findHeader(table);
    const raw = table[headerIndex] ?? [];
    const headers = raw.map((h, i) => h || `Sütun ${i + 1}`);
    const rows = table
      .slice(headerIndex + 1)
      .slice(0, BANK_IMPORT_MAX_ROWS)
      .map((r) => headers.map((_, i) => r[i] ?? ''));
    if (rows.length === 0) throw new BadRequestException('Dosyada hareket bulunamadı');

    const settings = await loadSiteSettings(this.prisma, this.tenant.siteId);
    const saved = settings.bankImport;
    const mapping =
      saved && [saved.date, saved.description, saved.amount].every((h) => headers.includes(h))
        ? saved
        : guessMapping(headers);
    return { headers, rows, mapping };
  }

  async match(input: BankMatchDto): Promise<BankMatchResultDto> {
    const kind = await this.tenant.siteKind();
    const [units, debts] = await Promise.all([
      this.tenant.db.unit.findMany({
        where: { archivedAt: null },
        include: {
          block: { select: { name: true } },
          occupancies: {
            where: activeOn(),
            select: { firstName: true, lastName: true },
          },
        },
      }),
      this.accounts.debtReport(),
    ]);
    const debtOf = new Map(debts.map((d) => [d.unitId, d.debtKurus]));
    const candidates = units
      .map((u) => ({
        id: u.id,
        blockName: u.block.name,
        number: u.number,
        label: unitLabel(kind, u.block.name, u.number),
        patterns: unitPatterns(kind, u.block.name, u.number),
        names: u.occupancies.map((o) => ({
          first: normalizeForMatch(o.firstName).split(' '),
          last: normalizeForMatch(o.lastName).split(' '),
        })),
      }))
      .sort(compareUnits);

    const withOccurrence = this.occurrences(input.rows);
    const known = await this.tenant.db.bankImportLine.findMany({
      where: { fingerprint: { in: withOccurrence.map((r) => this.fingerprint(r)) } },
      select: { fingerprint: true, status: true },
    });
    const statusOf = new Map(known.map((k) => [k.fingerprint, k.status]));

    const rows: BankMatchRowDto[] = withOccurrence.map((r, index) => {
      const text = ` ${normalizeForMatch(r.description)} `;
      const words = new Set(text.trim().split(' '));
      const byUnit = candidates.filter((c) => c.patterns.some((p) => p.test(text.trim())));
      const byName = candidates.filter((c) =>
        c.names.some((n) => [...n.first, ...n.last].every((w) => words.has(w))),
      );
      const both = byUnit.filter((c) => byName.includes(c));
      let unitId: string | null = null;
      let confidence: BankMatchRowDto['confidence'] = null;
      let reason: string | null = null;
      if (both.length === 1) {
        unitId = both[0]!.id;
        confidence = 'HIGH';
        reason = 'Açıklamada daire ve sakin adı geçiyor';
      } else if (byUnit.length === 1) {
        unitId = byUnit[0]!.id;
        confidence = 'HIGH';
        reason = 'Açıklamada daire numarası geçiyor';
      } else if (byName.length === 1) {
        unitId = byName[0]!.id;
        confidence = 'MEDIUM';
        reason = 'Açıklamada sakin adı geçiyor';
      } else if (byUnit.length + byName.length > 1) {
        reason = 'Birden fazla daire eşleşti; daireyi seçin';
      }
      return {
        index,
        date: r.date,
        description: r.description,
        amountKurus: r.amountKurus,
        occurrence: r.occurrence,
        status: statusOf.get(this.fingerprint(r)) ?? 'NEW',
        unitId,
        confidence,
        reason,
      };
    });

    return {
      rows,
      units: candidates.map((c) => ({
        unitId: c.id,
        label: c.label,
        debtKurus: debtOf.get(c.id) ?? 0,
      })),
    };
  }

  async commit(input: BankCommitDto): Promise<BankCommitResultDto> {
    const siteId = this.tenant.siteId;
    const result: BankCommitResultDto = { imported: 0, ignored: 0, totalKurus: 0, errors: [] };
    const exists = async (fingerprint: string) =>
      (await this.tenant.db.bankImportLine.count({ where: { fingerprint } })) > 0;

    for (const item of input.payments) {
      const fingerprint = this.fingerprint(item);
      if (await exists(fingerprint)) {
        result.errors.push({ ...this.brief(item), message: 'Bu hareket daha önce aktarılmış' });
        continue;
      }
      try {
        const payment = await this.payments.create({
          unitId: item.unitId,
          amountKurus: item.amountKurus,
          method: 'BANK_TRANSFER',
          accountId: input.accountId,
          paidAt: item.date,
          reference: item.description.slice(0, 100) || undefined,
          note: undefined,
          allocations: undefined,
        });
        await this.tenant.db.bankImportLine.create({
          data: { ...this.line(item, fingerprint, 'IMPORTED'), siteId, paymentId: payment.id },
        });
        result.imported++;
        result.totalKurus += item.amountKurus;
      } catch (error) {
        result.errors.push({
          ...this.brief(item),
          message: error instanceof Error ? error.message : 'Kaydedilemedi',
        });
      }
    }

    for (const item of input.ignore) {
      const fingerprint = this.fingerprint(item);
      if (await exists(fingerprint)) continue;
      await this.tenant.db.bankImportLine.create({
        data: { ...this.line(item, fingerprint, 'IGNORED'), siteId },
      });
      result.ignored++;
    }

    if (input.mapping) {
      const settings = await loadSiteSettings(this.prisma, siteId);
      await this.prisma.site.update({
        where: { id: siteId },
        data: { settings: { ...settings, bankImport: input.mapping } as Prisma.InputJsonValue },
      });
    }
    await this.audit.record({
      action: 'IMPORT',
      entityType: 'BankImport',
      entityId: siteId,
      after: {
        imported: result.imported,
        ignored: result.ignored,
        totalKurus: result.totalKurus,
        errors: result.errors.length,
      },
    });
    return result;
  }

  private occurrences(rows: Row[]) {
    const seen = new Map<string, number>();
    return rows.map((r) => {
      const key = `${r.date}|${r.amountKurus}|${normalizeForMatch(r.description)}`;
      const occurrence = seen.get(key) ?? 0;
      seen.set(key, occurrence + 1);
      return { ...r, occurrence };
    });
  }

  private fingerprint(r: Row & { occurrence: number }): string {
    return sha256(`${r.date}|${r.amountKurus}|${normalizeForMatch(r.description)}|${r.occurrence}`);
  }

  private line(r: Row, fingerprint: string, status: 'IMPORTED' | 'IGNORED') {
    return {
      fingerprint,
      date: dateOnly(r.date),
      amountKurus: r.amountKurus,
      description: r.description,
      status,
      createdById: this.tenant.userId ?? null,
    };
  }

  private brief(r: Row) {
    return { date: r.date, description: r.description, amountKurus: r.amountKurus };
  }
}

@ApiTags('Banka hareketleri')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('bank-imports')
export class BankImportController {
  constructor(private readonly imports: BankImportService) {}

  @Post('parse')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @UseFilters(FileTooLargeFilter)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: BANK_IMPORT_MAX_BYTES, files: 1 } }),
  )
  parse(@UploadedFile() file: UploadedFileData | undefined): Promise<BankParseResultDto> {
    return this.imports.parse(file);
  }

  @Post('match')
  @HttpCode(200)
  match(@Body() body: BankMatchDto): Promise<BankMatchResultDto> {
    return this.imports.match(body);
  }

  @Post('commit')
  @HttpCode(200)
  commit(@Body() body: BankCommitDto): Promise<BankCommitResultDto> {
    return this.imports.commit(body);
  }
}

@Module({
  imports: [DuesModule],
  controllers: [BankImportController],
  providers: [BankImportService],
})
export class BankImportModule {}
