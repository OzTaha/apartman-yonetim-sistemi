import { Building2 } from 'lucide-react';

export function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <div
      className={
        size === 'sm'
          ? 'flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground'
          : 'flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground'
      }
    >
      <Building2 className={size === 'sm' ? 'size-4' : 'size-6'} />
    </div>
  );
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div className="flex items-center gap-3">
        <BrandMark />
        <div>
          <p className="text-lg font-semibold leading-tight">Apartman Yönetim Sistemi</p>
          <p className="text-sm text-muted-foreground">Site ve apartman yönetimi</p>
        </div>
      </div>
      {children}
    </main>
  );
}
