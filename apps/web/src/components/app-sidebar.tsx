import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import {
  Bell,
  Building,
  ShieldCheck,
  CalendarClock,
  Check,
  ClipboardList,
  ListChecks,
  Megaphone,
  MessageSquare,
  MessageSquareText,
  Palette,
  Repeat,
  UserCog,
  ChartColumn,
  Hammer,
  Store,
  Wallet,
  WalletCards,
  Scale,
  ChevronsUpDown,
  DoorOpen,
  FileBarChart,
  HandCoins,
  Home,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  ReceiptText,
  Settings2,
  Users,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { BrandMark } from '@/components/brand';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { siteRoleLabels } from '@apartman/shared';
import { logout } from '@/lib/auth';
import { useCanReceiveNotifications, useNotificationCount } from '@/lib/notifications';
import { activeRole, canManage, session, useSession } from '@/lib/session';
import { useSiteOptions } from '@/lib/site-options';

interface NavItem {
  to:
    | '/panel'
    | '/daireler'
    | '/sakinler'
    | '/dairem'
    | '/siteler'
    | '/aidat'
    | '/borclar'
    | '/tahsilatlar'
    | '/raporlar'
    | '/aidat-ayarlari'
    | '/kasa'
    | '/isler'
    | '/firmalar'
    | '/gelir-gider'
    | '/kasa-ayarlari'
    | '/giderler'
    | '/calisanlar'
    | '/vardiyalar'
    | '/gorevler'
    | '/tekrarlayan-gorevler'
    | '/calisan-raporu'
    | '/duyurular'
    | '/mesajlar'
    | '/mesaj-ayarlari'
    | '/marka'
    | '/bildirimler'
    | '/yetkililer';
  label: string;
  icon: ComponentType<{ className?: string }>;
}

const roleLabels = {
  PLATFORM_ADMIN: 'Sistem yöneticisi',
  ...siteRoleLabels,
} as const;

function SiteSwitcher() {
  const s = useSession();
  const options = useSiteOptions();
  const navigate = useNavigate();
  const { setOpenMobile } = useSidebar();
  const role = activeRole(s);
  const active = options.find((o) => o.id === s.siteId);

  const label = (
    <>
      <BrandMark size="sm" />
      <div className="grid min-w-0 flex-1 text-left leading-tight">
        <span className="truncate text-sm font-semibold">{active?.name ?? 'Site seçin'}</span>
        <span className="truncate text-xs text-muted-foreground">
          {role === 'SITE_MANAGER' && active?.kind === 'APARTMENT'
            ? 'Apartman yöneticisi'
            : role
              ? roleLabels[role]
              : ''}
        </span>
      </div>
    </>
  );

  if (options.length <= 1) {
    return <div className="flex items-center gap-2 p-2">{label}</div>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" aria-label="Site değiştir">
          {label}
          <ChevronsUpDown className="ml-auto size-4" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Siteler</DropdownMenuLabel>
        {options.map((option) => (
          <DropdownMenuItem
            key={option.id}
            onSelect={() => {
              session.setSite(option.id);
              setOpenMobile(false);
              void navigate({ to: '/' });
            }}
          >
            <span className="truncate">{option.name}</span>
            {option.id === s.siteId && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu() {
  const { user } = useSession();
  const navigate = useNavigate();
  if (!user) return null;
  const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toLocaleUpperCase('tr');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" aria-label="Kullanıcı menüsü">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
            {initials}
          </div>
          <div className="grid min-w-0 flex-1 text-left leading-tight">
            <span className="truncate text-sm font-medium">
              {user.firstName} {user.lastName}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {user.email ?? user.phone}
            </span>
          </div>
          <ChevronsUpDown className="ml-auto size-4" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuItem onSelect={() => void navigate({ to: '/sifre' })}>
          <KeyRound />
          Şifre değiştir
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await logout();
            window.location.replace('/giris');
          }}
        >
          <LogOut />
          Çıkış yap
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppSidebar() {
  const s = useSession();
  const role = activeRole(s);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { setOpenMobile } = useSidebar();

  const unread = useNotificationCount().data?.unread ?? 0;
  const notifications = useCanReceiveNotifications();
  const hasSite = Boolean(s.siteId);
  const manager = canManage(role) && hasSite;
  const blockManager = role === 'BLOCK_MANAGER' && hasSite;
  const auditor = role === 'AUDITOR' && hasSite;
  const items: NavItem[] = [];
  if (manager || auditor) items.push({ to: '/panel', label: 'Panel', icon: LayoutDashboard });
  if (manager || blockManager) {
    items.push({ to: '/daireler', label: 'Daireler', icon: DoorOpen });
    items.push({ to: '/sakinler', label: 'Sakinler', icon: Users });
  }
  if (manager) items.push({ to: '/yetkililer', label: 'Yetkililer', icon: ShieldCheck });
  if (notifications) items.push({ to: '/bildirimler', label: 'Bildirimler', icon: Bell });
  if ((s.user?.occupancies.length ?? 0) > 0)
    items.push({ to: '/dairem', label: 'Dairem', icon: Home });
  if ((role === 'RESIDENT' || auditor) && hasSite) {
    items.push({ to: '/duyurular', label: 'Duyurular', icon: Megaphone });
  }
  if ((role === 'RESIDENT' || auditor || blockManager) && hasSite) {
    items.push({ to: '/giderler', label: 'Giderler ve işler', icon: Scale });
  }
  if (s.user?.isPlatformAdmin) {
    items.push({ to: '/siteler', label: 'Apartman ve siteler', icon: Building });
    items.push({ to: '/marka', label: 'Marka ayarları', icon: Palette });
  }

  const duesItems: NavItem[] = [
    ...(manager || blockManager || auditor
      ? ([
          { to: '/aidat', label: 'Aidat tablosu', icon: LayoutGrid },
          { to: '/borclar', label: 'Borçlar', icon: ReceiptText },
          { to: '/tahsilatlar', label: 'Tahsilatlar', icon: HandCoins },
        ] as NavItem[])
      : []),
    ...(manager || auditor
      ? ([{ to: '/raporlar', label: 'Raporlar', icon: FileBarChart }] as NavItem[])
      : []),
    ...(manager
      ? ([{ to: '/aidat-ayarlari', label: 'Aidat ayarları', icon: Settings2 }] as NavItem[])
      : []),
  ];
  const financeItems: NavItem[] = [
    ...(manager || blockManager || auditor
      ? ([
          { to: '/kasa', label: blockManager ? 'Blok giderleri' : 'Kasa', icon: Wallet },
        ] as NavItem[])
      : []),
    ...(manager || auditor
      ? ([
          { to: '/isler', label: 'Yapılan işler', icon: Hammer },
          { to: '/firmalar', label: 'Firmalar', icon: Store },
          { to: '/gelir-gider', label: 'Gelir-gider raporu', icon: ChartColumn },
        ] as NavItem[])
      : []),
    ...(manager
      ? ([{ to: '/kasa-ayarlari', label: 'Kasa ayarları', icon: WalletCards }] as NavItem[])
      : []),
  ];
  const staffItems: NavItem[] = manager
    ? [
        { to: '/calisanlar', label: 'Çalışanlar', icon: UserCog },
        { to: '/vardiyalar', label: 'Vardiya planı', icon: CalendarClock },
        { to: '/gorevler', label: 'Görevler', icon: ListChecks },
        { to: '/tekrarlayan-gorevler', label: 'Tekrarlayan görevler', icon: Repeat },
        { to: '/calisan-raporu', label: 'Çalışan raporu', icon: ClipboardList },
      ]
    : [];
  const contactItems: NavItem[] = [
    ...(manager || blockManager
      ? ([
          { to: '/duyurular', label: 'Duyurular', icon: Megaphone },
          { to: '/mesajlar', label: 'Mesajlar', icon: MessageSquare },
        ] as NavItem[])
      : []),
    ...(manager
      ? ([
          { to: '/mesaj-ayarlari', label: 'Şablonlar ve hatırlatma', icon: MessageSquareText },
        ] as NavItem[])
      : []),
  ];
  const isActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`);
  const renderItems = (list: NavItem[]) =>
    list.map((item) => (
      <SidebarMenuItem key={item.to}>
        <SidebarMenuButton asChild isActive={isActive(item.to)}>
          <Link to={item.to} onClick={() => setOpenMobile(false)}>
            <item.icon />
            <span>{item.label}</span>
            {item.to === '/bildirimler' && unread > 0 && (
              <span
                className="ml-auto rounded-full bg-destructive px-1.5 text-xs leading-5 font-medium text-white tabular-nums"
                aria-label={`${unread} okunmamış`}
              >
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ));

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SiteSwitcher />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menü</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(items)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {duesItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Aidat ve borç</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderItems(duesItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {financeItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Gelir-gider</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderItems(financeItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {contactItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>İletişim</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderItems(contactItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {staffItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Çalışan ve görev</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderItems(staffItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
