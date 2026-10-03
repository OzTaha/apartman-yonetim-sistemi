import type { DoorUnitDto } from '@apartman/shared';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const norm = (v: string) => v.toLocaleLowerCase('tr').trim();

export function UnitPicker({
  units,
  value,
  onChange,
}: {
  units: DoorUnitDto[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const q = norm(query);
  const shown = q
    ? units.filter((u) => norm(`${u.label} ${u.residents.join(' ')}`).includes(q))
    : units;
  return (
    <div className="grid gap-2">
      <Input
        id="door-unit-search"
        placeholder="Daire numarası veya isim yazın"
        aria-label="Daire ara"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="grid max-h-60 gap-1 overflow-y-auto rounded-lg border p-1" role="listbox">
        {shown.length === 0 && (
          <li className="p-3 text-sm text-muted-foreground">Daire bulunamadı.</li>
        )}
        {shown.map((u) => (
          <li key={u.id} role="option" aria-selected={value === u.id}>
            <button
              type="button"
              onClick={() => onChange(u.id)}
              className={cn(
                'grid w-full rounded-md px-3 py-2.5 text-left',
                value === u.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
              )}
            >
              <span className="font-semibold">{u.label}</span>
              {u.residents.length > 0 && (
                <span
                  className={cn('text-sm', value === u.id ? 'opacity-90' : 'text-muted-foreground')}
                >
                  {u.residents.join(', ')}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
