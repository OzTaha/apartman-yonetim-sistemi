import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
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
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (data.length === 0 && empty) return <>{empty}</>;
  const rows = table.getRowModel().rows;

  const selectableIds = selection
    ? data.filter((r) => selection.canSelect?.(r) ?? true).map(getRowId)
    : [];
  const selectedCount = selectableIds.filter((id) => selection?.selected.has(id)).length;
  const allState =
    selectedCount === 0
      ? false
      : selectedCount === selectableIds.length
        ? true
        : ('indeterminate' as const);
  const toggleAll = (value: boolean) =>
    selection?.onChange(value ? new Set(selectableIds) : new Set());

  const selectAll = selection && selectableIds.length > 0 && (
    <Checkbox
      aria-label="Tümünü seç"
      checked={allState}
      onCheckedChange={(value) => toggleAll(value === true)}
    />
  );

  return (
    <>
      {mobileCard && (
        <div className="grid gap-2 md:hidden">
          {selectAll && (
            <label className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
              {selectAll}
              Tümünü seç
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
                {selection && <TableHead className="w-10">{selectAll}</TableHead>}
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
    </>
  );
}
