import type { OnlinePaymentSettingsDto } from '@apartman/shared';
import { useState } from 'react';
import { Field } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingRows } from '@/components/page';
import { apiFetch } from '@/lib/api';
import { useApiMutation, useCashAccounts, useOnlineSettings } from '@/lib/queries';

const DEFAULT = 'default';

function SettingsForm({ settings }: { settings: OnlinePaymentSettingsDto }) {
  const accounts = useCashAccounts();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [accountId, setAccountId] = useState(settings.accountId ?? DEFAULT);
  const save = useApiMutation(
    () =>
      apiFetch<OnlinePaymentSettingsDto>('/online-payments/settings', {
        method: 'PUT',
        body: { enabled, accountId: accountId === DEFAULT ? null : accountId },
      }),
    { success: 'Online ödeme ayarı kaydedildi' },
  );

  if (!settings.providerAvailable) {
    return (
      <Alert>
        <AlertDescription>
          Ödeme kuruluşu henüz tanımlanmadı. Sözleşme yapılan kuruluşun bilgileri sunucuya
          girildiğinde online ödeme buradan açılabilir.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined);
      }}
    >
      {settings.testMode && (
        <Alert>
          <AlertDescription>
            Test modu: sakinler test ödeme sayfasına yönlendirilir, gerçek para çekilmez.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex items-start gap-2">
        <Checkbox
          id="online-enabled"
          checked={enabled}
          onCheckedChange={(v) => setEnabled(v === true)}
        />
        <Label htmlFor="online-enabled" className="grid gap-0.5 font-normal">
          <span className="font-medium">Sakinler borçlarını online ödeyebilsin</span>
          <span className="text-xs text-muted-foreground">
            "Dairem" sayfasında "Online öde" düğmesi görünür. Ödeme makbuzu kendiliğinden oluşur.
          </span>
        </Label>
      </div>
      <Field label="Gelirin yazılacağı hesap" htmlFor="online-account">
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger id="online-account" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT}>Banka hesabı (varsayılan)</SelectItem>
            {(accounts.data ?? [])
              .filter((a) => a.isActive)
              .map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </Field>
      <Button type="submit" className="w-fit" disabled={save.isPending}>
        Kaydet
      </Button>
    </form>
  );
}

export function OnlinePaymentCard() {
  const settings = useOnlineSettings();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Online ödeme</CardTitle>
        <CardDescription>
          Varsayılan olarak kapalıdır. Online tahsilat yalnızca sakine iade edilerek iptal edilir.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {settings.isPending ? (
          <LoadingRows rows={2} />
        ) : settings.data ? (
          <SettingsForm key={JSON.stringify(settings.data)} settings={settings.data} />
        ) : null}
      </CardContent>
    </Card>
  );
}
