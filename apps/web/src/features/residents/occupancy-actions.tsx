import type { OccupancyDto, PasswordResetLinkDto } from '@apartman/shared';
import { DoorOpen, KeyRound, Link2, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { PasswordResetDialog } from '@/components/password-reset-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiFetch } from '@/lib/api';
import { fullName, isActiveOccupancy } from '@/lib/format';
import { useApiMutation } from '@/lib/queries';
import { useRole } from '@/lib/session';
import { InvitationDialog, MoveOutDialog, OccupancyFormDialog } from './resident-dialogs';

export function OccupancyTypeBadge({ type }: { type: OccupancyDto['type'] }) {
  return (
    <Badge variant={type === 'OWNER' ? 'secondary' : 'outline'}>
      {type === 'OWNER' ? 'Malik' : 'Kiracı'}
    </Badge>
  );
}

export function OccupancyActions({ occupancy }: { occupancy: OccupancyDto }) {
  const [dialog, setDialog] = useState<'edit' | 'invite' | 'reset' | 'move-out' | 'delete' | null>(
    null,
  );
  const auditor = useRole() === 'AUDITOR';
  const remove = useApiMutation(
    () => apiFetch<void>(`/residents/${occupancy.id}`, { method: 'DELETE' }),
    { success: 'Sakin kaydı silindi', onSuccess: () => setDialog(null) },
  );
  const active = isActiveOccupancy(occupancy);
  const canInvite = active && !occupancy.hasAccount && Boolean(occupancy.phone || occupancy.email);

  if (auditor) return null;
  return (
    <div className="inline-flex" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`${fullName(occupancy)} için işlemler`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog('edit')}>
            <Pencil />
            Düzenle
          </DropdownMenuItem>
          {canInvite && (
            <DropdownMenuItem onSelect={() => setDialog('invite')}>
              <Link2 />
              Davet bağlantısı oluştur
            </DropdownMenuItem>
          )}
          {active && occupancy.hasAccount && (
            <DropdownMenuItem onSelect={() => setDialog('reset')}>
              <KeyRound />
              Şifre yenileme bağlantısı
            </DropdownMenuItem>
          )}
          {active && (
            <DropdownMenuItem variant="destructive" onSelect={() => setDialog('move-out')}>
              <DoorOpen />
              Taşındı olarak işaretle
            </DropdownMenuItem>
          )}
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog('delete')}>
            <Trash2 />
            Kaydı sil
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <OccupancyFormDialog
        open={dialog === 'edit'}
        onOpenChange={(o) => setDialog(o ? 'edit' : null)}
        occupancy={occupancy}
      />
      <InvitationDialog
        open={dialog === 'invite'}
        onOpenChange={(o) => setDialog(o ? 'invite' : null)}
        occupancy={occupancy}
      />
      <PasswordResetDialog
        open={dialog === 'reset'}
        onOpenChange={(o) => setDialog(o ? 'reset' : null)}
        personName={fullName(occupancy)}
        phone={occupancy.phone}
        request={(send) =>
          apiFetch<PasswordResetLinkDto>(`/residents/${occupancy.id}/password-reset`, {
            method: 'POST',
            body: { send },
          })
        }
      />
      <MoveOutDialog
        open={dialog === 'move-out'}
        onOpenChange={(o) => setDialog(o ? 'move-out' : null)}
        occupancy={occupancy}
      />
      <AlertDialog open={dialog === 'delete'} onOpenChange={(o) => setDialog(o ? 'delete' : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{fullName(occupancy)} kaydı silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              Yanlış girilen kayıtlar içindir; kayıt taşınma geçmişinde de görünmez. Daireden
              taşınan sakin için "Taşındı olarak işaretle"yi kullanın.
              {occupancy.hasAccount &&
                ' Sakinin hesabı açılmış; bu sitede başka dairesi yoksa siteye erişimi de kaldırılır.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                remove.mutate(undefined);
              }}
            >
              Kaydı sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
