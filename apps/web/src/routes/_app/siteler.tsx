import { siteKindLabels, type PasswordResetLinkDto, type SiteDto } from '@apartman/shared';
import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowRight, KeyRound, MoreHorizontal, Pencil, Plus, UserCog, X } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ManagerAssignDialog, SiteFormDialog } from '@/features/sites/site-dialogs';
import { apiFetch } from '@/lib/api';
import { fullName } from '@/lib/format';
import { useApiMutation, useSites } from '@/lib/queries';
import { session, useSession } from '@/lib/session';

export const Route = createFileRoute('/_app/siteler')({
  component: SitesPageGuard,
});

function SitesPageGuard() {
  const { user } = useSession();
  if (!user?.isPlatformAdmin) return <Navigate to="/" replace />;
  return <SitesPage />;
}

function ManagerChip({ site, manager }: { site: SiteDto; manager: SiteDto['managers'][number] }) {
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const remove = useApiMutation(
    () => apiFetch<void>(`/sites/${site.id}/managers/${manager.id}`, { method: 'DELETE' }),
    { success: 'Yönetici kaldırıldı', onSuccess: () => setConfirming(false) },
  );
  return (
    <>
      <Badge variant="secondary" className="gap-1 pr-1">
        {fullName(manager)}
        <button
          type="button"
          className="rounded-sm p-0.5 hover:bg-muted-foreground/20"
          aria-label={`${fullName(manager)} için şifre yenileme bağlantısı`}
          title="Şifre yenileme bağlantısı"
          onClick={() => setResetting(true)}
        >
          <KeyRound className="size-3" />
        </button>
        <button
          type="button"
          className="rounded-sm p-0.5 hover:bg-muted-foreground/20"
          aria-label={`${fullName(manager)} yöneticiliğini kaldır`}
          onClick={() => setConfirming(true)}
        >
          <X className="size-3" />
        </button>
      </Badge>
      <PasswordResetDialog
        open={resetting}
        onOpenChange={setResetting}
        personName={fullName(manager)}
        request={() =>
          apiFetch<PasswordResetLinkDto>(`/users/${manager.id}/password-reset`, { method: 'POST' })
        }
      />
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Yöneticilik kaldırılsın mı?</AlertDialogTitle>
            <AlertDialogDescription>
              {fullName(manager)} artık {site.name} sitesini yönetemeyecek. Sitede oturuyorsa sakin
              olarak kalır.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate(undefined)}>Kaldır</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SiteCard({ site }: { site: SiteDto }) {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<'edit' | 'manager' | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="grid gap-1">
          <CardTitle>{site.name}</CardTitle>
          <CardDescription>
            {[site.address, site.city].filter(Boolean).join(', ') || 'Adres girilmemiş'}
          </CardDescription>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`${site.name} için işlemler`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setDialog('edit')}>
              <Pencil />
              Düzenle
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDialog('manager')}>
              <UserCog />
              Yönetici ata
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm text-muted-foreground">
          {siteKindLabels[site.kind]} ·{' '}
          {site.kind === 'APARTMENT'
            ? `${site.unitCount} daire`
            : `${site.blockCount} blok · ${site.unitCount} daire`}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-muted-foreground">Yöneticiler:</span>
          {site.managers.length === 0 ? (
            <span className="text-sm text-amber-700">Atanmamış</span>
          ) : (
            site.managers.map((m) => <ManagerChip key={m.id} site={site} manager={m} />)
          )}
        </div>
        <Button
          variant="outline"
          className="w-fit"
          onClick={() => {
            session.setSite(site.id);
            void navigate({ to: '/daireler' });
          }}
        >
          Siteyi aç
          <ArrowRight />
        </Button>
      </CardContent>
      <SiteFormDialog
        open={dialog === 'edit'}
        onOpenChange={(o) => setDialog(o ? 'edit' : null)}
        site={site}
      />
      <ManagerAssignDialog
        open={dialog === 'manager'}
        onOpenChange={(o) => setDialog(o ? 'manager' : null)}
        site={site}
      />
    </Card>
  );
}

function SitesPage() {
  const sites = useSites();
  const [creating, setCreating] = useState(false);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Apartman ve siteler"
        description="Bu kurulumdaki tüm apartman, site ve yöneticileri"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            Ekle
          </Button>
        }
      />
      {sites.isPending ? (
        <LoadingRows rows={3} />
      ) : sites.isError ? (
        <ErrorState error={sites.error} />
      ) : sites.data.length === 0 ? (
        <EmptyState title="Henüz site yok" description="İlk siteyi ekleyip bir yönetici atayın." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sites.data.map((site) => (
            <SiteCard key={site.id} site={site} />
          ))}
        </div>
      )}
      <SiteFormDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
