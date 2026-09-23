import {
  blockSchema,
  bulkUnitsSchema,
  planBulkUnits,
  unitCreateSchema,
  type BlockDto,
  type BlockInput,
  type BulkUnitsInput,
  type BulkUnitsResultDto,
  type UnitDto,
} from '@apartman/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { Field } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiFetch } from '@/lib/api';
import { toNumberOrNull, toNumberOrUndefined } from '@/lib/format';
import { useApiMutation, useBlocks } from '@/lib/queries';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function BlockSelect({
  value,
  onChange,
  blocks,
  id,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  blocks: BlockDto[];
  id: string;
}) {
  return (
    <Select value={value ?? ''} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Blok seçin" />
      </SelectTrigger>
      <SelectContent>
        {blocks.map((block) => (
          <SelectItem key={block.id} value={block.id}>
            {block.name} Blok
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type UnitForm = z.input<typeof unitCreateSchema>;
type UnitOutput = z.output<typeof unitCreateSchema>;

export function UnitFormDialog({
  open,
  onOpenChange,
  unit,
  defaultBlockId,
}: DialogProps & {
  unit?: Pick<UnitDto, 'id' | 'blockId' | 'number' | 'floor' | 'areaM2' | 'landShare'>;
  defaultBlockId?: string;
}) {
  const blocks = useBlocks();
  const form = useForm<UnitForm, unknown, UnitOutput>({
    resolver: zodResolver(unitCreateSchema),
    values: {
      blockId: unit?.blockId ?? defaultBlockId ?? blocks.data?.[0]?.id ?? '',
      number: unit?.number ?? '',
      floor: unit?.floor ?? null,
      areaM2: unit?.areaM2 ?? null,
      landShare: unit?.landShare ?? null,
    },
    resetOptions: { keepDirtyValues: true },
  });

  const mutation = useApiMutation(
    (values: UnitOutput) =>
      unit
        ? apiFetch<UnitDto>(`/units/${unit.id}`, { method: 'PATCH', body: values })
        : apiFetch<UnitDto>('/units', { method: 'POST', body: values }),
    {
      success: unit ? 'Daire güncellendi' : 'Daire eklendi',
      onSuccess: () => {
        form.reset();
        onOpenChange(false);
      },
    },
  );

  const errors = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{unit ? 'Daireyi düzenle' : 'Daire ekle'}</DialogTitle>
          <DialogDescription>Kat, alan ve arsa payı bilgileri isteğe bağlıdır.</DialogDescription>
        </DialogHeader>
        <form
          id="unit-form"
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
        >
          <Field label="Blok" htmlFor="unit-block" error={errors.blockId?.message} required>
            <Controller
              control={form.control}
              name="blockId"
              render={({ field }) => (
                <BlockSelect
                  id="unit-block"
                  value={field.value}
                  onChange={field.onChange}
                  blocks={blocks.data ?? []}
                />
              )}
            />
          </Field>
          <Field label="Daire no" htmlFor="unit-number" error={errors.number?.message} required>
            <Input id="unit-number" {...form.register('number')} />
          </Field>
          <Field
            label="Kat"
            htmlFor="unit-floor"
            error={errors.floor?.message}
            hint="Zemin kat için 0"
          >
            <Input
              id="unit-floor"
              inputMode="numeric"
              {...form.register('floor', { setValueAs: toNumberOrNull })}
            />
          </Field>
          <Field label="Alan (m²)" htmlFor="unit-area" error={errors.areaM2?.message}>
            <Input
              id="unit-area"
              inputMode="decimal"
              {...form.register('areaM2', { setValueAs: toNumberOrNull })}
            />
          </Field>
          <Field
            label="Arsa payı"
            htmlFor="unit-share"
            error={errors.landShare?.message}
            className="sm:col-span-2"
          >
            <Input
              id="unit-share"
              inputMode="numeric"
              {...form.register('landShare', { setValueAs: toNumberOrNull })}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button type="submit" form="unit-form" disabled={mutation.isPending}>
            {mutation.isPending ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type BulkOutput = z.output<typeof bulkUnitsSchema>;

function bulkPreview(
  values: Partial<BulkUnitsInput>,
  blockName: string | undefined,
): string | null {
  try {
    if (!values.startNumber || !values.endNumber || !blockName) return null;
    const units = planBulkUnits({
      startNumber: values.startNumber,
      endNumber: values.endNumber,
      unitsPerFloor: values.unitsPerFloor ?? undefined,
      startFloor: values.startFloor ?? 1,
    });
    const floors = units.at(-1)?.floor;
    return `${blockName} Blok için ${units[0]?.number}–${units.at(-1)?.number} arası ${units.length} daire oluşturulacak${
      floors !== null && floors !== undefined ? `, son kat ${floors}` : ''
    }.`;
  } catch (e) {
    return e instanceof Error ? e.message : null;
  }
}

export function BulkUnitsDialog({
  open,
  onOpenChange,
  defaultBlockId,
}: DialogProps & { defaultBlockId?: string }) {
  const blocks = useBlocks();
  const form = useForm<BulkUnitsInput, unknown, BulkOutput>({
    resolver: zodResolver(bulkUnitsSchema),
    values: {
      blockId: defaultBlockId ?? blocks.data?.[0]?.id ?? '',
      startNumber: 1,
      endNumber: 20,
      unitsPerFloor: 4,
      startFloor: 1,
    },
    resetOptions: { keepDirtyValues: true },
  });
  const watched = useWatch({ control: form.control });
  const blockName = blocks.data?.find((b) => b.id === watched.blockId)?.name;

  const mutation = useApiMutation(
    (values: BulkOutput) =>
      apiFetch<BulkUnitsResultDto>('/units/bulk', { method: 'POST', body: values }),
    {
      success: (r) =>
        r.skipped.length > 0
          ? `${r.created} daire oluşturuldu, ${r.skipped.length} numara zaten vardı`
          : `${r.created} daire oluşturuldu`,
      onSuccess: () => onOpenChange(false),
    },
  );

  const errors = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Toplu daire oluştur</DialogTitle>
          <DialogDescription>
            Bir blok için numara aralığı vererek daireleri tek seferde ekleyin.
          </DialogDescription>
        </DialogHeader>
        <form
          id="bulk-form"
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
        >
          <Field
            label="Blok"
            htmlFor="bulk-block"
            error={errors.blockId?.message}
            required
            className="sm:col-span-2"
          >
            <Controller
              control={form.control}
              name="blockId"
              render={({ field }) => (
                <BlockSelect
                  id="bulk-block"
                  value={field.value}
                  onChange={field.onChange}
                  blocks={blocks.data ?? []}
                />
              )}
            />
          </Field>
          <Field
            label="İlk daire no"
            htmlFor="bulk-start"
            error={errors.startNumber?.message}
            required
          >
            <Input
              id="bulk-start"
              inputMode="numeric"
              {...form.register('startNumber', { setValueAs: toNumberOrUndefined })}
            />
          </Field>
          <Field label="Son daire no" htmlFor="bulk-end" error={errors.endNumber?.message} required>
            <Input
              id="bulk-end"
              inputMode="numeric"
              {...form.register('endNumber', { setValueAs: toNumberOrUndefined })}
            />
          </Field>
          <Field
            label="Katta daire sayısı"
            htmlFor="bulk-per-floor"
            error={errors.unitsPerFloor?.message}
            hint="Boş bırakılırsa kat girilmez"
          >
            <Input
              id="bulk-per-floor"
              inputMode="numeric"
              {...form.register('unitsPerFloor', { setValueAs: toNumberOrNull })}
            />
          </Field>
          <Field
            label="Başlangıç katı"
            htmlFor="bulk-floor"
            error={errors.startFloor?.message}
            hint="Zemin kat için 0"
          >
            <Input
              id="bulk-floor"
              inputMode="numeric"
              {...form.register('startFloor', { setValueAs: toNumberOrUndefined })}
            />
          </Field>
        </form>
        {bulkPreview(watched, blockName) && (
          <p className="rounded-md bg-muted p-3 text-sm">{bulkPreview(watched, blockName)}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button type="submit" form="bulk-form" disabled={mutation.isPending}>
            {mutation.isPending ? 'Oluşturuluyor…' : 'Daireleri oluştur'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BlockRow({ block }: { block: BlockDto }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(block.name);
  const rename = useApiMutation(
    (value: string) =>
      apiFetch<BlockDto>(`/blocks/${block.id}`, { method: 'PATCH', body: { name: value } }),
    { success: 'Blok güncellendi', onSuccess: () => setEditing(false) },
  );
  const remove = useApiMutation(() => apiFetch<void>(`/blocks/${block.id}`, { method: 'DELETE' }), {
    success: 'Blok silindi',
  });

  return (
    <li className="flex items-center gap-2 rounded-md border p-2">
      {editing ? (
        <>
          <Input
            aria-label="Blok adı"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8"
            autoFocus
          />
          <Button
            size="icon"
            variant="ghost"
            aria-label="Kaydet"
            onClick={() => rename.mutate(name)}
            disabled={rename.isPending}
          >
            <Check />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Vazgeç"
            onClick={() => {
              setName(block.name);
              setEditing(false);
            }}
          >
            <X />
          </Button>
        </>
      ) : (
        <>
          <span className="flex-1 font-medium">{block.name} Blok</span>
          <span className="text-sm text-muted-foreground">{block.unitCount} daire</span>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`${block.name} bloğunu yeniden adlandır`}
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`${block.name} bloğunu sil`}
            title={block.unitCount > 0 ? 'İçinde daire bulunan blok silinemez' : undefined}
            disabled={block.unitCount > 0 || remove.isPending}
            onClick={() => remove.mutate(undefined)}
          >
            <Trash2 />
          </Button>
        </>
      )}
    </li>
  );
}

export function BlocksDialog({ open, onOpenChange }: DialogProps) {
  const blocks = useBlocks();
  const form = useForm<BlockInput>({
    resolver: zodResolver(blockSchema),
    defaultValues: { name: '' },
  });
  const create = useApiMutation(
    (values: BlockInput) => apiFetch<BlockDto>('/blocks', { method: 'POST', body: values }),
    { success: 'Blok eklendi', onSuccess: () => form.reset({ name: '' }) },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bloklar</DialogTitle>
          <DialogDescription>
            Blok ekleyin, yeniden adlandırın veya boş blokları silin.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid max-h-72 gap-2 overflow-y-auto">
          {(blocks.data ?? []).map((block) => (
            <BlockRow key={block.id} block={block} />
          ))}
          {blocks.data?.length === 0 && (
            <li className="text-sm text-muted-foreground">Henüz blok yok.</li>
          )}
        </ul>
        <form
          className="flex items-start gap-2"
          noValidate
          onSubmit={form.handleSubmit((v) => create.mutate(v))}
        >
          <Field
            label="Yeni blok adı"
            htmlFor="block-name"
            error={form.formState.errors.name?.message}
            className="flex-1"
          >
            <Input id="block-name" placeholder="Örn. C" {...form.register('name')} />
          </Field>
          <Button type="submit" className="mt-[1.375rem]" disabled={create.isPending}>
            <Plus />
            Ekle
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
