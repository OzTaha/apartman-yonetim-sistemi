import { Monitor, Moon, Sun } from 'lucide-react';
import type { ComponentType } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  setPreferences,
  useIsDark,
  usePreferences,
  type ColorMode,
  type TextSize,
} from '@/lib/preferences';
import { cn } from '@/lib/utils';

const modes: { value: ColorMode; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { value: 'light', label: 'Açık', icon: Sun },
  { value: 'dark', label: 'Koyu', icon: Moon },
  { value: 'system', label: 'Telefona göre', icon: Monitor },
];

const sizes: { value: TextSize; label: string; sample: string }[] = [
  { value: 'm', label: 'Normal', sample: 'text-sm' },
  { value: 'l', label: 'Büyük', sample: 'text-base' },
  { value: 'xl', label: 'Çok büyük', sample: 'text-lg' },
];

const item =
  'min-h-11 gap-3 text-base data-[state=checked]:bg-secondary data-[state=checked]:font-semibold data-[state=checked]:text-secondary-foreground';

export function AppearanceMenu() {
  const prefs = usePreferences();
  const dark = useIsDark();
  const Icon = dark ? Moon : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Görünüm ve yazı boyutu"
          data-tour="appearance"
        >
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel>Görünüm</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={prefs.colorMode}
          onValueChange={(v) => setPreferences({ colorMode: v as ColorMode })}
        >
          {modes.map((m) => (
            <DropdownMenuRadioItem
              key={m.value}
              value={m.value}
              className={item}
              onSelect={(e) => e.preventDefault()}
            >
              <m.icon className="size-5" />
              {m.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Yazı boyutu</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={prefs.textSize}
          onValueChange={(v) => setPreferences({ textSize: v as TextSize })}
        >
          {sizes.map((s) => (
            <DropdownMenuRadioItem
              key={s.value}
              value={s.value}
              className={item}
              onSelect={(e) => e.preventDefault()}
            >
              <span
                aria-hidden
                className={cn('w-5 text-center font-heading leading-none font-semibold', s.sample)}
              >
                A
              </span>
              {s.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
