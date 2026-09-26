import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export interface RowSelection<T> {
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
  canSelect?: (row: T) => boolean;
  label?: (row: T) => string;
}

interface DataTableProps<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[];
  data: T[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  mobileCard?: (row: T) => ReactNode;
  empty?: ReactNode;
  selection?: RowSelection<T>;
}

const PAGE_SIZES = [15, 20, 25, 30, 40] as const;
const DEFAULT_PAGE_SIZE = 20;

const pageSizeKey = () =>
  `apartman.pageSize.${window.location.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id')}`;

function storedPageSize(): number {
  try {
    const value = Number(localStorage.getItem(pageSizeKey()));
    return (PAGE_SIZES as readonly number[]).includes(value) ? value : DEFAULT_PAGE_SIZE;
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
}

function storePageSize(size: number) {
  try {
    localStorage.setItem(pageSizeKey(), String(size));
  } catch {
    return;
  }
}

function RowCheckbox<T>({
  row,
  id,
  selection,
}: {
  row: T;
  id: string;
  selection: RowSelection<T>;
}) {
  const enabled = selection.canSelect?.(row) ?? true;
  return (
    <Checkbox
      aria-label={`${selection.label?.(row) ?? 'Kayıt'} seç`}
      disabled={!enabled}
      checked={enabled && selection.selected.has(id)}
      onClick={(e) => e.stopPropagation()}
      onCheckedChange={(value) => {
        const next = new Set(selection.selected);
        if (value === true) next.add(id);
        else next.delete(id);
        selection.onChange(next);
      }}
    />
  );
}

function Pager({
  total,
  pagination,
  pageCount,
  onChange,
}: {
  total: number;
  pagination: PaginationState;
  pageCount: number;
  onChange: (next: PaginationState) => void;
}) {
  const first = pagination.pageIndex * pagination.pageSize + 1;
  const last = Math.min(total, first + pagination.pageSize - 1);
  return (
    <nav
      aria-label="Sayfalama"
      className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"
    >
      <div className="flex items-center gap-2">
        <span className="whitespace-nowrap">Sayfa başına</span>
        <Select
          value={String(pagination.pageSize)}
          onValueChange={(v) => onChange({ pageIndex: 0, pageSize: Number(v) })}
        >
          <SelectTrigger size="sm" className="w-18" aria-label="Sayfa başına satır">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <span className="whitespace-nowrap tabular-nums">
          {first}–{last} / {total}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          aria-label="Önceki sayfa"
          disabled={pagination.pageIndex === 0}
          onClick={() => onChange({ ...pagination, pageIndex: pagination.pageIndex - 1 })}
        >
          <ChevronLeft />
        </Button>
        <span className="tabular-nums">
          {pagination.pageIndex + 1} / {pageCount}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          aria-label="Sonraki sayfa"
          disabled={pagination.pageIndex >= pageCount - 1}
          onClick={() => onChange({ ...pagination, pageIndex: pagination.pageIndex + 1 })}
        >
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}

export function DataTable<T>({
  columns,
  data,
  getRowId,
  onRowClick,
  mobileCard,
  empty,
  selection,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>(() => ({
    pageIndex: 0,
    pageSize: storedPageSize(),
  }));
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (data.length === 0 && empty) return <>{empty}</>;
  const rows = table.getRowModel().rows;
  const pageCount = Math.max(1, table.getPageCount());
  const current = { ...pagination, pageIndex: Math.min(pagination.pageIndex, pageCount - 1) };
  const changePage = (next: PaginationState) => {
    if (next.pageSize !== pagination.pageSize) storePageSize(next.pageSize);
    setPagination(next);
  };

  const selectable = (row: T) => selection?.canSelect?.(row) ?? true;
  const allIds = selection ? data.filter(selectable).map(getRowId) : [];
  const pageIds = selection ? rows.filter((r) => selectable(r.original)).map((r) => r.id) : [];
  const pageSelected = pageIds.filter((id) => selection?.selected.has(id)).length;
  const totalSelected = allIds.filter((id) => selection?.selected.has(id)).length;
  const pageState =
    pageSelected === 0
      ? false
      : pageSelected === pageIds.length
        ? true
        : ('indeterminate' as const);
  const togglePage = (value: boolean) => {
    if (!selection) return;
    const next = new Set(selection.selected);
    for (const id of pageIds) {
      if (value) next.add(id);
      else next.delete(id);
    }
    selection.onChange(next);
  };

  const selectPage = selection && pageIds.length > 0 && (
    <Checkbox
      aria-label="Sayfadakilerin tümünü seç"
      checked={pageState}
      onCheckedChange={(value) => togglePage(value === true)}
    />
  );

  const selectAllBanner = selection &&
    pageIds.length > 0 &&
    pageSelected === pageIds.length &&
    allIds.length > pageIds.length && (
      <div className="flex flex-wrap items-center justify-center gap-x-2 rounded-md bg-muted px-3 py-2 text-sm">
        {totalSelected === allIds.length ? (
          <>
            <span>{allIds.length} kaydın tümü seçildi.</span>
            <Button
              variant="link"
              className="h-auto p-0"
              onClick={() => selection.onChange(new Set())}
            >
              Seçimi temizle
            </Button>
          </>
        ) : (
          <>
            <span>Bu sayfadaki {pageIds.length} kayıt seçildi.</span>
            <Button
              variant="link"
              className="h-auto p-0"
              onClick={() => selection.onChange(new Set([...selection.selected, ...allIds]))}
            >
              Listedeki {allIds.length} kaydın tümünü seç
            </Button>
          </>
        )}
      </div>
    );

  const pager = data.length > PAGE_SIZES[0] && (
    <Pager total={data.length} pagination={current} pageCount={pageCount} onChange={changePage} />
  );

  return (
    <div className="grid gap-3">
      {selectAllBanner}
      {mobileCard && (
        <div className="grid gap-2 md:hidden">
          {selectPage && (
            <label className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
              {selectPage}
              Sayfadakilerin tümünü seç
            </label>
          )}
          <ul className="grid gap-2">
            {rows.map((row) => {
              const card = onRowClick ? (
                <div
                  role="link"
                  tabIndex={0}
                  className="min-w-0 flex-1 cursor-pointer rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={() => onRowClick(row.original)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onRowClick(row.original);
                  }}
                >
                  {mobileCard(row.original)}
                </div>
              ) : (
                <div className="min-w-0 flex-1 rounded-lg border bg-card p-3">
                  {mobileCard(row.original)}
                </div>
              );
              return (
                <li key={row.id} className="flex items-start gap-2">
                  {selection && (
                    <div className="pt-4">
                      <RowCheckbox row={row.original} id={row.id} selection={selection} />
                    </div>
                  )}
                  {card}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className={cn('overflow-x-auto rounded-lg border', mobileCard && 'hidden md:block')}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {selection && <TableHead className="w-10">{selectPage}</TableHead>}
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  const label = flexRender(header.column.columnDef.header, header.getContext());
                  return (
                    <TableHead key={header.id}>
                      {canSort ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-foreground"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {label}
                          {sorted === 'asc' ? (
                            <ArrowUp className="size-3.5" />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="size-3.5" />
                          ) : (
                            <ArrowUpDown className="size-3.5 opacity-40" />
                          )}
                        </button>
                      ) : (
                        label
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={selection?.selected.has(row.id) ? 'selected' : undefined}
                className={onRowClick ? 'cursor-pointer' : undefined}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              >
                {selection && (
                  <TableCell className="w-10">
                    <RowCheckbox row={row.original} id={row.id} selection={selection} />
                  </TableCell>
                )}
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {pager}
    </div>
  );
}
