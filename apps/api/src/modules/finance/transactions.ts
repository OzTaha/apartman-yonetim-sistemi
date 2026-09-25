import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { BulkCancelResultDto } from '@apartman/shared';
import { cancelEach } from '../../common/bulk';
import { DUES_INCOME_CODE, type TransactionDto } from '@apartman/shared';
import { dateOnly, toDateString, todayInIstanbul } from '../../common/dates';
import { BulkCancelDto, CancelDto } from '../../common/dues.dto';
import {
  TransactionCreateDto,
  TransactionListQueryDto,
  TransactionUpdateDto,
} from '../../common/finance.dto';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { assertDateOpen, lockedThrough } from './finance.ledger';
import { toTransactionDto, transactionInclude } from './finance.mapper';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
  ) {}

  async list(query: TransactionListQueryDto): Promise<TransactionDto[]> {
    const where: Prisma.TransactionWhereInput = {
      ...(query.cancelled === 'only'
        ? { cancelledAt: { not: null } }
        : query.cancelled === 'include'
          ? {}
          : { cancelledAt: null }),
      ...(query.accountId
        ? { OR: [{ accountId: query.accountId }, { toAccountId: query.accountId }] }
        : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.vendorId ? { vendorId: query.vendorId } : {}),
      ...(query.workId ? { workId: query.workId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: dateOnly(query.from) } : {}),
              ...(query.to ? { lte: dateOnly(query.to) } : {}),
            },
          }
        : {}),
    };
    const [rows, locked] = await Promise.all([
      this.tenant.db.transaction.findMany({
        where,
        include: transactionInclude,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 2000,
      }),
      lockedThrough(this.prisma, this.tenant.siteId),
    ]);
    return rows.map((t) => toTransactionDto(t, locked));
  }

  async get(id: string): Promise<TransactionDto> {
    const [row, locked] = await Promise.all([
      this.tenant.db.transaction.findUnique({ where: { id }, include: transactionInclude }),
      lockedThrough(this.prisma, this.tenant.siteId),
    ]);
    if (!row) throw new NotFoundException('Kayıt bulunamadı');
    return toTransactionDto(row, locked);
  }

  async create(input: TransactionCreateDto): Promise<TransactionDto> {
    if (input.date > todayInIstanbul()) {
      throw new BadRequestException('İleri tarihli kayıt girilemez');
    }
    const siteId = this.tenant.siteId;
    await assertDateOpen(this.prisma, siteId, input.date);
    await this.assertAccount(input.accountId);
    if (input.type === 'TRANSFER') await this.assertAccount(input.toAccountId!);

    let vendorId = input.vendorId ?? null;
    const employeeId = input.type === 'EXPENSE' ? (input.employeeId ?? null) : null;
    if (input.type !== 'TRANSFER') {
      await this.assertCategory(input.categoryId!, input.type);
      if (vendorId) await this.assertVendor(vendorId);
      if (employeeId) await this.assertEmployee(employeeId);
      if (input.workId) {
        const work = await this.tenant.db.work.findUnique({ where: { id: input.workId } });
        if (!work) throw new NotFoundException('İş bulunamadı');
        if (!employeeId) vendorId ??= work.vendorId;
      }
    }

    const isTransfer = input.type === 'TRANSFER';
    const created = await this.tenant.db.transaction.create({
      data: {
        siteId,
        type: input.type,
        amountKurus: input.amountKurus,
        date: dateOnly(input.date),
        accountId: input.accountId,
        toAccountId: isTransfer ? input.toAccountId! : null,
        categoryId: isTransfer ? null : input.categoryId!,
        vendorId: isTransfer ? null : vendorId,
        workId: input.type === 'EXPENSE' ? (input.workId ?? null) : null,
        employeeId,
        description: input.description ?? null,
        documentNo: isTransfer ? null : (input.documentNo ?? null),
        visibleToResidents: input.visibleToResidents ?? !employeeId,
        createdById: this.tenant.userId ?? null,
      },
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'Transaction',
      entityId: created.id,
      after: input,
    });
    return this.get(created.id);
  }

  async update(id: string, input: TransactionUpdateDto): Promise<TransactionDto> {
    const before = await this.editable(id);
    if (before.type === 'TRANSFER') {
      if (input.categoryId || input.vendorId || input.workId || input.employeeId) {
        throw new BadRequestException(
          'Transfer kaydına kategori, firma, iş veya çalışan bağlanamaz',
        );
      }
    } else {
      if (input.categoryId) await this.assertCategory(input.categoryId, before.type);
      if (input.vendorId) await this.assertVendor(input.vendorId);
      if (input.employeeId) {
        if (before.type !== 'EXPENSE') {
          throw new BadRequestException('Yalnızca gider bir çalışana bağlanabilir');
        }
        await this.assertEmployee(input.employeeId);
      }
      const vendorId = input.vendorId === undefined ? before.vendorId : input.vendorId;
      const employeeId = input.employeeId === undefined ? before.employeeId : input.employeeId;
      if (vendorId && employeeId) {
        throw new BadRequestException('Ödeme ya bir firmaya ya bir çalışana yapılır');
      }
      if (input.workId) {
        if (before.type !== 'EXPENSE') {
          throw new BadRequestException('Yalnızca gider bir işe bağlanabilir');
        }
        const work = await this.tenant.db.work.findUnique({ where: { id: input.workId } });
        if (!work) throw new NotFoundException('İş bulunamadı');
      }
    }

    await this.tenant.db.transaction.update({
      where: { id },
      data: {
        categoryId: input.categoryId,
        vendorId: input.vendorId,
        workId: input.workId,
        employeeId: input.employeeId,
        description: input.description === undefined ? undefined : input.description || null,
        documentNo: input.documentNo === undefined ? undefined : input.documentNo || null,
        visibleToResidents: input.visibleToResidents,
      },
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'Transaction',
      entityId: id,
      before,
      after: input,
    });
    return this.get(id);
  }

  async cancel(id: string, reason: string): Promise<TransactionDto> {
    const before = await this.editable(id);
    await this.tenant.db.transaction.update({
      where: { id },
      data: {
        cancelledAt: new Date(),
        cancelReason: reason,
        cancelledById: this.tenant.userId ?? null,
      },
    });
    await this.audit.record({
      action: 'CANCEL',
      entityType: 'Transaction',
      entityId: id,
      before,
      after: { reason },
    });
    return this.get(id);
  }

  private async editable(id: string) {
    const row = await this.tenant.db.transaction.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Kayıt bulunamadı');
    if (row.cancelledAt) throw new ConflictException('Bu kayıt iptal edilmiş');
    if (row.paymentId) {
      throw new BadRequestException(
        'Bu kayıt aidat tahsilatından oluştu. Değiştirmek için tahsilatı iptal edin.',
      );
    }
    await assertDateOpen(this.prisma, this.tenant.siteId, toDateString(row.date));
    return row;
  }

  private async assertAccount(id: string) {
    const account = await this.tenant.db.cashAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Hesap bulunamadı');
    if (!account.isActive) throw new BadRequestException(`${account.name} pasif durumda`);
  }

  private async assertCategory(id: string, type: 'INCOME' | 'EXPENSE') {
    const category = await this.tenant.db.financeCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Kategori bulunamadı');
    if (category.kind !== type) {
      throw new BadRequestException(
        type === 'INCOME'
          ? 'Gelir için gelir kategorisi seçin'
          : 'Gider için gider kategorisi seçin',
      );
    }
    if (category.code === DUES_INCOME_CODE) {
      throw new BadRequestException(
        'Aidat tahsilatı elle gelir olarak girilmez; ödemeyi Tahsilatlar ekranından kaydedin.',
      );
    }
    if (!category.isActive) throw new BadRequestException(`${category.name} pasif durumda`);
  }

  private async assertVendor(id: string) {
    const vendor = await this.tenant.db.vendor.findUnique({ where: { id } });
    if (!vendor) throw new NotFoundException('Firma bulunamadı');
  }

  private async assertEmployee(id: string) {
    const employee = await this.tenant.db.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException('Çalışan bulunamadı');
  }
}

@ApiTags('Gelir-gider')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  list(@Query() query: TransactionListQueryDto): Promise<TransactionDto[]> {
    return this.transactions.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<TransactionDto> {
    return this.transactions.get(id);
  }

  @Post()
  create(@Body() body: TransactionCreateDto): Promise<TransactionDto> {
    return this.transactions.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: TransactionUpdateDto,
  ): Promise<TransactionDto> {
    return this.transactions.update(id, body);
  }

  @Post('bulk-cancel')
  @HttpCode(200)
  bulkCancel(@Body() body: BulkCancelDto): Promise<BulkCancelResultDto> {
    return cancelEach(body.ids, (id) => this.transactions.cancel(id, body.reason));
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() body: CancelDto): Promise<TransactionDto> {
    return this.transactions.cancel(id, body.reason);
  }
}
