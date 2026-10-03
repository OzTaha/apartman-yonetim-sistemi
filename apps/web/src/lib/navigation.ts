import { useRouterState } from '@tanstack/react-router';
import {
  Bell,
  History,
  Landmark,
  Building,
  ShieldCheck,
  CalendarClock,
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
  DoorOpen,
  FileBarChart,
  HandCoins,
  Home,
  LayoutDashboard,
  LayoutGrid,
  ReceiptText,
  Settings2,
  Users,
  Wrench,
  Calculator,
  FileSpreadsheet,
  Gavel,
  Vote,
  ClipboardCheck,
  DoorClosed,
  MessageSquareWarning,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useCanReceiveNotifications, useNotificationCount } from '@/lib/notifications';
import { useMyRequests, useStaffMe } from '@/lib/queries';
import { activeRole, canManage, useHasUnitInSite, useSession } from '@/lib/session';

export interface NavItem {
  to:
    | '/panel'
    | '/daireler'
    | '/sakinler'
    | '/excel-aktarma'
    | '/anketler'
    | '/islerim'
    | '/kapi'
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
    | '/yetkililer'
    | '/islem-gecmisi'
    | '/banka-hareketleri'
    | '/talepler'
    | '/taleplerim'
    | '/butce'
    | '/genel-kurul';
  label: string;
  icon: ComponentType<{ className?: string }>;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export function useNavigation() {
  const s = useSession();
  const role = activeRole(s);

  const unread = useNotificationCount().data?.unread ?? 0;
  const notifications = useCanReceiveNotifications();
  const hasSite = Boolean(s.siteId);
  const hasUnit = useHasUnitInSite();
  const staff = role === 'STAFF' && hasSite;
  const unseen = (useMyRequests(hasUnit || staff).data ?? []).filter((r) => r.unseen).length;
  const badges: Partial<Record<NavItem['to'], number>> = {
    '/bildirimler': unread,
    [staff ? '/islerim' : '/taleplerim']: unseen,
  };
  const manager = canManage(role) && hasSite;
  const blockManager = role === 'BLOCK_MANAGER' && hasSite;
  const auditor = role === 'AUDITOR' && hasSite;
  const staffMe = useStaffMe(staff);
  const items: NavItem[] = [];
  if (staff) {
    items.push({ to: '/islerim', label: 'İşlerim', icon: ClipboardCheck });
    if (staffMe.data?.doorAccess) items.push({ to: '/kapi', label: 'Kapı', icon: DoorClosed });
  }
  if (manager || auditor) items.push({ to: '/panel', label: 'Panel', icon: LayoutDashboard });
  if (manager || blockManager) {
    items.push({ to: '/daireler', label: 'Daireler', icon: DoorOpen });
    items.push({ to: '/sakinler', label: 'Sakinler', icon: Users });
  }
  if (manager) {
    items.push({ to: '/yetkililer', label: 'Yetkililer', icon: ShieldCheck });
    items.push({ to: '/excel-aktarma', label: "Excel'den aktar", icon: FileSpreadsheet });
  }
  if (s.user?.isPlatformAdmin && hasSite) {
    items.push({ to: '/islem-gecmisi', label: 'İşlem geçmişi', icon: History });
  }
  if (notifications) items.push({ to: '/bildirimler', label: 'Bildirimler', icon: Bell });
  if (manager || blockManager) {
    items.push({ to: '/talepler', label: 'Arıza ve talepler', icon: Wrench });
  }
  if ((s.user?.occupancies.length ?? 0) > 0)
    items.push({ to: '/dairem', label: 'Dairem', icon: Home });
  if (hasUnit) items.push({ to: '/taleplerim', label: 'Taleplerim', icon: MessageSquareWarning });
  if (hasSite && role !== 'RESIDENT' && !staff) {
    items.push({ to: '/genel-kurul', label: 'Genel kurul', icon: Gavel });
  }
  if ((role === 'RESIDENT' || auditor) && hasSite) {
    items.push({ to: '/duyurular', label: 'Duyurular', icon: Megaphone });
  }
  if (role === 'RESIDENT' && hasSite) {
    items.push({ to: '/anketler', label: 'Anketler', icon: Vote });
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
    ...(manager
      ? ([{ to: '/banka-hareketleri', label: 'Banka hareketleri', icon: Landmark }] as NavItem[])
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
          { to: '/butce', label: 'İşletme projesi', icon: Calculator },
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
        { to: '/kapi', label: 'Kapı (kargo, misafir)', icon: DoorClosed },
      ]
    : blockManager
      ? [{ to: '/kapi', label: 'Kapı (kargo, misafir)', icon: DoorClosed }]
      : [];
  const contactItems: NavItem[] = [
    ...(manager || blockManager
      ? ([
          { to: '/duyurular', label: 'Duyurular', icon: Megaphone },
          { to: '/mesajlar', label: 'Mesajlar', icon: MessageSquare },
        ] as NavItem[])
      : []),
    ...(manager ? ([{ to: '/anketler', label: 'Anketler', icon: Vote }] as NavItem[]) : []),
    ...(manager
      ? ([
          { to: '/mesaj-ayarlari', label: 'Şablonlar ve hatırlatma', icon: MessageSquareText },
        ] as NavItem[])
      : []),
  ];
  const groups: NavGroup[] = [
    { label: 'Menü', items },
    { label: 'Aidat ve borç', items: duesItems },
    { label: 'Gelir-gider', items: financeItems },
    { label: 'İletişim', items: contactItems },
    { label: 'Çalışan ve görev', items: staffItems },
  ].filter((g) => g.items.length > 0);
  return { groups, badges, role };
}

export function useIsActivePath() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (to: string) => pathname === to || pathname.startsWith(`${to}/`);
}
