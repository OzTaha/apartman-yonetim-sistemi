import {
  SITE_RESTORE_DAYS,
  siteKindLabels,
  type DeletedSiteDto,
  type SiteDto,
} from '@apartman/shared';
import { useQuery } from '@tanstack/react-query';
import { Download, RotateCcw, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Field } from '@/components/form-field';
import { PasswordInput } from '@/components/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { apiFetch, downloadFile, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useApiMutation } from '@/lib/queries';

const deletedSitesKey = ['sites', 'deleted'] as const;

function useExport(site: { id: string; name: string }) {
  const [pending, setPending] = useState(false);
  return {
    pending,
    run: async () => {
      setPending(true);
      try {
        await downloadFile(`/sites/${site.id}/export.xlsx`, `${site.name} veriler.xlsx`);
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        setPending(false);
      }
    },
  };
}

export function DeleteSiteDialog({
  site,
  open,
  onOpenChange,
}: {
  site: SiteDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [confirmName, setConfirmName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const exporter = useExport(site);
  const kind = siteKindLabels[site.kind].toLocaleLowerCase('tr');
  const nameMatches =
    confirmName.trim().toLocaleLowerCase('tr') === site.name.toLocaleLowerCase('tr');

  const close = (next: boolean) => {
    if (!next) {
      setConfirmName('');
      setIdentifier('');
      setPassword('');
    }
    onOpenChange(next);
  };

  const remove = useApiMutation(
    () =>
      apiFetch<void>(`/sites/${site.id}`, {
        method: 'DELETE',
        body: { confirmName, identifier, password },
      }),
    {
      success: `${site.name} silindi. ${SITE_RESTORE_DAYS} gün içinde "Silinenler" bölümünden geri getirebilirsiniz.`,
      onSuccess: () => close(false),
    },
  );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{site.name} silinsin mi?</DialogTitle>
          <DialogDescription>
            Bu {kind} ve içindeki tüm daireler, sakinler, borçlar, tahsilatlar, kasa kayıtları ve
            belgeler silinir. Yöneticiler ve sakinler giriş yaptıklarında artık burayı göremez.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Alert>
            <TriangleAlert />
            <AlertDescription>
              Silinen {kind} {SITE_RESTORE_DAYS} gün boyunca "Silinenler" bölümünde bekler ve geri
              getirilebilir. Bu süre dolunca kalıcı olarak silinir; başka bir yerde üyeliği olmayan
              kullanıcı hesapları da kaldırılır.
            </AlertDescription>
          </Alert>
          <div className="grid gap-2 rounded-md border p-3">
            <p className="text-sm">
              Önce verileri indirin. Daireler, sakinler, borçlar, tahsilatlar, gelir-gider, yapılan
              işler, firmalar, çalışanlar, talepler ve genel kurul kararları tek bir Excel
              dosyasında ayrı sayfalar halinde iner.
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              disabled={exporter.pending}
              onClick={() => void exporter.run()}
            >
              <Download />
              {exporter.pending ? 'Hazırlanıyor…' : 'Verileri Excel olarak indir'}
            </Button>
          </div>
          <form
            id="delete-site-form"
            className="grid gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!nameMatches || !identifier || !password) return;
              remove.mutate(undefined);
            }}
          >
            <Field label={`Onaylamak için "${site.name}" yazın`} htmlFor="delete-confirm" required>
              <Input
                id="delete-confirm"
                autoComplete="off"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
              />
            </Field>
            <p className="text-sm text-muted-foreground">
              Güvenlik için kendi giriş bilgilerinizi yeniden girin.
            </p>
            <Field label="E-posta veya telefon" htmlFor="delete-identifier" required>
              <Input
                id="delete-identifier"
                autoComplete="username"
                spellCheck={false}
                autoCapitalize="none"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value.replace(/\s/g, ''))}
              />
            </Field>
            <Field label="Şifre" htmlFor="delete-password" required>
              <PasswordInput
                id="delete-password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          </form>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Vazgeç
          </Button>
          <Button
            type="submit"
            form="delete-site-form"
            variant="destructive"
            disabled={!nameMatches || !identifier || !password || remove.isPending}
          >
            {remove.isPending ? 'Siliniyor…' : 'Evet, sil'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeletedSiteRow({ site }: { site: DeletedSiteDto }) {
  const exporter = useExport(site);
  const [now] = useState(() => Date.now());
  const daysLeft = Math.max(0, Math.ceil((Date.parse(site.purgeAt) - now) / 86_400_000));
  const restore = useApiMutation(
    () => apiFetch<void>(`/sites/${site.id}/restore`, { method: 'POST' }),
    { success: `${site.name} geri getirildi` },
  );
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
      <div className="grid min-w-0 gap-0.5">
        <span className="flex items-center gap-2 font-medium">
          <span className="truncate">{site.name}</span>
          <Badge variant="secondary">{siteKindLabels[site.kind]}</Badge>
        </span>
        <span className="text-xs text-muted-foreground">
          {formatDate(site.deletedAt.slice(0, 10))} tarihinde silindi ·{' '}
          {daysLeft === 0 ? 'bu gece kalıcı silinecek' : `${daysLeft} gün sonra kalıcı silinecek`}
        </span>
      </div>
      <span className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={exporter.pending}
          onClick={() => void exporter.run()}
        >
          <Download />
          Excel
        </Button>
        <Button size="sm" disabled={restore.isPending} onClick={() => restore.mutate(undefined)}>
          <RotateCcw />
          Geri getir
        </Button>
      </span>
    </li>
  );
}

export function DeletedSites() {
  const deleted = useQuery({
    queryKey: deletedSitesKey,
    queryFn: () => apiFetch<DeletedSiteDto[]>('/sites/deleted', { siteId: null }),
  });
  if (!deleted.data?.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Silinenler</CardTitle>
        <CardDescription>
          Silinen apartman ve siteler {SITE_RESTORE_DAYS} gün boyunca burada bekler.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-md border text-sm">
          {deleted.data.map((site) => (
            <DeletedSiteRow key={site.id} site={site} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
