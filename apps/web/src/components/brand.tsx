import { Building2 } from 'lucide-react';
import { useBranding } from '@/lib/branding';
import { cn } from '@/lib/utils';

export function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const { logoUrl } = useBranding();
  const box = size === 'sm' ? 'size-8 rounded-lg' : 'size-11 rounded-xl';
  if (logoUrl) {
    return <img src={logoUrl} alt="" className={cn(box, 'shrink-0 object-cover')} />;
  }
  return (
    <div
      className={cn(
        box,
        'flex shrink-0 items-center justify-center bg-primary text-primary-foreground',
      )}
    >
      <Building2 className={size === 'sm' ? 'size-4' : 'size-6'} />
    </div>
  );
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  const { appName } = useBranding();
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div className="flex items-center gap-3">
        <BrandMark />
        <div>
          <p className="text-lg font-semibold leading-tight">{appName}</p>
          <p className="text-sm text-muted-foreground">Site ve apartman yönetimi</p>
        </div>
      </div>
      {children}
    </main>
  );
}
