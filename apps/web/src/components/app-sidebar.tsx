import { Link, useNavigate } from '@tanstack/react-router';
import { Check, ChevronsUpDown, CircleHelp, KeyRound, LogOut } from 'lucide-react';
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
import { useIsActivePath, useNavigation, type NavItem } from '@/lib/navigation';
import { activeRole, session, useSession } from '@/lib/session';
import { useSiteOptions } from '@/lib/site-options';
import { restartTours } from '@/lib/tours';

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
        <DropdownMenuItem
          onSelect={() => {
            restartTours(user.id);
            void navigate({ to: '/' });
          }}
        >
          <CircleHelp />
          Tanıtım turunu göster
        </DropdownMenuItem>
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
  const { groups, badges } = useNavigation();
  const isActive = useIsActivePath();
  const { setOpenMobile } = useSidebar();
  const renderItems = (list: NavItem[]) =>
    list.map((item) => (
      <SidebarMenuItem key={item.to}>
        <SidebarMenuButton asChild isActive={isActive(item.to)}>
          <Link to={item.to} onClick={() => setOpenMobile(false)}>
            <item.icon />
            <span>{item.label}</span>
            {(badges[item.to] ?? 0) > 0 && (
              <span
                className="ml-auto rounded-full bg-destructive px-1.5 text-xs leading-5 font-medium text-white tabular-nums"
                aria-label={`${badges[item.to]} okunmamış`}
              >
                {badges[item.to]! > 99 ? '99+' : badges[item.to]}
              </span>
            )}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ));

  return (
    <Sidebar data-tour="nav">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SiteSwitcher />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderItems(group.items)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
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
