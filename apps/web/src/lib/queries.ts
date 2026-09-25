import type {
  BlockDto,
  CashAccountDto,
  ClosingsDto,
  DashboardDto,
  FinanceCategoryDto,
  FinanceSummaryDto,
  TransactionDto,
  TransactionType,
  TransparencyDto,
  VendorDto,
  WorkDetailDto,
  WorkDto,
  ChargeDto,
  ChargeTypeDto,
  DebtReportRowDto,
  DuesPlanDto,
  DuesSettingsDto,
  MatrixDto,
  OccupancyDto,
  PaymentDto,
  SiteDto,
  UnitAccountDto,
  UnitDetailDto,
  UnitDto,
} from '@apartman/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch, errorMessage } from './api';
import { useSession } from './session';

export interface UnitFilters {
  blockId?: string;
  search?: string;
  archived?: 'include' | 'only';
}

export interface ChargeFilters {
  status: 'open' | 'overdue' | 'paid' | 'all';
  chargeTypeId?: string;
  blockId?: string;
  period?: string;
  unitId?: string;
}

export interface PaymentFilters {
  from?: string;
  to?: string;
  method?: string;
  unitId?: string;
}

export interface ResidentFilters {
  status: 'active' | 'past' | 'all';
  blockId?: string;
  search?: string;
}

function toQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const queryKeys = {
  sites: ['sites'] as const,
  blocks: (siteId: string | null) => ['blocks', siteId] as const,
  units: (siteId: string | null, filters: UnitFilters) => ['units', siteId, filters] as const,
  unit: (siteId: string | null, id: string) => ['unit', siteId, id] as const,
  residents: (siteId: string | null, filters: ResidentFilters) =>
    ['residents', siteId, filters] as const,
};

export function useSites() {
  const { accessToken } = useSession();
  return useQuery({
    queryKey: queryKeys.sites,
    queryFn: () => apiFetch<SiteDto[]>('/sites'),
    enabled: Boolean(accessToken),
  });
}

export function useBlocks() {
  const { siteId } = useSession();
  return useQuery({
    queryKey: queryKeys.blocks(siteId),
    queryFn: () => apiFetch<BlockDto[]>('/blocks'),
    enabled: Boolean(siteId),
  });
}

export function useUnits(filters: UnitFilters) {
  const { siteId } = useSession();
  return useQuery({
    queryKey: queryKeys.units(siteId, filters),
    queryFn: () => apiFetch<UnitDto[]>(`/units${toQuery({ ...filters })}`),
    enabled: Boolean(siteId),
    placeholderData: (previous) => previous,
  });
}

export function useUnit(id: string, siteIdOverride?: string) {
  const { siteId: activeSiteId } = useSession();
  const siteId = siteIdOverride ?? activeSiteId;
  return useQuery({
    queryKey: queryKeys.unit(siteId, id),
    queryFn: () => apiFetch<UnitDetailDto>(`/units/${id}`, { siteId }),
    enabled: Boolean(siteId),
  });
}

export function useResidents(filters: ResidentFilters) {
  const { siteId } = useSession();
  return useQuery({
    queryKey: queryKeys.residents(siteId, filters),
    queryFn: () => apiFetch<OccupancyDto[]>(`/residents${toQuery({ ...filters })}`),
    enabled: Boolean(siteId),
    placeholderData: (previous) => previous,
  });
}

function useSiteQuery<T>(key: string, path: string, extra: unknown = null, enabled = true) {
  const { siteId } = useSession();
  return useQuery({
    queryKey: [key, siteId, extra],
    queryFn: () => apiFetch<T>(path),
    enabled: Boolean(siteId) && enabled,
    placeholderData: (previous) => previous,
  });
}

export const useChargeTypes = () => useSiteQuery<ChargeTypeDto[]>('charge-types', '/charge-types');
export const useDuesPlans = () => useSiteQuery<DuesPlanDto[]>('dues-plans', '/dues/plans');
export const useDuesSettings = () =>
  useSiteQuery<DuesSettingsDto>('dues-settings', '/dues/settings');
