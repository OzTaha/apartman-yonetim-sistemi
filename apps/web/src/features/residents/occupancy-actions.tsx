import type { OccupancyDto, PasswordResetLinkDto } from '@apartman/shared';
import { DoorOpen, KeyRound, Link2, MoreHorizontal, Pencil } from 'lucide-react';
import { useState } from 'react';
import { PasswordResetDialog } from '@/components/password-reset-dialog';
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
import { InvitationDialog, MoveOutDialog, OccupancyFormDialog } from './resident-dialogs';

export function OccupancyTypeBadge({ type }: { type: OccupancyDto['type'] }) {
  return (
    <Badge variant={type === 'OWNER' ? 'secondary' : 'outline'}>
      {type === 'OWNER' ? 'Malik' : 'Kiracı'}
    </Badge>
  );
}

export function OccupancyActions({ occupancy }: { occupancy: OccupancyDto }) {
  const [dialog, setDialog] = useState<'edit' | 'invite' | 'reset' | 'move-out' | null>(null);
  const active = isActiveOccupancy(occupancy);
  const canInvite = active && !occupancy.hasAccount && Boolean(occupancy.phone || occupancy.email);

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
    </div>
  );
}
