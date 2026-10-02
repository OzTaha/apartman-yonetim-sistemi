import {
  campaignKindLabels,
  deliveryStatusLabels,
  renderTemplate,
  smsInfo,
  TEMPLATE_VARIABLES,
  type CampaignDto,
  type DeliveryStatus,
  type MessageChannel,
} from '@apartman/shared';
import { InfoTip } from '@/components/info-tip';
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

const sampleValues = {
  ad: 'Ayşe Yılmaz',
  daire: 'Daire 5',
  borc: '₺1.500,00',
  site: 'Güneş Apartmanı',
} as const;

export function VariableButtons({
  onInsert,
  text,
}: {
  onInsert: (text: string) => void;
  text?: string;
}) {
  const usesVariable =
    text !== undefined && TEMPLATE_VARIABLES.some((v) => text.includes(`{${v.key}}`));
  return (
    <div className="grid w-full gap-2 rounded-xl border border-dashed p-3">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold">Kişiye özel bilgi ekle</p>
        <InfoTip title="Bu düğmeler ne işe yarar?" className="text-primary">
          <p>
            Aynı mesaj birçok kişiye gider. Bu düğmeler, mesajın içine her kişinin kendi bilgisini
            koymanızı sağlar.
          </p>
          <p>
            Örneğin "Sakinin adı" düğmesine dokunursanız mesaja {'{ad}'} eklenir. Ayşe Hanım'a giden
            mesajda o yerde "Ayşe Yılmaz", Mehmet Bey'e gidende "Mehmet Demir" yazar.
          </p>
          <p>
            Süslü parantezleri ve içindeki kelimeyi değiştirmeyin; yoksa bilgi yerine bu yazı olduğu
            gibi gider.
          </p>
        </InfoTip>
      </div>
      <div className="flex flex-wrap gap-2">
        {TEMPLATE_VARIABLES.map((v) => (
          <Button
            key={v.key}
            type="button"
            size="sm"
            variant="outline"
            className="h-auto flex-col items-start gap-0 py-1.5 text-left"
            aria-label={`${v.label} ekle`}
            onClick={() => onInsert(`{${v.key}}`)}
          >
            <span>{v.label}</span>
            <span className="font-mono text-xs font-normal text-muted-foreground">
              {`{${v.key}}`}
            </span>
          </Button>
        ))}
      </div>
      {usesVariable && (
        <div className="grid gap-1 rounded-lg bg-muted p-3 text-sm">
          <p className="font-semibold">Örnek: Ayşe Yılmaz'a şöyle gider</p>
          <p className="break-words whitespace-pre-line text-muted-foreground">
            {renderTemplate(text, sampleValues)}
          </p>
        </div>
      )}
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
