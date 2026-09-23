import { formatKurus, type UnitDto, type UnitRemovalDto } from '@apartman/shared';
import { useQuery } from '@tanstack/react-query';
import { Archive, Trash2 } from 'lucide-react';
import { LoadingRows } from '@/components/page';
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
import { apiFetch } from '@/lib/api';
import { useApiMutation } from '@/lib/queries';
import { useSession } from '@/lib/session';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitId: string;
  label: string;
  onDeleted: () => void;
}

export function RemoveUnitDialog({ open, onOpenChange, unitId, label, onDeleted }: Props) {
  const { siteId } = useSession();
  const info = useQuery({
    queryKey: ['unit-removal', siteId, unitId],
    queryFn: () => apiFetch<UnitRemovalDto>(`/units/${unitId}/removal`),
    enabled: open,
    staleTime: 0,
  });
  const remove = useApiMutation(() => apiFetch<void>(`/units/${unitId}`, { method: 'DELETE' }), {
    success: `${label} silindi`,
    onSuccess: onDeleted,
  });
  const archive = useApiMutation(
    () => apiFetch<UnitDto>(`/units/${unitId}/archive`, { method: 'POST' }),
    { success: `${label} arşivlendi`, onSuccess: () => onOpenChange(false) },
  );

  const data = info.data;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {data && !data.canDelete ? `${label} arşivlensin mi?` : `${label} silinsin mi?`}
          </DialogTitle>
          <DialogDescription>
            {!data
              ? 'Daire kontrol ediliyor…'
              : data.canDelete
                ? 'Bu işlem geri alınamaz.'
                : 'Bu dairenin ödeme veya sakin geçmişi olduğu için silinemez. Arşivlenen daire listelerden ve aylık aidattan çıkar, geçmişi raporlarda kalır. İstediğiniz zaman arşivden çıkarabilirsiniz.'}
          </DialogDescription>
        </DialogHeader>

        {info.isPending ? (
          <LoadingRows rows={1} />
        ) : data?.canDelete ? (
          data.chargeCount > 0 && (
            <Alert>
              <AlertDescription>
                Bu daireye yazılmış {data.chargeCount} borç kaydı (toplam{' '}
                {formatKurus(data.openKurus)}) de silinecek. Daireye hiç ödeme yapılmadığı için kasa
                ve tahsilat kayıtları etkilenmez.
              </AlertDescription>
            </Alert>
          )
        ) : data && data.activeResidentCount > 0 ? (
          <Alert variant="destructive">
            <AlertDescription>
              Dairede oturan {data.activeResidentCount} sakin var. Arşivlemeden önce sakinleri
              “Taşındı olarak işaretle” ile çıkarın.
            </AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          {data?.canDelete ? (
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate(undefined)}
            >
              <Trash2 />
              Sil
            </Button>
          ) : (
            <Button
              disabled={!data?.canArchive || archive.isPending}
              onClick={() => archive.mutate(undefined)}
            >
              <Archive />
              Arşivle
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
