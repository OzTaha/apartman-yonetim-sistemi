import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { hasSeenTour, markTourSeen, onTourRestart } from '@/lib/tours';
import { useSession } from '@/lib/session';

export interface TourStep {
  target: string;
  title: string;
  body: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 6;

function findTarget(name: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`);
  for (const el of all) {
    if (el.getClientRects().length > 0) return el;
  }
  return null;
}

export function Tour({ id, steps, ready }: { id: string; steps: TourStep[]; ready: boolean }) {
  const userId = useSession().user?.id;
  const [active, setActive] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const primary = useRef<HTMLButtonElement>(null);

  const start = useCallback(() => {
    const available = steps.filter((s) => findTarget(s.target));
    if (available.length === 0) return;
    setIndex(0);
    setActive(available);
  }, [steps]);

  useEffect(() => {
    if (!ready || !userId || hasSeenTour(userId, id)) return;
    const timer = window.setTimeout(start, 700);
    return () => window.clearTimeout(timer);
  }, [ready, userId, id, start]);

  useEffect(() => onTourRestart(() => window.setTimeout(start, 300)), [start]);

  const step = active?.[index];

  const measure = useCallback(() => {
    if (!step) return;
    const el = findTarget(step.target);
    if (!el) return setRect(null);
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  useLayoutEffect(() => {
    if (!step) return;
    const el = findTarget(step.target);
    el?.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    const frame = window.requestAnimationFrame(() => {
      measure();
      primary.current?.focus();
    });
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step, measure]);

  const finish = useCallback(() => {
    if (userId) markTourSeen(userId, id);
    setActive(null);
    setRect(null);
  }, [userId, id]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, finish]);

  if (!active || !step) return null;
  const last = index === active.length - 1;
  const viewportH = window.innerHeight;
  const below = !rect || rect.top + rect.height / 2 < viewportH / 2;
  const tipStyle: React.CSSProperties = rect
    ? below
      ? { top: Math.min(rect.top + rect.height + PAD + 12, viewportH - 24) }
      : { bottom: Math.max(viewportH - rect.top + PAD + 12, 24) }
    : { top: '30%' };

  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={step.title}>
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-4 ring-highlight transition-all duration-300"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgb(8 12 20 / 0.6)',
          }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-black/60" />
      )}
      <div
        className="absolute inset-x-4 mx-auto grid max-w-sm animate-in gap-3 rounded-2xl bg-card p-5 text-card-foreground shadow-2xl duration-300 fade-in-0 slide-in-from-bottom-2"
        style={tipStyle}
      >
        <p className="font-heading text-lg leading-tight font-semibold">{step.title}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground tabular-nums">
            {index + 1} / {active.length}
          </span>
          <div className="flex gap-2">
            {!last && (
              <Button variant="ghost" onClick={finish}>
                Atla
              </Button>
            )}
            {index > 0 && (
              <Button variant="outline" onClick={() => setIndex((i) => i - 1)}>
                Geri
              </Button>
            )}
            <Button ref={primary} onClick={() => (last ? finish() : setIndex((i) => i + 1))}>
              {last ? 'Tamam, anladım' : 'İleri'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
