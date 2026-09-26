import { siteRoleLabels, type OfficerDto, type OfficerRole } from '@apartman/shared';
import { createFileRoute } from '@tanstack/react-router';
import { Pencil, Plus, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Field } from '@/components/form-field';
import { ManagerOnly } from '@/components/manager-only';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
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
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckList } from '@/features/communication/target-picker';
import { apiFetch } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { useApiMutation, useBlocks, useOfficerCandidates, useOfficers } from '@/lib/queries';
import { blockScopeLabel, useIsApartment } from '@/lib/unit-label';

export const Route = createFileRoute('/_app/yetkililer')({
  component: () => (
    <ManagerOnly>
      <OfficersPage />
    </ManagerOnly>
  ),
});

const roleHints: Record<OfficerRole, string> = {
  BLOCK_MANAGER:
    'Seçilen blokların dairelerini, sakinlerini, borç ve tahsilatlarını yönetir; blok gideri girer, bloğa duyuru ve mesaj gönderir.',
  AUDITOR: 'Kasa, gelir-gider, borç ve tahsilatları görür; hiçbir kaydı değiştiremez.',
};

function OfficerDialog({
  open,
  onOpenChange,
  officer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  officer?: OfficerDto;
}) {
  const isApartment = useIsApartment();
  const candidates = useOfficerCandidates(open);
  const blocks = useBlocks();
  const [userId, setUserId] = useState(officer?.userId ?? '');
  const [role, setRole] = useState<OfficerRole>(
    officer?.role ?? (isApartment ? 'AUDITOR' : 'BLOCK_MANAGER'),
  );
  const [blockIds, setBlockIds] = useState<string[]>(officer?.blocks.map((b) => b.id) ?? []);

  const save = useApiMutation(
    () =>
      apiFetch<OfficerDto>('/officers', {
        method: 'PUT',
        body: { userId, role, blockIds: role === 'BLOCK_MANAGER' ? blockIds : [] },
      }),
    {
      success: (o) =>
        `${o.firstName} ${o.lastName} ${siteRoleLabels[o.role].toLocaleLowerCase('tr')} olarak atandı`,
      onSuccess: () => onOpenChange(false),
    },
  );

  function submit() {
    if (!userId) return toast.error('Kişi seçin');
    if (role === 'BLOCK_MANAGER' && blockIds.length === 0)
      return toast.error('En az bir blok seçin');
    save.mutate(undefined);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{officer ? 'Yetkiyi düzenle' : 'Yetkili ekle'}</DialogTitle>
          <DialogDescription>
            Yetkili, bu sitede oturan ve hesabı açılmış sakinler arasından seçilir. Kendi dairesini
            görmeye devam eder.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Kişi" htmlFor="officer-user" required>
            {officer ? (
              <p id="officer-user" className="text-sm font-medium">
                {officer.firstName} {officer.lastName}
              </p>
            ) : (
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger id="officer-user" className="w-full">
                  <SelectValue
                    placeholder={
                      candidates.data?.length === 0 ? 'Hesabı olan sakin yok' : 'Sakin seçin'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(candidates.data ?? []).map((c) => (
                    <SelectItem key={c.userId} value={c.userId}>
                      {c.name}
                      {c.units.length > 0 && ` · ${c.units.join(', ')}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Yetki" htmlFor="officer-role" required hint={roleHints[role]}>
            <Select value={role} onValueChange={(v) => setRole(v as OfficerRole)}>
              <SelectTrigger id="officer-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {!isApartment && (
                  <SelectItem value="BLOCK_MANAGER">{siteRoleLabels.BLOCK_MANAGER}</SelectItem>
                )}
                <SelectItem value="AUDITOR">{siteRoleLabels.AUDITOR}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {role === 'BLOCK_MANAGER' && (
            <Field label="Bloklar" htmlFor="officer-blocks" required>
              <CheckList
                idPrefix="officer-block"
                items={(blocks.data ?? []).map((b) => ({
                  id: b.id,
                  label: blockScopeLabel(b.name),
                }))}
                selected={blockIds}
                onChange={setBlockIds}
              />
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OfficersPage() {
  const officers = useOfficers();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<OfficerDto | null>(null);
  const [removing, setRemoving] = useState<OfficerDto | null>(null);
  const remove = useApiMutation(
    (o: OfficerDto) => apiFetch<void>(`/officers/${o.userId}`, { method: 'DELETE' }),
    { success: 'Yetki kaldırıldı', onSuccess: () => setRemoving(null) },
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Yetkililer"
        description="Blok yöneticileri ve denetçiler"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            Yetkili ekle
          </Button>
        }
      />

      {officers.isPending ? (
        <LoadingRows rows={3} />
      ) : officers.isError ? (
        <ErrorState error={officers.error} />
      ) : officers.data.length === 0 ? (
        <EmptyState
          title="Henüz yetkili yok"
          description="Blok yöneticisi veya denetçi atayarak yönetimi paylaşabilirsiniz."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {officers.data.map((o) => (
            <Card key={o.userId} className="py-4">
              <CardContent className="grid gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="grid min-w-0 gap-0.5">
                    <span className="font-medium">
                      {o.firstName} {o.lastName}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[o.units.join(', '), o.phone && formatPhone(o.phone)]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                  <Badge variant={o.role === 'AUDITOR' ? 'secondary' : 'default'}>
                    {siteRoleLabels[o.role]}
                  </Badge>
                </div>
                {o.blocks.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {o.blocks.map((b) => (
                      <Badge key={b.id} variant="outline">
                        {blockScopeLabel(b.name)}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(o)}>
                    <Pencil />
                    Düzenle
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => setRemoving(o)}
                  >
                    <ShieldOff />
                    Yetkiyi kaldır
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {creating && <OfficerDialog open onOpenChange={setCreating} />}
      {editing && (
        <OfficerDialog open officer={editing} onOpenChange={(o) => !o && setEditing(null)} />
      )}
      <AlertDialog open={Boolean(removing)} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Yetki kaldırılsın mı?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.firstName} {removing?.lastName} yeniden yalnızca sakin olarak devam eder.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction onClick={() => removing && remove.mutate(removing)}>
              Yetkiyi kaldır
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
