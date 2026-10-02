import type { ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export function InfoTip({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${title} hakkında bilgi`}
        className={cn(
          'inline-flex size-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-current font-serif text-sm leading-none font-bold italic opacity-80 transition-opacity hover:opacity-100 pointer-coarse:size-8',
          className,
        )}
      >
        i
      </PopoverTrigger>
      <PopoverContent className="grid gap-1.5 text-sm leading-relaxed">
        <p className="font-heading text-base font-semibold">{title}</p>
        <div className="grid gap-1.5 text-muted-foreground">{children}</div>
      </PopoverContent>
    </Popover>
  );
}
