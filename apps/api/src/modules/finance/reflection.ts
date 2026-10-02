import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DistributionError, splitTotal, type ExpenseReflectionDto } from '@apartman/shared';
import { dateOnly } from '../../common/dates';
import type { ExpenseReflectDto } from '../../common/finance.dto';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TenantContext } from '../../tenancy/tenancy';
import { assertMethodAllowed, loadSiteSettings } from '../dues/site-settings';
import { compareUnits } from '../residents/occupancy.mapper';

export interface ReflectionSource {
  blockId: string | null;
  amountKurus: number;
  description: string | null;
}

export async function planReflection(
  prisma: PrismaService,
  tenant: TenantContext,
  source: ReflectionSource,
  input: ExpenseReflectDto,
) {
  const type = await tenant.db.chargeType.findUnique({ where: { id: input.chargeTypeId } });
  if (!type || !type.isActive) throw new NotFoundException('Borç türü bulunamadı');
  assertMethodAllowed(await loadSiteSettings(prisma, tenant.siteId), input.method);

  const units = (
    await tenant.db.unit.findMany({
      where: { archivedAt: null, ...(source.blockId ? { blockId: source.blockId } : {}) },
      include: { block: { select: { name: true } } },
    })
  )
    .map((u) => ({
      id: u.id,
      label: `${u.block.name}-${u.number}`,
      areaM2: u.areaM2,
      landShare: u.landShare,
      blockName: u.block.name,
      number: u.number,
    }))
    .sort(compareUnits);
  if (units.length === 0) throw new BadRequestException('Borç yazılacak daire yok');

  let amounts: number[];
  try {
    amounts = splitTotal(input.method, source.amountKurus, units);
  } catch (error) {
    if (error instanceof DistributionError) throw new BadRequestException(error.message);
    throw error;
  }

  return units
    .map((u, i) => ({
      unitId: u.id,
      chargeTypeId: type.id,
      amountKurus: amounts[i]!,
      issueDate: dateOnly(input.issueDate),
      dueDate: dateOnly(input.dueDate),
      description: input.description ?? source.description,
      createdById: tenant.userId ?? null,
    }))
    .filter((row) => row.amountKurus > 0);
}

type ReflectedCharge = { amountKurus: number; allocations: { amountKurus: number }[] };

export function summarizeReflection(charges: ReflectedCharge[]): ExpenseReflectionDto | null {
  if (charges.length === 0) return null;
  return {
    chargeCount: charges.length,
    totalKurus: charges.reduce((sum, c) => sum + c.amountKurus, 0),
    paidKurus: charges.reduce(
      (sum, c) => sum + c.allocations.reduce((s, a) => s + a.amountKurus, 0),
      0,
    ),
  };
}

export function assertNoPaidCharges(
  charges: { _count: { allocations: number } }[],
  message: string,
) {
  if (charges.some((c) => c._count.allocations > 0)) throw new ConflictException(message);
}
