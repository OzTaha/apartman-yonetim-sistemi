import {
  meetingKindLabels,
  type DecisionDto,
  type MeetingDto,
  type ResidentMeetingDto,
} from '@apartman/shared';
import { createFileRoute, Link, Navigate, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { FileDown, Megaphone, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatLocalDateTime } from '@/features/meetings/format';
import { MeetingDialog } from '@/features/meetings/meeting-dialog';
import { DecisionBadge, MeetingStatusBadge } from '@/features/meetings/parts';
import { downloadFile, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useAssemblies, useDecisions, useMeetings } from '@/lib/queries';
import { canManage, useRole, useSession } from '@/lib/session';

export const Route = createFileRoute('/_app/genel-kurul/')({
  component: AssemblyRoute,
});

function AssemblyRoute() {
  const { siteId } = useSession();
  const role = useRole();
  if (!siteId || !role || role === 'RESIDENT') return <Navigate to="/" replace />;
  return canManage(role) || role === 'AUDITOR' ? <MeetingsPage /> : <ResidentMeetingsPage />;
}

const download = (path: string, name: string) =>
  void downloadFile(path, name).catch((e: unknown) => toast.error(errorMessage(e)));

function MeetingCard({ m }: { m: MeetingDto }) {
  return (
    <Link to="/genel-kurul/$meetingId" params={{ meetingId: m.id }} className="block">
      <Card className="h-full py-4 transition-colors hover:bg-muted/50">
        <CardContent className="grid gap-1.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span className="font-medium">{meetingKindLabels[m.kind]}</span>
            <span className="flex flex-wrap gap-1">
              {m.status === 'PLANNED' && !m.calledAt && (
                <Badge variant="outline">Çağrı yapılmadı</Badge>
              )}
              <MeetingStatusBadge status={m.status} />
            </span>
          </div>
          <span className="text-sm">{formatLocalDateTime(m.startsAt)}</span>
          <span className="truncate text-sm text-muted-foreground">{m.location}</span>
          <span className="text-xs text-muted-foreground">
            {m.itemCount} gündem maddesi
            {m.status === 'HELD' && ` · ${m.decisionCount} karar`}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

function DecisionBook() {
  const decisions = useDecisions();
  const columns: ColumnDef<DecisionDto>[] = [
    { accessorKey: 'decisionNo', header: 'No' },
    {
      accessorKey: 'meetingDate',
      header: 'Tarih',
      cell: ({ row }) => formatDate(row.original.meetingDate),
    },
    {
      accessorKey: 'title',
      header: 'Karar',
      cell: ({ row }) => (
        <span className="grid gap-0.5 whitespace-normal">
          <span className="font-medium">{row.original.title}</span>
          <span className="text-muted-foreground">{row.original.resolution}</span>
        </span>
      ),
    },
    {
      accessorKey: 'result',
      header: 'Sonuç',
      enableSorting: false,
      cell: ({ row }) => <DecisionBadge result={row.original.result} />,
    },
  ];
  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="grid gap-1.5">
          <CardTitle>Karar defteri</CardTitle>
          <CardDescription>
            Tamamlanan toplantılarda alınan kararlar sıra numarasıyla burada tutulur.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => download('/meetings/decisions.pdf', 'karar-defteri.pdf')}
        >
          <FileDown />
          PDF indir
        </Button>
      </CardHeader>
      <CardContent>
        {decisions.isPending ? (
          <LoadingRows rows={2} />
        ) : decisions.isError ? (
          <ErrorState error={decisions.error} />
        ) : (
          <DataTable
            columns={columns}
            data={decisions.data}
            getRowId={(d) => String(d.decisionNo)}
            mobileCard={(d) => (
              <div className="grid gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">
                    {d.decisionNo}. {d.title}
                  </span>
                  <DecisionBadge result={d.result} />
                </div>
                <span className="text-sm">{d.resolution}</span>
                <span className="text-xs text-muted-foreground">{formatDate(d.meetingDate)}</span>
              </div>
            )}
            empty={
              <p className="p-4 text-sm text-muted-foreground">
                Henüz karar yok. Toplantı tamamlandığında kararlar buraya işlenir.
              </p>
            }
          />
        )}
      </CardContent>
    </Card>
  );
}

function MeetingsPage() {
  const meetings = useMeetings();
  const manager = canManage(useRole());
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Genel kurul"
        description="Toplantı çağrısı, hazirun, kararlar ve karar defteri."
        actions={
          manager && (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              Toplantı planla
            </Button>
          )
        }
      />
      {meetings.isPending ? (
        <LoadingRows />
      ) : meetings.isError ? (
        <ErrorState error={meetings.error} />
      ) : meetings.data.length === 0 ? (
        <EmptyState
          title="Henüz toplantı yok"
          description="Genel kurul toplantısını planlayın; çağrıyı duyuru ve SMS ile yapın, hazirun ve kararları buradan tutun."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {meetings.data.map((m) => (
            <MeetingCard key={m.id} m={m} />
          ))}
        </div>
      )}
      <DecisionBook />
      {creating && (
        <MeetingDialog
          onOpenChange={setCreating}
          onSaved={(m) =>
            void navigate({ to: '/genel-kurul/$meetingId', params: { meetingId: m.id } })
          }
        />
      )}
    </div>
  );
}

function ResidentMeetingCard({ m }: { m: ResidentMeetingDto }) {
  const held = m.status === 'HELD';
  return (
    <Card className="min-w-0">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle>{meetingKindLabels[m.kind]}</CardTitle>
          <MeetingStatusBadge status={m.status} />
        </div>
        <CardDescription>
          {formatLocalDateTime(m.startsAt)} · {m.location}
          {!held && m.secondStartsAt && (
            <span className="block">
              Yeter sayı sağlanamazsa ikinci toplantı: {formatLocalDateTime(m.secondStartsAt)}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ol className="grid gap-3 text-sm">
          {m.items.map((item, i) => (
            <li key={item.id} className="grid gap-1">
              <span className="font-medium">
                {i + 1}. {item.title}
              </span>
              {held && item.result && (
                <>
                  <span className="flex flex-wrap items-center gap-2">
                    <DecisionBadge result={item.result} />
                    {item.decisionNo && (
                      <span className="text-xs text-muted-foreground">
                        Karar no {item.decisionNo}
                      </span>
                    )}
                  </span>
                  <span className="whitespace-pre-line text-muted-foreground">
                    {item.resolution}
                  </span>
                </>
              )}
            </li>
          ))}
        </ol>
        {held && (
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() =>
              download(
                `/assemblies/${m.id}/minutes.pdf`,
                `genel-kurul-tutanagi-${m.startsAt.slice(0, 10)}.pdf`,
              )
            }
          >
            <FileDown />
            Tutanağı indir
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ResidentMeetingsPage() {
  const assemblies = useAssemblies();
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Genel kurul"
        description="Yaklaşan toplantılar, gündem ve alınan kararlar."
      />
      {assemblies.isPending ? (
        <LoadingRows />
      ) : assemblies.isError ? (
        <ErrorState error={assemblies.error} />
      ) : assemblies.data.length === 0 ? (
        <EmptyState
          title="Toplantı yok"
          description="Yönetim genel kurul çağrısı yaptığında toplantı ve gündem burada görünür."
        />
      ) : (
        <div className="grid gap-4">
          {assemblies.data.map((m) => (
            <ResidentMeetingCard key={m.id} m={m} />
          ))}
        </div>
      )}
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Megaphone className="size-3.5" />
        Toplantı çağrıları duyurular sayfasında da yayınlanır.
      </p>
    </div>
  );
}
