import {
  formatKurus,
  paymentMethodLabels,
  unitLabel,
  type ContactDto,
  type MyOccupancyDto,
  type PaymentDto,
  type SiteKind,
} from '@apartman/shared';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  ChevronRight,
  CreditCard,
  FileDown,
  Megaphone,
  Phone,
  Pin,
  Receipt,
  Scale,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { InfoTip } from '@/components/info-tip';
import { PushPrompt } from '@/components/push-settings';
import { EmptyState, PageHeader } from '@/components/page';
import { Tour, type TourStep } from '@/components/tour';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { OnlinePaymentDialog } from '@/features/dues/online-payment-dialog';
import { StatementDialog } from '@/features/dues/small-dialogs';
import { ChargeStatusBadge } from '@/features/dues/status';
import { OccupancyTypeBadge } from '@/features/residents/occupancy-actions';
import { downloadFile, errorMessage } from '@/lib/api';
import { formatDate, formatPhone } from '@/lib/format';
import { useContacts, useMyAnnouncements, useOnlineStatus, useUnitAccount } from '@/lib/queries';
import { session, useSession } from '@/lib/session';

export const Route = createFileRoute('/_app/dairem')({
  component: MyUnitsPage,
});

const tourSteps: TourStep[] = [
  {
    target: 'debt',
    title: 'Borcunuz burada',
    body: 'Ödemeniz gereken tutar ve son ödeme günü her zaman en üstte görünür. "Borcumu öde" ile kartla ödeyebilir, "Hesap ekstresi" ile tüm hareketleri indirebilirsiniz.',
  },
  {
    target: 'quick',
    title: 'Sık yapılan işler',
    body: 'Arıza bildirmek, ödemelerinize ve duyurulara bakmak için bu düğmeleri kullanın.',
  },
  {
    target: 'contacts',
    title: 'Yönetime ulaşın',
    body: 'Yöneticinizin adı ve telefonu burada. "Ara" düğmesiyle telefonla arayabilirsiniz.',
  },
  {
    target: 'appearance',
    title: 'Yazıyı büyütün',
    body: 'Yazılar küçük geliyorsa bu düğmeden "Büyük" veya "Çok büyük" seçin. Koyu görünümü de buradan açabilirsiniz.',
  },
  {
    target: 'nav',
    title: 'Menü',
    body: 'Diğer sayfalara buradan geçersiniz. Bir bölümü anlamazsanız yanındaki "i" düğmesine dokunun.',
  },
];

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', timeZone: 'Europe/Istanbul' }).format(
      new Date(),
    ),
  );
  if (hour >= 5 && hour < 12) return 'Günaydın';
  if (hour >= 12 && hour < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

function ReceiptButton({ payment, siteId }: { payment: PaymentDto; siteId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy}
      aria-label={`${formatDate(payment.paidAt)} ödemesinin makbuzu`}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadFile(
            `/payments/${payment.id}/receipt.pdf`,
            `makbuz-${payment.receiptNo ?? payment.id}.pdf`,
            siteId,
          );
        } catch (e) {
          toast.error(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Receipt />
      Makbuz
    </Button>
  );
}

function DebtCard({
  occupancy,
  onPay,
  onStatement,
}: {
  occupancy: MyOccupancyDto;
  onPay: () => void;
  onStatement: () => void;
}) {
  const account = useUnitAccount(occupancy.unitId, occupancy.siteId);
  const online = useOnlineStatus(occupancy.siteId);
  const label = unitLabel(occupancy.siteKind, occupancy.blockName, occupancy.unitNumber);
  const open = (account.data?.charges ?? []).filter((c) => !c.cancelledAt && c.remainingKurus > 0);
  const nextDue = open.map((c) => c.dueDate).sort()[0];
  const debt = account.data?.debtKurus ?? 0;
  const overdue = account.data?.overdueKurus ?? 0;

  return (
    <section
      data-tour="debt"
      aria-label={`${label} borç durumu`}
      className="grid gap-4 rounded-2xl bg-primary p-5 text-primary-foreground sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg leading-tight font-semibold">{label}</h2>
            <OccupancyTypeBadge type={occupancy.type} />
          </div>
          <p className="text-sm opacity-85">{occupancy.siteName}</p>
        </div>
        <InfoTip title="Ödenecek borç">
          <p>
            Dairenizin henüz ödenmemiş aidat ve diğer borçlarının toplamıdır. Son ödeme günü geçen
            borçlar "gecikmiş" olarak gösterilir.
          </p>
          <p>
            "Hesap ekstresi" ile tüm borç ve ödemelerinizi tarih sırasıyla PDF olarak
            indirebilirsiniz.
          </p>
        </InfoTip>
      </div>
      {account.isPending ? (
        <Skeleton className="h-16 w-48 bg-primary-foreground/20" />
      ) : account.isError ? (
        <p className="text-sm">{errorMessage(account.error)}</p>
      ) : (
        <div className="grid gap-2">
          <p className="text-sm opacity-85">Ödenecek borcunuz</p>
          <p className="font-heading text-4xl leading-none font-semibold tabular-nums sm:text-5xl">
            {formatKurus(debt)}
          </p>
          {overdue > 0 ? (
            <p className="w-fit rounded-full bg-highlight px-3 py-1 text-sm font-semibold text-highlight-foreground">
              {formatKurus(overdue)} gecikmiş
            </p>
          ) : debt > 0 && nextDue ? (
            <p className="text-sm opacity-85">Son ödeme {formatDate(nextDue)}</p>
          ) : (
            <p className="text-sm opacity-85">Borcunuz yok. Teşekkür ederiz.</p>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {online.data?.enabled && debt > 0 && (
          <Button variant="highlight" size="lg" onClick={onPay}>
            <CreditCard />
            Borcumu öde
          </Button>
        )}
        <Button
          variant="outline"
          size="lg"
          onClick={onStatement}
          className="border-primary-foreground/40 bg-transparent text-primary-foreground shadow-none hover:bg-primary-foreground/10 hover:text-primary-foreground dark:bg-transparent"
        >
          <FileDown />
          Hesap ekstresi
        </Button>
      </div>
      {!online.data?.enabled && debt > 0 && (
        <p className="text-sm opacity-85">
          Ödemenizi yönetime elden veya banka havalesiyle yapabilirsiniz.
        </p>
      )}
    </section>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-20 flex-col items-start justify-between gap-2 rounded-xl border bg-card p-4 text-left transition-[transform,background-color] hover:bg-accent active:scale-[0.98]"
    >
      <Icon className="size-6 text-primary" />
      <span className="font-semibold">{label}</span>
    </button>
  );
}

function QuickActions({ occupancy }: { occupancy: MyOccupancyDto }) {
  const navigate = useNavigate();
  const go = (to: '/taleplerim' | '/duyurular' | '/giderler', search?: { yeni: true }) => {
    session.setSite(occupancy.siteId);
    void navigate({ to, search: search as never });
  };
  return (
    <nav
      aria-label="Sık yapılan işler"
      data-tour="quick"
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      <QuickAction
        icon={Wrench}
        label="Arıza bildir"
        onClick={() => go('/taleplerim', { yeni: true })}
      />
      <QuickAction
        icon={Wallet}
        label="Ödemelerim"
        onClick={() =>
          document
            .getElementById(`odemeler-${occupancy.unitId}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      />
      <QuickAction icon={Megaphone} label="Duyurular" onClick={() => go('/duyurular')} />
      <QuickAction icon={Scale} label="Giderler" onClick={() => go('/giderler')} />
    </nav>
  );
}

function UnitDetails({ occupancy }: { occupancy: MyOccupancyDto }) {
  const account = useUnitAccount(occupancy.unitId, occupancy.siteId);
  const [showPast, setShowPast] = useState(false);
  if (!account.data) return null;
  const charges = account.data.charges.filter((c) => !c.cancelledAt);
  const open = charges.filter((c) => c.remainingKurus > 0);
  const past = charges.filter((c) => c.remainingKurus === 0);
  const payments = account.data.payments.filter((p) => !p.cancelledAt);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Ödenecek borçlar</CardTitle>
        </CardHeader>
        <CardContent>
          {open.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ödenmemiş borcunuz yok.</p>
          ) : (
            <ul className="divide-y">
              {open.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="grid min-w-0 gap-0.5">
                    <span className="truncate font-semibold">{c.label}</span>
                    <span className="text-sm text-muted-foreground">
                      Son ödeme {formatDate(c.dueDate)}
                      {c.paidKurus > 0 && ` · ödenen ${formatKurus(c.paidKurus)}`}
                    </span>
                  </span>
                  <span className="grid shrink-0 justify-items-end gap-1">
                    <span className="font-semibold tabular-nums">
                      {formatKurus(c.remainingKurus)}
                    </span>
                    <ChargeStatusBadge status={c.status} overdue={c.overdue} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card id={`odemeler-${occupancy.unitId}`} className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Ödemelerim</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz ödeme kaydı yok.</p>
          ) : (
            <ul className="divide-y">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-3">
                  <span className="grid min-w-0 gap-0.5">
                    <span className="font-semibold">
                      {formatDate(p.paidAt)} · {formatKurus(p.amountKurus)}
                    </span>
                    <span className="truncate text-sm text-muted-foreground">
                      {paymentMethodLabels[p.method]}
                      {p.allocations.length > 0 &&
                        ` · ${p.allocations.map((a) => a.label).join(', ')}`}
                    </span>
                  </span>
                  <ReceiptButton payment={p} siteId={occupancy.siteId} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {past.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Ödenmiş borçlar ({past.length})</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowPast((v) => !v)}>
              {showPast ? 'Gizle' : 'Göster'}
            </Button>
          </CardHeader>
          {showPast && (
            <CardContent>
              <ul className="divide-y">
                {past.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="grid min-w-0">
                      <span className="truncate">{c.label}</span>
                      <span className="text-sm text-muted-foreground">
                        Son ödeme {formatDate(c.dueDate)}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">{formatKurus(c.amountKurus)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      )}
    </>
  );
}

function MyUnit({ occupancy, first }: { occupancy: MyOccupancyDto; first: boolean }) {
  const account = useUnitAccount(occupancy.unitId, occupancy.siteId);
  const online = useOnlineStatus(occupancy.siteId);
  const [statement, setStatement] = useState(false);
  const [paying, setPaying] = useState(false);
  const short = unitLabel(occupancy.siteKind, occupancy.blockName, occupancy.unitNumber, 'short');
  const open = (account.data?.charges ?? []).filter((c) => !c.cancelledAt && c.remainingKurus > 0);

  return (
    <div className="grid gap-4">
      <DebtCard
        occupancy={occupancy}
        onPay={() => setPaying(true)}
        onStatement={() => setStatement(true)}
      />
      {first && <QuickActions occupancy={occupancy} />}
      {online.data?.enabled && (
        <OnlinePaymentDialog
          open={paying}
          onOpenChange={setPaying}
          unitId={occupancy.unitId}
          siteId={occupancy.siteId}
          charges={open}
          testMode={online.data.testMode}
        />
      )}
      <StatementDialog
        open={statement}
        onOpenChange={setStatement}
        unitId={occupancy.unitId}
        unitLabel={short}
        siteId={occupancy.siteId}
      />
    </div>
  );
}

function UnreadAnnouncements({ siteId, siteName }: { siteId: string; siteName: string }) {
  const navigate = useNavigate();
  const announcements = useMyAnnouncements(siteId);
  const unread = (announcements.data ?? []).filter((a) => !a.read);
  if (unread.length === 0) return null;
  const open = () => {
    session.setSite(siteId);
    void navigate({ to: '/duyurular' });
  };

  return (
    <Card className="border-2 border-primary/40">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="grid gap-1">
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="size-5 text-primary" />
            {unread.length} okunmamış duyuru
          </CardTitle>
          <CardDescription>{siteName}</CardDescription>
        </div>
        <Button onClick={open}>Oku</Button>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2">
          {unread.slice(0, 3).map((a) => (
            <li key={a.id} className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full bg-highlight ring-1 ring-highlight-foreground/40"
              />
              {a.pinned && <Pin className="size-4 shrink-0" aria-label="Sabitlendi" />}
              <span className="truncate font-semibold">{a.title}</span>
              <span className="shrink-0 text-sm text-muted-foreground">
                {formatDate(a.publishedAt)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function contactRole(c: ContactDto, kind: SiteKind): string {
  if (c.role === 'SITE_MANAGER')
    return kind === 'APARTMENT' ? 'Apartman yöneticisi' : 'Site yöneticisi';
  return c.blocks.length > 0 ? `${c.blocks.join(', ')} Blok yöneticisi` : 'Blok yöneticisi';
}

function Contacts({
  siteId,
  siteName,
  kind,
}: {
  siteId: string;
  siteName: string;
  kind: SiteKind;
}) {
  const contacts = useContacts(siteId);
  if (!contacts.data || contacts.data.length === 0) return null;
  return (
    <Card data-tour="contacts">
      <CardHeader>
        <CardTitle>Yönetim</CardTitle>
        <CardDescription>{siteName}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {contacts.data.map((c) => (
            <li key={`${c.role}-${c.name}`} className="flex items-center gap-3 py-3">
              <span
                aria-hidden
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary font-heading font-semibold text-secondary-foreground"
              >
                {c.name
                  .split(' ')
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join('')
                  .toLocaleUpperCase('tr')}
              </span>
              <span className="grid min-w-0 flex-1">
                <span className="truncate font-semibold">{c.name}</span>
                <span className="truncate text-sm text-muted-foreground">
                  {contactRole(c, kind)}
                  {c.phone && ` · ${formatPhone(c.phone)}`}
                </span>
              </span>
              {c.phone && (
                <Button variant="outline" asChild>
                  <a href={`tel:${c.phone}`} aria-label={`${c.name} ara`}>
                    <Phone />
                    Ara
                  </a>
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function MyUnitsPage() {
  const { user } = useSession();
  const occupancies = user?.occupancies ?? [];
  const sites = [
    ...new Map(occupancies.map((o) => [o.siteId, { name: o.siteName, kind: o.siteKind }])),
  ];
  const firstAccount = useUnitAccount(occupancies[0]?.unitId, occupancies[0]?.siteId);

  return (
    <div className="grid gap-5">
      <PageHeader
        title={`${greeting()}, ${user?.firstName ?? ''}`}
        description="Dairenizle ilgili her şey bu sayfada."
      />
      {occupancies.length === 0 ? (
        <EmptyState
          title="Hesabınıza bağlı daire yok"
          description="Site yönetiminizden sizi dairenize eklemesini isteyin."
        />
      ) : (
        <>
          {occupancies.map((o, i) => (
            <MyUnit key={o.occupancyId} occupancy={o} first={i === 0} />
          ))}
          <PushPrompt />
          {sites.map(([siteId, s]) => (
            <UnreadAnnouncements key={siteId} siteId={siteId} siteName={s.name} />
          ))}
          {occupancies.map((o) => (
            <section
              key={o.occupancyId}
              className="grid gap-4"
              aria-label={unitLabel(o.siteKind, o.blockName, o.unitNumber)}
            >
              {occupancies.length > 1 && (
                <h2 className="flex items-center gap-1 text-lg font-semibold">
                  <ChevronRight className="size-5 text-primary" />
                  {unitLabel(o.siteKind, o.blockName, o.unitNumber)}
                </h2>
              )}
              <UnitDetails occupancy={o} />
            </section>
          ))}
          {sites.map(([siteId, s]) => (
            <Contacts key={siteId} siteId={siteId} siteName={s.name} kind={s.kind} />
          ))}
          <Tour id="resident-home" steps={tourSteps} ready={Boolean(firstAccount.data)} />
        </>
      )}
    </div>
  );
}
