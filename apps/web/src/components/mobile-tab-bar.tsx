import { Link } from '@tanstack/react-router';
import { Menu } from 'lucide-react';
import { useIsActivePath, useNavigation, type NavItem } from '@/lib/navigation';
import { useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

type Path = NavItem['to'];

const preferred: Record<string, Path[]> = {
  RESIDENT: ['/dairem', '/duyurular', '/taleplerim', '/giderler'],
  SITE_MANAGER: ['/panel', '/aidat', '/tahsilatlar', '/talepler'],
  BLOCK_MANAGER: ['/daireler', '/tahsilatlar', '/talepler', '/duyurular'],
  AUDITOR: ['/panel', '/kasa', '/raporlar', '/duyurular'],
  NONE: ['/siteler', '/marka'],
};

const shortLabels: Partial<Record<Path, string>> = {
  '/aidat': 'Aidat',
  '/tahsilatlar': 'Tahsilat',
  '/talepler': 'Talepler',
  '/giderler': 'Giderler',
  '/siteler': 'Siteler',
  '/marka': 'Marka',
};

export function MobileTabBar() {
  const { groups, badges, role } = useNavigation();
  const isActive = useIsActivePath();
  const { setOpenMobile, openMobile } = useSidebar();
  const all = groups.flatMap((g) => g.items);
  const wanted = preferred[role ?? 'NONE'] ?? [];
  const picked = wanted
    .map((to) => all.find((i) => i.to === to))
    .filter((i): i is NavItem => Boolean(i));
  for (const item of all) {
    if (picked.length >= 4) break;
    if (!picked.includes(item)) picked.push(item);
  }
  const tabs = picked.slice(0, 4);
  const hiddenBadges = all
    .filter((i) => !tabs.includes(i))
    .reduce((sum, i) => sum + (badges[i.to] ?? 0), 0);

  return (
    <nav
      aria-label="Alt menü"
      data-tour="nav"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {tabs.map((item) => {
          const active = isActive(item.to);
          const badge = badges[item.to] ?? 0;
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[64px] flex-col items-center justify-center gap-[4px] px-[2px] text-[12px] leading-[16px] font-semibold transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'relative flex h-[30px] w-[54px] items-center justify-center rounded-full transition-colors',
                    active && 'bg-secondary',
                  )}
                >
                  <item.icon className="size-[22px]" />
                  {badge > 0 && (
                    <span className="absolute -top-0.5 right-2 min-w-[16px] rounded-full bg-destructive px-[4px] text-[11px] leading-[16px] text-white tabular-nums">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate">{shortLabels[item.to] ?? item.label}</span>
              </Link>
            </li>
          );
        })}
        <li className="col-start-5">
          <button
            type="button"
            onClick={() => setOpenMobile(!openMobile)}
            aria-label="Menüyü aç/kapat"
            className="flex min-h-[64px] w-full flex-col items-center justify-center gap-[4px] px-[2px] text-[12px] leading-[16px] font-semibold text-muted-foreground"
          >
            <span className="relative flex h-[30px] w-[54px] items-center justify-center rounded-full">
              <Menu className="size-[22px]" />
              {hiddenBadges > 0 && (
                <span
                  className="absolute top-0.5 right-3 size-2.5 rounded-full bg-destructive"
                  aria-hidden
                />
              )}
            </span>
            Menü
          </button>
        </li>
      </ul>
    </nav>
  );
}
