import { BellRing, Share } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiFetch, errorMessage } from '@/lib/api';
import { disablePush, enablePush, usePushState, type PushState } from '@/lib/push';
import { useSession } from '@/lib/session';

const dismissKey = (userId: string) => `apartman.pushPrompt.${userId}`;

function readDismissed(userId: string | undefined): boolean {
  if (!userId) return true;
  try {
    return localStorage.getItem(dismissKey(userId)) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(userId: string) {
  try {
    localStorage.setItem(dismissKey(userId), '1');
  } catch {
    return;
  }
}

function InstallHint() {
  return (
    <ol className="grid list-decimal gap-1 pl-5 text-sm">
      <li>
        Safari'de alttaki <Share className="inline size-4 align-text-bottom" /> Paylaş düğmesine
        dokunun.
      </li>
      <li>"Ana Ekrana Ekle"yi seçin.</li>
      <li>Uygulamayı ana ekrandaki simgesinden açın ve bildirimleri buradan açın.</li>
    </ol>
  );
}

const explain =
  'Yeni duyuru geldiğinde, ödemeniz kaydedildiğinde ya da talebinize yanıt yazıldığında telefonunuz size haber verir. SMS gibi gelir ama ücretsizdir. İstediğiniz zaman kapatabilirsiniz.';

function useToggle(setState: (s: PushState) => void) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<PushState>, success?: string) => {
    setBusy(true);
    try {
      const next = await fn();
      setState(next);
      if (next === 'on' && success) toast.success(success);
      if (next === 'denied') toast.error('Bildirim izni verilmedi.');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

export function PushPrompt() {
  const { user } = useSession();
  const { state, setState } = usePushState();
  const [dismissed, setDismissed] = useState(() => readDismissed(user?.id));
  const { busy, run } = useToggle(setState);
  if (dismissed || (state !== 'off' && state !== 'needs-install')) return null;

  const dismiss = () => {
    if (user) writeDismissed(user.id);
    setDismissed(true);
  };

  return (
    <section
      aria-label="Telefon bildirimleri"
      className="grid gap-3 rounded-2xl border-2 border-dashed border-primary/40 bg-card p-5"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <BellRing className="size-6" />
        </span>
        <div className="grid gap-1">
          <h2 className="text-lg leading-tight font-semibold">Telefonunuza bildirim gelsin mi?</h2>
          <p className="text-sm text-muted-foreground">{explain}</p>
        </div>
      </div>
      {state === 'needs-install' ? (
        <>
          <p className="text-sm font-semibold">iPhone'da bildirim almak için:</p>
          <InstallHint />
          <Button variant="ghost" className="w-fit" onClick={dismiss}>
            Anladım
          </Button>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void run(enablePush, 'Bildirimler açıldı')}>
            <BellRing />
            Bildirimleri aç
          </Button>
          <Button variant="ghost" onClick={dismiss}>
            Şimdi değil
          </Button>
        </div>
      )}
    </section>
  );
}

export function PushSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { state, setState } = usePushState();
  const { busy, run } = useToggle(setState);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Telefon bildirimleri</DialogTitle>
          <DialogDescription>{explain}</DialogDescription>
        </DialogHeader>
        {state === 'loading' ? null : state === 'unsupported' ? (
          <p className="text-sm">
            Bu tarayıcı bildirimleri desteklemiyor. Telefonunuzda Chrome veya Safari ile açıp
            uygulamayı ana ekrana ekleyin.
          </p>
        ) : state === 'needs-install' ? (
          <div className="grid gap-2">
            <p className="text-sm font-semibold">iPhone'da bildirim almak için:</p>
            <InstallHint />
          </div>
        ) : state === 'denied' ? (
          <p className="text-sm">
            Bildirimlere daha önce izin verilmemiş. Telefonunuzun veya tarayıcınızın ayarlarından bu
            siteye bildirim izni verip sayfayı yenileyin.
          </p>
        ) : state === 'on' ? (
          <div className="grid gap-3">
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              Bu cihazda bildirimler açık.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void apiFetch<{ delivered: number }>('/push/test', {
                    method: 'POST',
                    siteId: null,
                  }).then(
                    () => toast.success('Deneme bildirimi gönderildi'),
                    (e: unknown) => toast.error(errorMessage(e)),
                  )
                }
              >
                Deneme bildirimi gönder
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => void run(disablePush)}>
                Bildirimleri kapat
              </Button>
            </div>
          </div>
        ) : (
          <Button
            className="w-fit"
            disabled={busy}
            onClick={() => void run(enablePush, 'Bildirimler açıldı')}
          >
            <BellRing />
            Bildirimleri aç
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
