import {
  type ArgumentsHost,
  BadRequestException,
  Body,
  Catch,
  Controller,
  type ExceptionFilter,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  PayloadTooLargeException,
  Post,
  Res,
  type StreamableFile,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  IMPORT_SHEETS,
  importCommitSchema,
  importDebtRowSchema,
  importResidentRowSchema,
  importUnitRowSchema,
  parseTlToKurus,
  type ImportIssueDto,
  type ImportPreviewDto,
  type ImportResultDto,
  type ImportSheet,
  type SiteKind,
} from '@apartman/shared';
import * as ExcelJSModule from 'exceljs';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import type { z } from 'zod';
import { activeOn, dateOnly, todayInIstanbul } from '../../common/dates';
import { sendFile, XLSX } from '../../common/http';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { ChargeTypesService } from '../dues/charge-types';
import { DuesModule } from '../dues/dues.module';
import { activeDuesMethods, requiredUnitFields } from '../dues/site-settings';
import type { UploadedFileData } from '../finance/attachments';

const ExcelJS = ((ExcelJSModule as unknown as { default?: typeof ExcelJSModule }).default ??
  ExcelJSModule) as typeof ExcelJSModule;

class ImportCommitDto extends createZodDto(importCommitSchema) {}

const OPENING_CODE = 'OPENING';

type Cell = string;
type Columns = Record<string, string[]>;

const COLUMNS: Record<ImportSheet, Columns> = {
  units: {
    blockName: ['blok'],
    number: ['daire no', 'daire', 'daire numarası'],
    floor: ['kat'],
    areaM2: ['m²', 'm2', 'metrekare', 'alan'],
    landShare: ['arsa payı', 'arsa payi'],
  },
  residents: {
    blockName: ['blok'],
    number: ['daire no', 'daire', 'daire numarası'],
    firstName: ['ad', 'adı'],
    lastName: ['soyad', 'soyadı'],
    phone: ['telefon', 'cep telefonu'],
    email: ['e-posta', 'eposta', 'e posta', 'email'],
    type: ['malik / kiracı', 'malik/kiracı', 'tür', 'malik veya kiracı'],
    isResponsibleForDues: ['aidattan sorumlu', 'borçtan sorumlu'],
    contactConsent: ['sms izni', 'iletişim izni'],
    startDate: ['oturmaya başlama tarihi', 'başlangıç tarihi', 'taşınma tarihi'],
  },
  debts: {
    blockName: ['blok'],
    number: ['daire no', 'daire', 'daire numarası'],
    description: ['açıklama'],
    amount: ['tutar (tl)', 'tutar'],
    dueDate: ['son ödeme tarihi', 'vade'],
  },
};

const norm = (v: string) => v.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();

function cellText(value: ExcelJSModule.CellValue): Cell {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'evet' : 'hayır';
  if (typeof value === 'object') {
    if ('richText' in value)
      return value.richText
        .map((r) => r.text)
        .join('')
        .trim();
    if ('text' in value && typeof value.text === 'string') return value.text.trim();
    if ('result' in value) return cellText(value.result as ExcelJSModule.CellValue);
    return '';
  }
  return String(value).trim();
}

function toNumber(raw: Cell): number | null {
  if (!raw) return null;
  const cleaned = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : Number.NaN;
}

function toDate(raw: Cell, fallback?: string): string {
  if (!raw) return fallback ?? '';
  const tr = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(raw);
  if (tr) return `${tr[3]}-${tr[2]!.padStart(2, '0')}-${tr[1]!.padStart(2, '0')}`;
  return raw.slice(0, 10);
}

function toBool(raw: Cell, fallback: boolean): boolean | null {
  const v = norm(raw);
  if (!v) return fallback;
  if (['evet', 'e', 'var', '1', 'true', 'x'].includes(v)) return true;
  if (['hayır', 'hayir', 'h', 'yok', '0', 'false'].includes(v)) return false;
  return null;
}

