import {
  campaignKindLabels,
  deliveryStatusLabels,
  smsInfo,
  TEMPLATE_VARIABLES,
  type CampaignDto,
  type DeliveryStatus,
  type MessageChannel,
} from '@apartman/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const statusClasses: Record<DeliveryStatus, string> = {
  QUEUED: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  SENT: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  SKIPPED: 'bg-muted text-muted-foreground',
};

export function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  return (
    <Badge variant="secondary" className={statusClasses[status]}>
      {deliveryStatusLabels[status]}
    </Badge>
  );
}

export function SmsCounter({ text, channel }: { text: string; channel: MessageChannel }) {
  const info = smsInfo(text);
  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      {info.characters} karakter
      {channel === 'SMS' && info.segments > 0 && ` · ${info.segments} SMS`}
      {channel === 'SMS' && info.unicode && ' (Türkçe karakterli)'}
    </span>
  );
}

export function VariableButtons({ onInsert }: { onInsert: (text: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {TEMPLATE_VARIABLES.map((v) => (
        <Button
          key={v.key}
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          title={v.label}
          onClick={() => onInsert(`{${v.key}}`)}
        >
          {`{${v.key}}`}
        </Button>
      ))}
    </div>
  );
}

export function CampaignKind({ c }: { c: CampaignDto }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {campaignKindLabels[c.kind]}
      {c.automatic && <Badge variant="outline">Otomatik</Badge>}
    </span>
  );
}

export function CampaignCounts({ c }: { c: CampaignDto }) {
  return (
    <span className="inline-flex flex-wrap gap-x-2 text-xs tabular-nums">
      <span className="text-emerald-700 dark:text-emerald-400">{c.counts.sent} gönderildi</span>
      {c.counts.queued > 0 && <span>{c.counts.queued} sırada</span>}
      {c.counts.failed > 0 && (
        <span className="text-red-700 dark:text-red-400">{c.counts.failed} başarısız</span>
      )}
      {c.counts.skipped > 0 && (
        <span className="text-muted-foreground">{c.counts.skipped} atlandı</span>
      )}
    </span>
  );
}
