import { WifiOff } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';

function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

export function OfflineScreen() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <div
      role="alert"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background p-6 text-center"
    >
      <WifiOff className="size-10 text-muted-foreground" />
      <div className="grid gap-1">
        <p className="text-lg font-semibold">İnternet bağlantısı yok</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Bağlantınız geri geldiğinde sayfa kaldığı yerden devam eder.
        </p>
      </div>
      <Button variant="outline" onClick={() => window.location.reload()}>
        Tekrar dene
      </Button>
    </div>
  );
}