function toType(raw: Cell): 'OWNER' | 'TENANT' | null {
  const v = norm(raw);
  if (['malik', 'ev sahibi', 'sahibi', 'mal sahibi'].includes(v)) return 'OWNER';
  if (['kiracı', 'kiraci'].includes(v)) return 'TENANT';
  return null;
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Geçersiz satır';
  const field = issue.path[0];
  const labels: Record<string, string> = {
    number: 'Daire no',
    firstName: 'Ad',
    lastName: 'Soyad',
    phone: 'Telefon',
    email: 'E-posta',
    startDate: 'Tarih',
    dueDate: 'Son ödeme tarihi',
    amountKurus: 'Tutar',
    floor: 'Kat',
    areaM2: 'm²',
    landShare: 'Arsa payı',
  };
  const label = typeof field === 'string' ? labels[field] : undefined;
  const unionMessages: Record<string, string> = {
    phone: 'Geçerli bir telefon numarası girin (ör. 0532 123 45 67)',
    email: 'Geçerli bir e-posta adresi girin',
  };
  const message =
    issue.code === 'invalid_union' && typeof field === 'string' && unionMessages[field]
      ? unionMessages[field]
      : issue.message;
  return label ? `${label}: ${message}` : message;
}

const unitKey = (blockName: string, number: string) => `${norm(blockName)}|${norm(number)}`;

