import { Monitor, Moon, Sun } from 'lucide-react';
import type { ComponentType } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { setPreferences, usePreferences, type ColorMode, type TextSize } from '@/lib/preferences';
import { cn } from '@/lib/utils';

const sizes: { value: TextSize; label: string; sample: string }[] = [
  { value: 'm', label: 'Normal', sample: 'text-base' },
  { value: 'l', label: 'Büyük', sample: 'text-xl' },
  { value: 'xl', label: 'Çok büyük', sample: 'text-2xl' },
];

const modes: { value: ColorMode; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { value: 'system', label: 'Telefona göre', icon: Monitor },
  { value: 'light', label: 'Açık', icon: Sun },
  { value: 'dark', label: 'Koyu', icon: Moon },
];

function Choice({
  selected,
  onSelect,
  children,
  label,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onClick={onSelect}
      className={cn(
        'flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border-2 bg-card p-3 text-sm font-semibold transition-colors',
        selected ? 'border-primary bg-secondary text-secondary-foreground' : 'hover:bg-accent',
      )}
    >
      {children}
    </button>
  );
}

export function AppearanceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const prefs = usePreferences();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Görünüm</DialogTitle>
          <DialogDescription>
            Bu ayarlar yalnızca bu cihazda geçerlidir ve hemen uygulanır.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <p className="text-sm font-semibold" id="pref-size">
            Yazı boyutu
          </p>
          <div role="radiogroup" aria-labelledby="pref-size" className="grid grid-cols-3 gap-2">
            {sizes.map((s) => (
              <Choice
                key={s.value}
                label={s.label}
                selected={prefs.textSize === s.value}
                onSelect={() => setPreferences({ textSize: s.value })}
              >
                <span className={cn('leading-none font-heading', s.sample)} aria-hidden>
                  Aa
                </span>
                {s.label}
              </Choice>
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          <p className="text-sm font-semibold" id="pref-mode">
            Renk modu
          </p>
          <div role="radiogroup" aria-labelledby="pref-mode" className="grid grid-cols-3 gap-2">
            {modes.map((m) => (
              <Choice
                key={m.value}
                label={m.label}
                selected={prefs.colorMode === m.value}
                onSelect={() => setPreferences({ colorMode: m.value })}
              >
                <m.icon className="size-5" />
                {m.label}
              </Choice>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
