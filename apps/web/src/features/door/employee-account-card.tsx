import type { EmployeeAccountDto, InvitationDto } from '@apartman/shared';
import { Copy, KeyRound, UserX } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { InfoTip } from '@/components/info-tip';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api';
import { useApiMutation, useEmployeeAccount } from '@/lib/queries';

export function EmployeeAccountCard({
  employeeId,
  name,
  hasPhone,
}: {
  employeeId: string;
  name: string;
  hasPhone: boolean;
}) {
  const account = useEmployeeAccount(employeeId);
  const [link, setLink] = useState<InvitationDto | null>(null);
  const base = `/employees/${employeeId}/account`;
  const invite = useApiMutation(
    () => apiFetch<InvitationDto>(`${base}/invitation`, { method: 'POST' }),
    { onSuccess: setLink },
  );
  const door = useApiMutation(
    (doorAccess: boolean) =>
      apiFetch<EmployeeAccountDto>(base, { method: 'PATCH', body: { doorAccess } }),
    { success: 'Kaydedildi' },
  );
  const revoke = useApiMutation(() => apiFetch<EmployeeAccountDto>(base, { method: 'DELETE' }), {
    success: 'Hesap kapatıldı',
    onSuccess: () => setLink(null),
  });

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      toast.success('Bağlantı kopyalandı');
    } catch {
      toast.error('Kopyalanamadı. Bağlantıyı elle seçip kopyalayın.');
    }
  }

  const a = account.data;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Giriş hesabı</CardTitle>
          <InfoTip title="Giriş hesabı ne işe yarar?" className="text-primary">
            <p>
              Hesap açarsanız {name} kendi telefonundan uygulamaya girebilir. Girişte yalnızca
              kendisine verilen işleri ve çalışma saatlerini görür; işi bitirince "Bitirdim" der.
            </p>
            <p>
              "Kapı sayfasını kullanabilir" işaretliyse gelen kargoları ve misafirleri de kaydeder;
              sakinlere telefonlarına bildirim gider. Aidat, kasa gibi bilgileri göremez.
            </p>
          </InfoTip>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!a ? null : a.hasAccount ? (
          <p className="font-semibold text-emerald-700 dark:text-emerald-400">
            {name} uygulamaya girebiliyor.
          </p>
        ) : (
          <p className="text-muted-foreground">
            {a.invitationPending
              ? 'Davet bağlantısı gönderildi, henüz kullanılmadı.'
              : 'Henüz giriş hesabı yok.'}
          </p>
        )}

        {a && !a.hasAccount && (
          <>
            {!hasPhone && (
              <p className="text-sm text-destructive">
                Hesap açmak için önce çalışanın telefon numarasını girin. Giriş bu numarayla
                yapılır.
              </p>
            )}
            <Button
              className="w-fit"
              disabled={!hasPhone || invite.isPending}
              onClick={() => invite.mutate(undefined)}
            >
              <KeyRound />
              {a.invitationPending ? 'Yeni davet bağlantısı oluştur' : 'Davet bağlantısı oluştur'}
            </Button>
          </>
        )}

        {link && (
          <div className="grid gap-2 rounded-lg bg-muted p-3">
            <p className="text-sm">
              Bu bağlantıyı {name} kişisine WhatsApp veya SMS ile gönderin. Bağlantıyı açıp
              şifresini belirler. 7 gün geçerlidir.
            </p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={link.url}
                aria-label="Davet bağlantısı"
                onFocus={(e) => e.target.select()}
              />
              <Button variant="outline" onClick={() => void copy()}>
                <Copy />
                Kopyala
              </Button>
            </div>
          </div>
        )}

        {a && (
          <div className="flex items-start gap-2">
            <Checkbox
              id={`door-${employeeId}`}
              checked={a.doorAccess}
              disabled={door.isPending}
              onCheckedChange={(v) => door.mutate(v === true)}
            />
            <Label htmlFor={`door-${employeeId}`} className="grid gap-0.5 font-normal">
              <span className="font-semibold">Kapı sayfasını kullanabilir</span>
              <span className="text-sm text-muted-foreground">
                Kargo ve misafir kaydı yapabilir. Kapıcı ve güvenlik görevlileri için.
              </span>
            </Label>
          </div>
        )}

        {a?.hasAccount && (
          <Button
            variant="outline"
            className="w-fit text-destructive"
            disabled={revoke.isPending}
            onClick={() => revoke.mutate(undefined)}
          >
            <UserX />
            Hesabı kapat
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
