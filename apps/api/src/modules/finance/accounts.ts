import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DUES_INCOME_CODE, type CashAccountDto, type FinanceCategoryDto } from '@apartman/shared';
import {
  CashAccountCreateDto,
  CashAccountUpdateDto,
  FinanceCategoryCreateDto,
  FinanceCategoryUpdateDto,
} from '../../common/finance.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { accountBalances, ensureFinanceDefaults, lockedThrough } from './finance.ledger';

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<CashAccountDto[]> {
    const siteId = this.tenant.siteId;
    await ensureFinanceDefaults(this.prisma, siteId);
    const [accounts, balances] = await Promise.all([
      this.tenant.db.cashAccount.findMany({
        orderBy: [{ createdAt: 'asc' }, { kind: 'asc' }, { name: 'asc' }],
      }),
      accountBalances(this.prisma, siteId),
    ]);
    return accounts.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      kind: a.kind,
      openingBalanceKurus: a.openingBalanceKurus,
      balanceKurus: balances.get(a.id) ?? a.openingBalanceKurus,
      isActive: a.isActive,
    }));
  }

  async create(input: CashAccountCreateDto): Promise<CashAccountDto> {
    const account = await this.tenant.db.cashAccount.create({
      data: {
        siteId: this.tenant.siteId,
        name: input.name,
        kind: input.kind,
        openingBalanceKurus: input.openingBalanceKurus,
      },
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'CashAccount',
      entityId: account.id,
      after: input,
    });
    return this.one(account.id);
  }

  async update(id: string, input: CashAccountUpdateDto): Promise<CashAccountDto> {
    const before = await this.tenant.db.cashAccount.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Hesap bulunamadı');
    if (
      input.openingBalanceKurus !== undefined &&
      input.openingBalanceKurus !== before.openingBalanceKurus &&
      (await lockedThrough(this.prisma, this.tenant.siteId))
    ) {
      throw new BadRequestException('Kapatılmış ay varken açılış bakiyesi değiştirilemez');
    }
    await this.tenant.db.cashAccount.update({
      where: { id },
      data: {
        name: input.name,
        openingBalanceKurus: input.openingBalanceKurus,
        isActive: input.isActive,
      },
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'CashAccount',
      entityId: id,
      before,
      after: input,
    });
    return this.one(id);
  }

  private async one(id: string): Promise<CashAccountDto> {
    const account = (await this.list()).find((a) => a.id === id);
    if (!account) throw new NotFoundException('Hesap bulunamadı');
    return account;
  }
}

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<FinanceCategoryDto[]> {
    await ensureFinanceDefaults(this.prisma, this.tenant.siteId);
    const categories = await this.tenant.db.financeCategory.findMany({
      orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }, { name: 'asc' }],
    });
    return categories.map(toCategoryDto);
  }

  async create(input: FinanceCategoryCreateDto): Promise<FinanceCategoryDto> {
    const category = await this.tenant.db.financeCategory.create({
      data: { siteId: this.tenant.siteId, kind: input.kind, name: input.name },
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'FinanceCategory',
      entityId: category.id,
      after: input,
    });
    return toCategoryDto(category);
  }

  async update(id: string, input: FinanceCategoryUpdateDto): Promise<FinanceCategoryDto> {
    const before = await this.tenant.db.financeCategory.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Kategori bulunamadı');
    if (before.code === DUES_INCOME_CODE && input.isActive === false) {
      throw new BadRequestException('Aidat tahsilatı kategorisi pasif yapılamaz');
    }
    const category = await this.tenant.db.financeCategory.update({
      where: { id },
      data: { name: input.name, isActive: input.isActive },
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'FinanceCategory',
      entityId: id,
      before,
      after: input,
    });
    return toCategoryDto(category);
  }
}

function toCategoryDto(c: {
  id: string;
  code: string | null;
  kind: FinanceCategoryDto['kind'];
  name: string;
  isActive: boolean;
}): FinanceCategoryDto {
  return { id: c.id, code: c.code, kind: c.kind, name: c.name, isActive: c.isActive };
}

@ApiTags('Gelir-gider')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller()
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly categories: CategoriesService,
  ) {}

  @Get('cash-accounts')
  listAccounts(): Promise<CashAccountDto[]> {
    return this.accounts.list();
  }

  @Post('cash-accounts')
  createAccount(@Body() body: CashAccountCreateDto): Promise<CashAccountDto> {
    return this.accounts.create(body);
  }

  @Patch('cash-accounts/:id')
  updateAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CashAccountUpdateDto,
  ): Promise<CashAccountDto> {
    return this.accounts.update(id, body);
  }

  @Get('finance-categories')
  listCategories(): Promise<FinanceCategoryDto[]> {
    return this.categories.list();
  }

  @Post('finance-categories')
  createCategory(@Body() body: FinanceCategoryCreateDto): Promise<FinanceCategoryDto> {
    return this.categories.create(body);
  }

  @Patch('finance-categories/:id')
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: FinanceCategoryUpdateDto,
  ): Promise<FinanceCategoryDto> {
    return this.categories.update(id, body);
  }
}
