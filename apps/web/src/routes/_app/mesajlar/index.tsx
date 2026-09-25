import { messageChannelLabels, recipientFilterLabels, type CampaignDto } from '@apartman/shared';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Send, Settings2 } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { ManagerOnly } from '@/components/manager-only';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { CampaignCounts, CampaignKind } from '@/features/communication/parts';
import { useCampaigns } from '@/lib/queries';

export const Route = createFileRoute('/_app/mesajlar/')({
  component: () => (
    <ManagerOnly>
      <CampaignsPage />
    </ManagerOnly>
  ),
});

const dateTime = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Istanbul',
});

const columns: ColumnDef<CampaignDto>[] = [
  {
    accessorKey: 'createdAt',
    header: 'Tarih',
    cell: ({ row }) => dateTime.format(new Date(row.original.createdAt)),
  },
  {
    accessorKey: 'kind',
    header: 'Tür',
    cell: ({ row }) => <CampaignKind c={row.original} />,
  },
  {
    accessorKey: 'channel',
    header: 'Kanal',
    cell: ({ row }) => messageChannelLabels[row.original.channel],
  },
  {
    accessorKey: 'filter',
    header: 'Alıcılar',
    enableSorting: false,
    cell: ({ row }) => recipientFilterLabels[row.original.filter],
  },
  {
    id: 'counts',
    header: 'Durum',
    enableSorting: false,
    cell: ({ row }) => <CampaignCounts c={row.original} />,
  },
];

function CampaignsPage() {
  const campaigns = useCampaigns();
  const navigate = useNavigate();

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Mesajlar"
        description="SMS ve WhatsApp gönderimleri ve alıcı bazında durumları."
        actions={
          <>
            <Button asChild>
              <Link to="/mesajlar/yeni">
                <Send />
                Mesaj gönder
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/mesaj-ayarlari">
                <Settings2 />
                Şablonlar ve hatırlatma
              </Link>
            </Button>
          </>
        }
      />
      {campaigns.isPending ? (
        <LoadingRows />
      ) : campaigns.isError ? (
        <ErrorState error={campaigns.error} />
      ) : (
        <DataTable
          columns={columns}
          data={campaigns.data}
          getRowId={(c) => c.id}
          onRowClick={(c) =>
            void navigate({ to: '/mesajlar/$campaignId', params: { campaignId: c.id } })
          }
          mobileCard={(c) => (
            <div className="grid gap-1">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">
                  <CampaignKind c={c} />
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {dateTime.format(new Date(c.createdAt))}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {messageChannelLabels[c.channel]} · {recipientFilterLabels[c.filter]}
              </span>
              <CampaignCounts c={c} />
            </div>
          )}
          empty={
            <EmptyState
              title="Henüz mesaj gönderilmedi"
              description="Aidat hatırlatması, acil durum veya genel bilgi mesajlarını buradan gönderebilirsiniz."
            />
          }
        />
      )}
    </div>
  );
}