export const useProportionalDues = () => useDuesSettings().data?.proportionalDues ?? false;
export const useDebtReport = () =>
  useSiteQuery<DebtReportRowDto[]>('debt-report', '/reports/debts');

export const useMatrix = (year: number, blockId?: string) =>
  useSiteQuery<MatrixDto>('matrix', `/dues/matrix${toQuery({ year: String(year), blockId })}`, {
    year,
    blockId,
  });

export const useCharges = (filters: ChargeFilters) =>
  useSiteQuery<ChargeDto[]>('charges', `/charges${toQuery({ ...filters })}`, filters);

export const usePayments = (filters: PaymentFilters) =>
  useSiteQuery<PaymentDto[]>('payments', `/payments${toQuery({ ...filters })}`, filters);

export function useUnitAccount(unitId: string | undefined, siteIdOverride?: string) {
  const { siteId: activeSiteId } = useSession();
  const siteId = siteIdOverride ?? activeSiteId;
  return useQuery({
    queryKey: ['account', siteId, unitId],
    queryFn: () => apiFetch<UnitAccountDto>(`/units/${unitId}/account`, { siteId }),
    enabled: Boolean(siteId) && Boolean(unitId),
    placeholderData: (previous) => previous,
  });
}

export const useDashboard = () => useSiteQuery<DashboardDto>('dashboard', '/dashboard');

export interface TransactionFilters {
  accountId?: string;
  type?: TransactionType;
  categoryId?: string;
  from?: string;
  to?: string;
  cancelled?: 'include' | 'only';
}

export const useCashAccounts = () =>
  useSiteQuery<CashAccountDto[]>('cash-accounts', '/cash-accounts');
export const useFinanceCategories = () =>
  useSiteQuery<FinanceCategoryDto[]>('finance-categories', '/finance-categories');
export const useVendors = () => useSiteQuery<VendorDto[]>('vendors', '/vendors');
export const useWorks = () => useSiteQuery<WorkDto[]>('works', '/works');
export const useWork = (id: string) => useSiteQuery<WorkDetailDto>('work', `/works/${id}`, id);
export const useTransactions = (filters: TransactionFilters) =>
  useSiteQuery<TransactionDto[]>(
    'transactions',
    `/transactions${toQuery({ ...filters })}`,
    filters,
  );
export const useFinanceSummary = (from: string, to: string) =>
  useSiteQuery<FinanceSummaryDto>('finance-summary', `/finance/summary${toQuery({ from, to })}`, {
    from,
    to,
  });
export const useClosings = () => useSiteQuery<ClosingsDto>('closings', '/finance/closings');
export const useTransparency = (year: number) =>
  useSiteQuery<TransparencyDto>('transparency', `/transparency?year=${year}`, year);

const SITE_SCOPED = new Set([
  'blocks',
  'units',
  'unit',
  'residents',
  'charge-types',
  'dues-plans',
  'dues-settings',
  'debt-report',
  'matrix',
  'charges',
  'payments',
  'account',
  'cash-accounts',
  'finance-categories',
  'vendors',
  'works',
  'work',
  'transactions',
  'finance-summary',
  'closings',
  'transparency',
  'dashboard',
]);

const isSiteData = (q: { queryKey: readonly unknown[] }) =>
  q.queryKey[0] === 'sites' || SITE_SCOPED.has(String(q.queryKey[0]));

export function useRefreshSiteData() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ predicate: isSiteData });
}

export function useApiMutation<TVariables, TResult>(
  fn: (variables: TVariables) => Promise<TResult>,
  options: {
    success?: string | ((result: TResult) => string);
    onSuccess?: (result: TResult) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ predicate: isSiteData });
      const message =
        typeof options.success === 'function' ? options.success(result) : options.success;
      if (message) toast.success(message);
      options.onSuccess?.(result);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
}
