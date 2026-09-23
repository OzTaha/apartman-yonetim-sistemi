import type { OccupancyDto } from '@apartman/shared';
import { DoorOpen, Link2, MoreHorizontal, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  const [dialog, setDialog] = useState<'edit' | 'invite' | 'move-out' | null>(null);
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
      <MoveOutDialog
        open={dialog === 'move-out'}
        onOpenChange={(o) => setDialog(o ? 'move-out' : null)}
        occupancy={occupancy}
      />
    </div>
  );
}
