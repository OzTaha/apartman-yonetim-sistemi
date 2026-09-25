import {
  messageChannelLabels,
  recipientFilterLabels,
  type CampaignDto,
  type DeliveryDto,
} from '@apartman/shared';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, Megaphone, RotateCcw } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { ManagerOnly } from '@/components/manager-only';
import { ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CampaignCounts, CampaignKind, DeliveryStatusBadge } from '@/features/communication/parts';
import { apiFetch } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { useApiMutation, useCampaign } from '@/lib/queries';
import { labelUnit } from '@/lib/unit-label';

export const Route = createFileRoute('/_app/mesajlar/$campaignId')({
  component: () => (
    <ManagerOnly>
      <CampaignDetailPage />
    </ManagerOnly>
  ),
});

const dateTime = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Istanbul',
});

const unitOf = (d: DeliveryDto) =>
  d.blockName && d.unitNumber ? labelUnit(d.blockName, d.unitNumber) : '—';

const columns: ColumnDef<DeliveryDto>[] = [
  { accessorKey: 'name', header: 'Alıcı' },
  { id: 'unit', header: 'Daire', accessorFn: unitOf },
  {
    accessorKey: 'phone',
    header: 'Telefon',
    enableSorting: false,
    cell: ({ row }) => formatPhone(row.original.phone),
  },
  {
    accessorKey: 'status',
    header: 'Durum',
    cell: ({ row }) => (
      <span className="grid gap-0.5">
        <DeliveryStatusBadge status={row.original.status} />
        {row.original.error && (
          <span className="text-xs text-muted-foreground">{row.original.error}</span>
        )}
      </span>
    ),
  },
];

function CampaignDetailPage() {
  const { campaignId } = Route.useParams();
  const campaign = useCampaign(campaignId);
  const retry = useApiMutation(
    () => apiFetch<CampaignDto>(`/messages/${campaignId}/retry`, { method: 'POST' }),
    { success: 'Başarısız mesajlar yeniden sıraya alındı' },
  );

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
      <Link to="/mesajlar">
        <ArrowLeft />
        Mesajlar
      </Link>
    </Button>
  );

  if (campaign.isPending) return <LoadingRows />;
  if (campaign.isError)
    return (
      <div className="grid gap-4">
        {back}
        <ErrorState error={campaign.error} />
      </div>
    );

  const c = campaign.data;

  return (
    <div className="grid gap-6">
      {back}
      <PageHeader
        title={dateTime.format(new Date(c.createdAt))}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2">
            <CampaignKind c={c} />
            <span>· {messageChannelLabels[c.channel]}</span>
            <span>· {recipientFilterLabels[c.filter]}</span>
            {c.createdByName && <span>· {c.createdByName}</span>}
          </span>
        }
        actions={
          <>
            {c.announcementId && (
              <Button variant="outline" asChild>
                <Link to="/duyurular/$announcementId" params={{ announcementId: c.announcementId }}>
                  <Megaphone />
                  Duyuru
                </Link>
              </Button>
            )}
            {c.counts.failed > 0 && (
              <Button disabled={retry.isPending} onClick={() => retry.mutate(undefined)}>
                <RotateCcw />
                Başarısızları yeniden dene
              </Button>
            )}
          </>
        }
      />
      <Card className="py-4">
        <CardContent className="grid gap-2">
          <CampaignCounts c={c} />
          <p className="text-sm break-words whitespace-pre-line text-muted-foreground">{c.body}</p>
        </CardContent>
      </Card>
      <DataTable
        columns={columns}
        data={c.deliveries}
        getRowId={(d) => d.id}
        mobileCard={(d) => (
          <div className="grid gap-1">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 truncate font-medium">{d.name}</span>
              <DeliveryStatusBadge status={d.status} />
            </div>
            <span className="text-xs text-muted-foreground">
              {[unitOf(d), d.phone && formatPhone(d.phone), d.error].filter(Boolean).join(' · ')}
            </span>
          </div>
        )}
      />
    </div>
  );
}
