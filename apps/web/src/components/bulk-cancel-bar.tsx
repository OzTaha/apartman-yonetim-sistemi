import type { BulkCancelResultDto } from '@apartman/shared';
import { Ban, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CancelDialog } from '@/features/dues/small-dialogs';
import { apiFetch } from '@/lib/api';
import { useApiMutation } from '@/lib/queries';

export function BulkCancelBar({
  ids,
  endpoint,
  noun,
  description,
  onClear,
}: {
  ids: string[];
  endpoint: string;
  noun: string;
  description: string;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const cancel = useApiMutation(
    (reason: string) =>
      apiFetch<BulkCancelResultDto>(endpoint, { method: 'POST', body: { ids, reason } }),
    {
      onSuccess: (result) => {
        if (result.cancelled > 0) toast.success(`${result.cancelled} ${noun} iptal edildi`);
        if (result.skipped.length > 0) {
          const reasons = [...new Set(result.skipped.map((s) => s.message))].join(' ');
          toast.warning(`${result.skipped.length} ${noun} iptal edilemedi. ${reasons}`);
        }
        setOpen(false);
        onClear();
      },
    },
  );
  if (ids.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Toplu işlem"
      className="sticky bottom-2 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background/95 p-2 pl-3 shadow-md backdrop-blur"
    >
      <span className="text-sm font-medium">
        {ids.length} {noun} seçildi
      </span>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X />
          Seçimi temizle
        </Button>
        <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
          <Ban />
          Seçilenleri iptal et
        </Button>
      </div>
      <CancelDialog
        open={open}
        onOpenChange={setOpen}
        title={`${ids.length} ${noun} iptal edilsin mi?`}
        description={description}
        pending={cancel.isPending}
        onConfirm={(reason) => cancel.mutate(reason)}
      />
    </div>
  );
}
