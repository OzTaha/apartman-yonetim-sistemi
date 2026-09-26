import {
  messageChannelLabels,
  PASSWORD_RESET_HOURS,
  type MessageChannel,
  type PasswordResetLinkDto,
} from '@apartman/shared';
import { Check, Copy, KeyRound, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { formatPhone } from '@/lib/format';

export function PasswordResetDialog({
  open,
  onOpenChange,
  personName,
  phone,
  request,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personName: string;
  phone?: string | null;
  request: (send?: MessageChannel) => Promise<PasswordResetLinkDto>;
}) {
  const [link, setLink] = useState<PasswordResetLinkDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function create(send?: MessageChannel) {
    setBusy(true);
    try {
      const result = await request(send);
      setLink(result);
      if (result.sentVia)
        toast.success(`Bağlantı ${messageChannelLabels[result.sentVia]} ile gönderildi`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      toast.success('Bağlantı kopyalandı');
    } catch {
      toast.error('Kopyalanamadı. Bağlantıyı elle seçip kopyalayın.');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          setLink(null);
          setCopied(false);
        }
        onOpenChange(value);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Şifre yenileme bağlantısı</DialogTitle>
          <DialogDescription>
            {personName} bu bağlantıyla yeni şifresini belirler. Bağlantı tek kullanımlıktır ve{' '}
            {PASSWORD_RESET_HOURS} saat geçerlidir; yenisi oluşturulursa eskisi geçersiz olur. Yeni
            şifre belirlenince açık oturumları kapatılır.
          </DialogDescription>
        </DialogHeader>

        {link ? (
          <div className="grid gap-3">
            {link.sendError && (
              <Alert variant="destructive">
                <AlertDescription>{link.sendError}</AlertDescription>
              </Alert>
            )}
            <div className="flex gap-2">
              <Input
                readOnly
                value={link.url}
                aria-label="Şifre yenileme bağlantısı"
                onFocus={(e) => e.target.select()}
              />
              <Button type="button" variant="outline" onClick={() => void copy()}>
                {copied ? <Check /> : <Copy />}
                Kopyala
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {link.sentVia
                ? `Bağlantı ${formatPhone(phone)} numarasına ${messageChannelLabels[link.sentVia]} ile gönderildi.`
                : 'Bağlantıyı kopyalayıp kişiye iletin.'}
            </p>
          </div>
        ) : (
          <DialogFooter className="gap-2 sm:flex-wrap">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Vazgeç
            </Button>
            {phone && (
              <>
                <Button variant="outline" disabled={busy} onClick={() => void create('SMS')}>
                  <MessageSquare />
                  SMS ile gönder
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => void create('WHATSAPP')}>
                  <MessageSquare />
                  WhatsApp ile gönder
                </Button>
              </>
            )}
            <Button disabled={busy} onClick={() => void create()}>
              <KeyRound />
              {busy ? 'Oluşturuluyor…' : 'Bağlantı oluştur'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
