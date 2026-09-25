import { Field } from '@/components/form-field';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBlocks, useUnits } from '@/lib/queries';
import { labelUnit, useIsApartment } from '@/lib/unit-label';

export interface TargetValue {
  target: string;
  blockIds: string[];
  unitIds: string[];
}

function CheckList({
  idPrefix,
  items,
  selected,
  onChange,
}: {
  idPrefix: string;
  items: { id: string; label: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="grid max-h-56 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
      {items.map((item) => {
        const checked = selected.includes(item.id);
        return (
          <div key={item.id} className="flex items-center gap-2">
            <Checkbox
              id={`${idPrefix}-${item.id}`}
              checked={checked}
              onCheckedChange={(v) =>
                onChange(
                  v === true ? [...selected, item.id] : selected.filter((id) => id !== item.id),
                )
              }
            />
            <Label htmlFor={`${idPrefix}-${item.id}`} className="font-normal">
              {item.label}
            </Label>
          </div>
        );
      })}
    </div>
  );
}

export function TargetPicker({
  idPrefix,
  label,
  options,
  value,
  onChange,
  error,
}: {
  idPrefix: string;
  label: string;
  options: { value: string; label: string }[];
  value: TargetValue;
  onChange: (value: TargetValue) => void;
  error?: string;
}) {
  const isApartment = useIsApartment();
  const blocks = useBlocks();
  const units = useUnits({});
  const visible = options.filter((o) => !(isApartment && o.value === 'BLOCKS'));

  return (
    <div className="grid gap-2">
      <Field label={label} htmlFor={`${idPrefix}-target`} required error={error}>
        <Select value={value.target} onValueChange={(target) => onChange({ ...value, target })}>
          <SelectTrigger id={`${idPrefix}-target`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {visible.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {value.target === 'BLOCKS' && (
        <CheckList
          idPrefix={`${idPrefix}-block`}
          items={(blocks.data ?? []).map((b) => ({ id: b.id, label: `${b.name} Blok` }))}
          selected={value.blockIds}
          onChange={(blockIds) => onChange({ ...value, blockIds })}
        />
      )}
      {value.target === 'UNITS' && (
        <CheckList
          idPrefix={`${idPrefix}-unit`}
          items={(units.data ?? []).map((u) => ({
            id: u.id,
            label: labelUnit(u.blockName, u.number),
          }))}
          selected={value.unitIds}
          onChange={(unitIds) => onChange({ ...value, unitIds })}
        />
      )}
    </div>
  );
}
