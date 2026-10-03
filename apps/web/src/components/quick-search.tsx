import type { UnitDto } from '@apartman/shared';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { DoorOpen, Search } from 'lucide-react';
import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useNavigation } from '@/lib/navigation';
import { apiFetch } from '@/lib/api';
import { canManage, useSession } from '@/lib/session';
import { labelUnit } from '@/lib/unit-label';
import { cn } from '@/lib/utils';

interface Result {
  key: string;
  label: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  go: () => void;
}

const normalize = (value: string) => value.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();

export function QuickSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const { groups, role } = useNavigation();
  const navigate = useNavigate();
  const searchUnits = canManage(role) || role === 'BLOCK_MANAGER';
  const { siteId } = useSession();
  const units = useQuery({
    queryKey: ['quick-search-units', siteId],
    queryFn: () => apiFetch<UnitDto[]>('/units'),
    enabled: open && searchUnits && Boolean(siteId),
    staleTime: 60_000,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pages = useMemo<Result[]>(() => {
    const q = normalize(query);
    const seen = new Set<string>();
    return groups
      .flatMap((g) => g.items.map((item) => ({ item, group: g.label })))
      .filter(({ item }) => {
        if (seen.has(item.to)) return false;
        seen.add(item.to);
        return !q || normalize(item.label).includes(q);
      })
      .slice(0, q ? 8 : 6)
      .map(({ item, group }) => ({
        key: `page-${item.to}`,
        label: item.label,
        hint: group === 'Menü' ? 'Sayfa' : group,
        icon: item.icon,
        go: () => void navigate({ to: item.to }),
      }));
  }, [groups, query, navigate]);

  const unitResults = useMemo<Result[]>(() => {
    const q = normalize(query);
    if (!q || !units.data) return [];
    return units.data
      .filter((u) => {
        const text = normalize(
          [
            labelUnit(u.blockName, u.number),
            `${u.blockName}-${u.number}`,
            ...u.occupants.map((o) => `${o.firstName} ${o.lastName}`),
          ].join(' '),
        );
        return q.split(' ').every((part) => text.includes(part));
      })
      .slice(0, 8)
      .map((u) => ({
        key: `unit-${u.id}`,
        label: labelUnit(u.blockName, u.number),
        hint: u.occupants.map((o) => `${o.firstName} ${o.lastName}`).join(', ') || 'Daire',
        icon: DoorOpen,
        go: () => void navigate({ to: '/daireler/$unitId', params: { unitId: u.id } }),
      }));
  }, [query, units.data, navigate]);

  const results = [...pages, ...unitResults];
  const current = Math.min(active, Math.max(results.length - 1, 0));

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery('');
      setActive(0);
    }
  };
  const pick = (r: Result | undefined) => {
    if (!r) return;
    close(false);
    r.go();
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Ara (Ctrl+K)"
        data-tour="search"
        onClick={() => setOpen(true)}
      >
        <Search />
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="gap-3 sm:top-[20%] sm:translate-y-0">
          <DialogTitle>Ara</DialogTitle>
          <DialogDescription>
            {searchUnits
              ? 'Gitmek istediğiniz sayfanın adını, daire numarasını veya sakinin adını yazın.'
              : 'Gitmek istediğiniz sayfanın adını yazın.'}
          </DialogDescription>
          <Input
            id="quick-search"
            autoFocus
            placeholder={searchUnits ? 'Örneğin: borçlar, A-5 veya Ayşe' : 'Örneğin: duyurular'}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                pick(results[current]);
              }
            }}
            aria-label="Arama"
          />
          {results.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Sonuç bulunamadı. Farklı bir kelime deneyin.
            </p>
          ) : (
            <ul className="grid max-h-[50svh] gap-1 overflow-y-auto" role="listbox">
              {results.map((r, i) => (
                <li key={r.key} role="option" aria-selected={i === current}>
                  <button
                    type="button"
                    onClick={() => pick(r)}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left',
                      i === current ? 'bg-secondary text-secondary-foreground' : 'hover:bg-accent',
                    )}
                  >
                    <r.icon className="size-5 shrink-0 text-primary" />
                    <span className="grid min-w-0">
                      <span className="truncate font-semibold">{r.label}</span>
                      <span className="truncate text-sm text-muted-foreground">{r.hint}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
