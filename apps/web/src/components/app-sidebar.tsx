import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import {
  Building,
  Check,
  ChevronsUpDown,
  DoorOpen,
  FileBarChart,
  HandCoins,
  Home,
  KeyRound,
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
import { logout } from '@/lib/auth';
import { activeRole, canManage, session, useSession } from '@/lib/session';
import { useSiteOptions } from '@/lib/site-options';

interface NavItem {
  to:
    | '/daireler'
    | '/sakinler'
    | '/dairem'
    | '/siteler'
    | '/aidat'
    | '/borclar'
    | '/tahsilatlar'
    | '/raporlar'
    | '/aidat-ayarlari';
  label: string;
  icon: ComponentType<{ className?: string }>;
}

const roleLabels = {
  PLATFORM_ADMIN: 'Sistem yöneticisi',
  SITE_MANAGER: 'Site yöneticisi',
  RESIDENT: 'Sakin',
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
            await navigate({ to: '/giris' });
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

  const manager = canManage(role) && Boolean(s.siteId);
  const items: NavItem[] = [];
  if (manager) {
    items.push({ to: '/daireler', label: 'Daireler', icon: DoorOpen });
    items.push({ to: '/sakinler', label: 'Sakinler', icon: Users });
  }
  if ((s.user?.occupancies.length ?? 0) > 0)
    items.push({ to: '/dairem', label: 'Dairem', icon: Home });
  if (s.user?.isPlatformAdmin)
    items.push({ to: '/siteler', label: 'Apartman ve siteler', icon: Building });

  const duesItems: NavItem[] = manager
    ? [
        { to: '/aidat', label: 'Aidat tablosu', icon: LayoutGrid },
        { to: '/borclar', label: 'Borçlar', icon: ReceiptText },
        { to: '/tahsilatlar', label: 'Tahsilatlar', icon: HandCoins },
        { to: '/raporlar', label: 'Raporlar', icon: FileBarChart },
        { to: '/aidat-ayarlari', label: 'Aidat ayarları', icon: Settings2 },
      ]
    : [];
  const isActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`);
  const renderItems = (list: NavItem[]) =>
    list.map((item) => (
      <SidebarMenuItem key={item.to}>
        <SidebarMenuButton asChild isActive={isActive(item.to)}>
          <Link to={item.to} onClick={() => setOpenMobile(false)}>
            <item.icon />
            <span>{item.label}</span>
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
