import { distributionMethodLabels, type DistributionMethod } from '@apartman/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProportionalDues } from '@/lib/queries';
import { cn } from '@/lib/utils';

export function MethodSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: DistributionMethod;
  onChange: (value: DistributionMethod) => void;
}) {
  const proportional = useProportionalDues();
  const methods = (Object.keys(distributionMethodLabels) as DistributionMethod[]).filter(
    (m) => m === 'EQUAL' || proportional || m === value,
  );
  return (
    <Select value={value} onValueChange={(v) => onChange(v as DistributionMethod)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {methods.map((m) => (
          <SelectItem key={m} value={m}>
            {m === 'EQUAL' ? 'Dairelere eşit' : distributionMethodLabels[m]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function UsageBar({ percent }: { percent: number | null }) {
  if (percent === null) return null;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <div
        className={cn(
          'h-full rounded-full',
          percent > 100 ? 'bg-red-600' : percent > 85 ? 'bg-amber-500' : 'bg-emerald-600',
        )}
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  );
}
