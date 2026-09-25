import { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

export const TENANT_MODELS: ReadonlySet<string> = new Set([
  'SiteMembership',
  'Block',
  'Unit',
  'Occupancy',
  'Invitation',
  'ChargeType',
  'DuesPlan',
  'Charge',
  'Payment',
  'PaymentAllocation',
  'CashAccount',
  'FinanceCategory',
  'Vendor',
  'Work',
  'Transaction',
  'Attachment',
  'MonthClosing',
  'Employee',
  'Shift',
  'Task',
  'TaskEvent',
  'RecurringTask',
  'Announcement',
  'AnnouncementRead',
  'MessageTemplate',
  'MessageCampaign',
  'MessageDelivery',
  'PaymentIntent',
]);

const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
]);

type Args = Record<string, unknown> & {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Record<string, unknown>[];
  create?: Record<string, unknown>;
};

export class MissingTenantContextError extends Error {
  constructor(model: string, operation: string) {
    super(`Site bağlamı olmadan ${model}.${operation} çalıştırılamaz`);
    this.name = 'MissingTenantContextError';
  }
}

export function scopeArgs(
  model: string,
  operation: string,
  args: unknown,
  siteId: string | undefined,
): unknown {
  if (!TENANT_MODELS.has(model)) return args;
  if (!siteId) throw new MissingTenantContextError(model, operation);

  const scoped: Args = { ...((args as Args | undefined) ?? {}) };

  if (WHERE_OPERATIONS.has(operation)) {
    scoped.where = { ...(scoped.where ?? {}), siteId };
  } else if (operation === 'create') {
    scoped.data = { ...(scoped.data as Record<string, unknown>), siteId };
  } else if (operation === 'createMany' || operation === 'createManyAndReturn') {
    const data = scoped.data;
    scoped.data = Array.isArray(data)
      ? data.map((row) => ({ ...row, siteId }))
      : { ...(data ?? {}), siteId };
  } else if (operation === 'upsert') {
    scoped.where = { ...(scoped.where ?? {}), siteId };
    scoped.create = { ...(scoped.create ?? {}), siteId };
  }

  return scoped;
}

export function createTenantClient(prisma: PrismaService, getSiteId: () => string | undefined) {
  return prisma.$extends(
    Prisma.defineExtension({
      name: 'tenant-scope',
      query: {
        $allModels: {
          $allOperations({ model, operation, args, query }) {
            return query(scopeArgs(model, operation, args, getSiteId()) as typeof args);
          },
        },
      },
    }),
  );
}

export type TenantClient = ReturnType<typeof createTenantClient>;