@Injectable()
export class DataImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly chargeTypes: ChargeTypesService,
  ) {}

  async template(): Promise<Buffer> {
    const kind = await this.tenant.siteKind();
    const workbook = new ExcelJS.Workbook();
    const help = workbook.addWorksheet('Nasıl doldurulur');
    help.getColumn(1).width = 110;
    const lines = [
      'Bu dosyayla daireleri, sakinleri ve geçmişten kalan borçları tek seferde sisteme aktarırsınız.',
      '',
      '1. "Daireler" sayfasına her daireyi bir satıra yazın. Daire no zorunludur, diğerleri isteğe bağlıdır.',
      kind === 'SITE'
        ? '   Blok sütununa blok adını yazın (ör. A). Olmayan bloklar kendiliğinden oluşturulur.'
        : '   Apartmanda blok yoktur; yalnızca daire numarasını yazın.',
      '2. "Sakinler" sayfasına dairede oturan ev sahibi ve kiracıları yazın. Ad, soyad ve "Malik / Kiracı" zorunludur.',
      '   "Malik / Kiracı" sütununa Malik veya Kiracı yazın. Evet/Hayır sütunlarına Evet veya Hayır yazın.',
      '   Telefonu 0532 123 45 67 gibi yazabilirsiniz. "SMS izni" Evet ise sakine SMS gönderilebilir.',
      '3. "Devreden borçlar" sayfasına önceki dönemden kalan borçları yazın. Tutarı 1.500,00 gibi yazın.',
      '   Tarihleri 15.10.2026 gibi gün.ay.yıl olarak yazın.',
      '',
      'Kullanmadığınız sayfayı boş bırakabilirsiniz. Başlık satırlarını değiştirmeyin.',
      'Sistemde zaten olan daireler ve sakinler atlanır, değiştirilmez.',
      'Dosyayı yükleyince önce bir önizleme görürsünüz; hata varsa hangi satırda olduğu yazar. Onaylamadan hiçbir şey kaydedilmez.',
    ];
    lines.forEach((text, i) => {
      const cell = help.getCell(`A${i + 1}`);
      cell.value = text;
      if (i === 0) cell.font = { bold: true, size: 13 };
    });

    const addSheet = (name: string, headers: { title: string; width: number }[]) => {
      const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
      sheet.columns = headers.map((h) => ({ header: h.title, width: h.width }));
      const row = sheet.getRow(1);
      row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F4C81' } };
      return sheet;
    };
    const block = kind === 'SITE' ? [{ title: 'Blok', width: 10 }] : [];
    addSheet(IMPORT_SHEETS.units, [
      ...block,
      { title: 'Daire no', width: 12 },
      { title: 'Kat', width: 8 },
      { title: 'm²', width: 10 },
      { title: 'Arsa payı', width: 12 },
    ]);
    const residents = addSheet(IMPORT_SHEETS.residents, [
      ...block,
      { title: 'Daire no', width: 12 },
      { title: 'Ad', width: 16 },
      { title: 'Soyad', width: 16 },
      { title: 'Telefon', width: 18 },
      { title: 'E-posta', width: 26 },
      { title: 'Malik / Kiracı', width: 16 },
      { title: 'Aidattan sorumlu', width: 18 },
      { title: 'SMS izni', width: 12 },
      { title: 'Oturmaya başlama tarihi', width: 24 },
    ]);
    const offset = block.length;
    const list = (col: number, values: string) => {
      for (let r = 2; r <= IMPORT_MAX_ROWS + 1; r++) {
        residents.getCell(r, col).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${values}"`],
        };
      }
    };
    list(offset + 6, 'Malik,Kiracı');
    list(offset + 7, 'Evet,Hayır');
    list(offset + 8, 'Evet,Hayır');
    addSheet(IMPORT_SHEETS.debts, [
      ...block,
      { title: 'Daire no', width: 12 },
      { title: 'Açıklama', width: 30 },
      { title: 'Tutar (TL)', width: 14 },
      { title: 'Son ödeme tarihi', width: 18 },
    ]);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async preview(file: UploadedFileData | undefined): Promise<ImportPreviewDto> {
    if (!file?.buffer?.length) throw new BadRequestException('Dosya seçin');
    if (file.buffer.subarray(0, 2).toString() !== 'PK') {
      throw new BadRequestException(
        'Dosya okunamadı. Lütfen indirdiğiniz şablonu doldurup .xlsx olarak kaydedin.',
      );
    }
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(file.buffer as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException('Dosya okunamadı. Excel dosyası (.xlsx) yükleyin.');
    }
    const errors: ImportIssueDto[] = [];
    const read = (sheet: ImportSheet) => this.readSheet(workbook, sheet, errors);
    const today = todayInIstanbul();

    const units = read('units').flatMap(({ row, get }) => {
      const nums = {
        floor: toNumber(get('floor')),
        areaM2: toNumber(get('areaM2')),
        landShare: toNumber(get('landShare')),
      };
      const bad = Object.entries(nums).find(([, v]) => Number.isNaN(v));
      if (bad) {
        errors.push({
          sheet: 'units',
          row,
          message: `${bad[0] === 'floor' ? 'Kat' : bad[0] === 'areaM2' ? 'm²' : 'Arsa payı'} sayı olmalıdır`,
        });
        return [];
      }
      const parsed = importUnitRowSchema.safeParse({
        row,
        blockName: get('blockName'),
        number: get('number'),
        ...nums,
      });
      if (!parsed.success) {
        errors.push({ sheet: 'units', row, message: firstIssue(parsed.error) });
        return [];
      }
      return [parsed.data];
    });

    const residents = read('residents').flatMap(({ row, get }) => {
      const type = toType(get('type'));
      if (!type) {
        errors.push({
          sheet: 'residents',
          row,
          message: '"Malik / Kiracı" sütununa Malik veya Kiracı yazın',
        });
        return [];
      }
      const responsible = toBool(get('isResponsibleForDues'), true);
      const consent = toBool(get('contactConsent'), false);
      if (responsible === null || consent === null) {
        errors.push({
          sheet: 'residents',
          row,
          message: 'Evet/Hayır sütunlarına yalnızca Evet veya Hayır yazın',
        });
        return [];
      }
      const parsed = importResidentRowSchema.safeParse({
        row,
        blockName: get('blockName'),
        number: get('number'),
        firstName: get('firstName'),
        lastName: get('lastName'),
        phone: get('phone'),
        email: get('email'),
        type,
        isResponsibleForDues: responsible,
        contactConsent: consent,
        startDate: toDate(get('startDate'), today),
      });
      if (!parsed.success) {
        errors.push({ sheet: 'residents', row, message: firstIssue(parsed.error) });
        return [];
      }
      return [parsed.data];
    });

    const debts = read('debts').flatMap(({ row, get }) => {
      let amountKurus: number;
      try {
        const raw = get('amount');
        amountKurus = /^\d+(\.\d+)?$/.test(raw)
          ? Math.round(Number(raw) * 100)
          : parseTlToKurus(raw);
      } catch {
        errors.push({
          sheet: 'debts',
          row,
          message: 'Tutar: geçerli bir tutar yazın (ör. 1.500,00)',
        });
        return [];
      }
      const parsed = importDebtRowSchema.safeParse({
        row,
        blockName: get('blockName'),
        number: get('number'),
        description: get('description'),
        amountKurus,
        dueDate: toDate(get('dueDate')),
      });
      if (!parsed.success) {
        errors.push({ sheet: 'debts', row, message: firstIssue(parsed.error) });
        return [];
      }
      return [parsed.data];
    });

    const checked = await this.check({ units, residents, debts });
    return { ...checked, errors: [...errors, ...checked.errors].sort((a, b) => a.row - b.row) };
  }

  async commit(input: ImportCommitDto): Promise<ImportResultDto> {
    const checked = await this.check(input);
    if (checked.errors.length > 0) {
      const first = checked.errors[0]!;
      throw new BadRequestException(
        `${IMPORT_SHEETS[first.sheet]} sayfası ${first.row}. satır: ${first.message}`,
      );
    }
    const siteId = this.tenant.siteId;
    const kind = await this.tenant.siteKind();
    await this.chargeTypes.ensureDefaults(siteId);
    const openingType = await this.prisma.chargeType.findUniqueOrThrow({
      where: { siteId_code: { siteId, code: OPENING_CODE } },
      select: { id: true },
    });
    const today = todayInIstanbul();

    const result = await this.tenant.db.$transaction(async (tx) => {
      const blocks = await tx.block.findMany({ select: { id: true, name: true } });
      const blockIds = new Map(blocks.map((b) => [norm(b.name), b.id]));
      const defaultBlock = blocks[0]?.id;
      const blockFor = async (name: string) => {
        if (kind === 'APARTMENT') {
          if (!defaultBlock) throw new BadRequestException('Apartmanın binası bulunamadı');
          return defaultBlock;
        }
        const key = norm(name);
        const found = blockIds.get(key);
        if (found) return found;
        const created = await tx.block.create({ data: { siteId, name: name.trim() } });
        blockIds.set(key, created.id);
        return created.id;
      };

      for (const u of checked.units) {
        await tx.unit.create({
          data: {
            siteId,
            blockId: await blockFor(u.blockName),
            number: u.number,
            floor: u.floor,
            areaM2: u.areaM2,
            landShare: u.landShare,
          },
        });
      }
      const units = await tx.unit.findMany({
        where: { archivedAt: null },
        select: { id: true, number: true, block: { select: { name: true } } },
      });
      const unitIds = new Map(
        units.map((u) => [unitKey(kind === 'APARTMENT' ? '' : u.block.name, u.number), u.id]),
      );
      const unitFor = (r: { blockName: string; number: string }) =>
        unitIds.get(unitKey(kind === 'APARTMENT' ? '' : r.blockName, r.number))!;

      for (const r of checked.residents) {
        await tx.occupancy.create({
          data: {
            siteId,
            unitId: unitFor(r),
            firstName: r.firstName,
            lastName: r.lastName,
            phone: r.phone ?? null,
            email: r.email ?? null,
            type: r.type,
            startDate: dateOnly(r.startDate),
            isResponsibleForDues: r.isResponsibleForDues,
            contactConsent: r.contactConsent,
            contactConsentAt: r.contactConsent ? new Date() : null,
          },
        });
      }
      for (const d of checked.debts) {
        await tx.charge.create({
          data: {
            siteId,
            unitId: unitFor(d),
            chargeTypeId: openingType.id,
            description: d.description || null,
            amountKurus: d.amountKurus,
            issueDate: dateOnly(today < d.dueDate ? today : d.dueDate),
            dueDate: dateOnly(d.dueDate),
            createdById: this.tenant.userId ?? null,
          },
        });
      }
      return {
        units: checked.units.length,
        residents: checked.residents.length,
        debts: checked.debts.length,
        debtKurus: checked.debts.reduce((sum, d) => sum + d.amountKurus, 0),
      };
    });

    await this.audit.record({
      action: 'IMPORT',
      entityType: 'Site',
      entityId: siteId,
      after: result,
    });
    return result;
  }

  private readSheet(
    workbook: InstanceType<typeof ExcelJS.Workbook>,
    sheet: ImportSheet,
    errors: ImportIssueDto[],
  ): { row: number; get: (field: string) => Cell }[] {
    const ws = workbook.worksheets.find((w) => norm(w.name) === norm(IMPORT_SHEETS[sheet]));
    if (!ws) return [];
    const header = ((ws.getRow(1).values as ExcelJSModule.CellValue[]) ?? []).map((v) =>
      norm(cellText(v)),
    );
    const columns = COLUMNS[sheet];
    const index: Record<string, number> = {};
    for (const [field, names] of Object.entries(columns)) {
      const i = header.findIndex((h) => names.includes(h));
      if (i > 0) index[field] = i;
    }
    if (index['number'] === undefined) {
      errors.push({ sheet, row: 1, message: 'Başlık satırında "Daire no" sütunu bulunamadı' });
      return [];
    }
    const rows: { row: number; get: (field: string) => Cell }[] = [];
    ws.eachRow({ includeEmpty: false }, (r, rowNumber) => {
      if (rowNumber === 1) return;
      const values = r.values as ExcelJSModule.CellValue[];
      const get = (field: string) => {
        const i = index[field];
        return i === undefined ? '' : cellText(values[i]);
      };
      if (Object.keys(index).every((f) => get(f) === '')) return;
      rows.push({ row: rowNumber, get });
    });
    if (rows.length > IMPORT_MAX_ROWS) {
      errors.push({
        sheet,
        row: 1,
        message: `Bir sayfada en fazla ${IMPORT_MAX_ROWS} satır olabilir`,
      });
      return [];
    }
    return rows;
  }

  private async check(input: {
    units: ImportPreviewDto['units'];
    residents: ImportPreviewDto['residents'];
    debts: ImportPreviewDto['debts'];
  }): Promise<Omit<ImportPreviewDto, 'errors'> & { errors: ImportIssueDto[] }> {
    const kind: SiteKind = await this.tenant.siteKind();
    const errors: ImportIssueDto[] = [];
    const skipped: ImportIssueDto[] = [];
    const ref = (r: { blockName: string; number: string }) =>
      unitKey(kind === 'APARTMENT' ? '' : r.blockName, r.number);
    const label = (r: { blockName: string; number: string }) =>
      kind === 'APARTMENT' || !r.blockName
        ? `Daire ${r.number}`
        : `${r.blockName} Blok · Daire ${r.number}`;

    const existing = await this.tenant.db.unit.findMany({
      select: {
        id: true,
        number: true,
        archivedAt: true,
        block: { select: { name: true } },
        occupancies: {
          where: activeOn(),
          select: { firstName: true, lastName: true },
        },
      },
    });
    const existingUnits = new Map(
      existing.map((u) => [unitKey(kind === 'APARTMENT' ? '' : u.block.name, u.number), u]),
    );
    const required = requiredUnitFields(
      (await activeDuesMethods(this.prisma, this.tenant.siteId)).all,
    );

    const seenUnits = new Set<string>();
    const units = input.units.filter((u) => {
      if (kind === 'SITE' && !u.blockName) {
        errors.push({ sheet: 'units', row: u.row, message: 'Blok adını yazın' });
        return false;
      }
      const key = ref(u);
      if (seenUnits.has(key)) {
        errors.push({
          sheet: 'units',
          row: u.row,
          message: `${label(u)} dosyada iki kez yazılmış`,
        });
        return false;
      }
      seenUnits.add(key);
      if (existingUnits.has(key)) {
        skipped.push({ sheet: 'units', row: u.row, message: `${label(u)} sistemde zaten var` });
        return false;
      }
      const missing = required.find((f) => u[f] == null);
      if (missing) {
        errors.push({
          sheet: 'units',
          row: u.row,
          message:
            missing === 'areaM2'
              ? 'Aidat m²’ye göre dağıtıldığı için m² yazılmalıdır'
              : 'Aidat arsa payına göre dağıtıldığı için arsa payı yazılmalıdır',
        });
        return false;
      }
      return true;
    });
    const newUnits = new Set(units.map(ref));
    const unitExists = (r: { blockName: string; number: string }) => {
      const key = ref(r);
      const found = existingUnits.get(key);
      return newUnits.has(key) || (found !== undefined && found.archivedAt === null);
    };

    const seenResidents = new Set<string>();
    const residents = input.residents.filter((r) => {
      if (!unitExists(r)) {
        errors.push({
          sheet: 'residents',
          row: r.row,
          message: `${label(r)} bulunamadı. Önce "Daireler" sayfasına ekleyin.`,
        });
        return false;
      }
      const name = `${norm(r.firstName)} ${norm(r.lastName)}`;
      const key = `${ref(r)}|${name}`;
      const current = existingUnits.get(ref(r));
      if (
        seenResidents.has(key) ||
        current?.occupancies.some((o) => `${norm(o.firstName)} ${norm(o.lastName)}` === name)
      ) {
        skipped.push({
          sheet: 'residents',
          row: r.row,
          message: `${r.firstName} ${r.lastName} (${label(r)}) zaten kayıtlı`,
        });
        return false;
      }
      seenResidents.add(key);
      return true;
    });

    const debts = input.debts.filter((d) => {
      if (!unitExists(d)) {
        errors.push({
          sheet: 'debts',
          row: d.row,
          message: `${label(d)} bulunamadı. Önce "Daireler" sayfasına ekleyin.`,
        });
        return false;
      }
      return true;
    });

    return { units, residents, debts, skipped, errors };
  }
}

@Catch(PayloadTooLargeException)
class ImportTooLargeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost) {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(HttpStatus.PAYLOAD_TOO_LARGE)
      .json({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        message: `Dosya en fazla ${IMPORT_MAX_BYTES / 1024 / 1024} MB olabilir`,
      });
  }
}

@ApiTags('Toplu aktarma')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('imports')
export class DataImportController {
  constructor(private readonly imports: DataImportService) {}

  @Get('template.xlsx')
  async template(@Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    return sendFile(res, 'toplu-aktarma-sablonu.xlsx', XLSX, await this.imports.template());
  }

  @Post('preview')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @UseFilters(ImportTooLargeFilter)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: IMPORT_MAX_BYTES, files: 1 } }))
  preview(@UploadedFile() file: UploadedFileData | undefined): Promise<ImportPreviewDto> {
    return this.imports.preview(file);
  }

  @Post('commit')
  @HttpCode(200)
  commit(@Body() body: ImportCommitDto): Promise<ImportResultDto> {
    return this.imports.commit(body);
  }
}

@Module({
  imports: [DuesModule],
  controllers: [DataImportController],
  providers: [DataImportService],
})
export class DataImportModule {}
