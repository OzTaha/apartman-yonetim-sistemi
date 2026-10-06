import {
  REQUEST_CATEGORIES,
  REQUEST_PHOTO_ACCEPT,
  REQUEST_PHOTO_MAX,
  REQUEST_PHOTO_MAX_BYTES,
  requestCategoryLabels,
  requestCreateSchema,
  requestStatusLabels,
  STAFF_MESSAGE_CATEGORIES,
  staffMessageCategoryLabels,
  staffMessageSchema,
  unitLabel,
  type MyRequestDto,
  type RequestCategory,
  type RequestCreateInput,
  type RequestStatus,
  type ServiceRequestDetailDto,
  type TaskPriority,
} from '@apartman/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { ImagePlus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Field } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Textarea } from '@/components/ui/textarea';
import { EmployeeSelect, PrioritySelect } from '@/features/staff/task-dialogs';
import { apiFetch, postForm } from '@/lib/api';
import { useApiMutation } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

const ACCEPTED = new Set(REQUEST_PHOTO_ACCEPT.split(','));

function PhotoPicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const add = (list: FileList | null) => {
    const picked = [...(list ?? [])];
    const bad = picked.find((f) => !ACCEPTED.has(f.type));
    const big = picked.find((f) => f.size > REQUEST_PHOTO_MAX_BYTES);
    if (bad) setError(`${bad.name}: yalnızca JPG, PNG veya WEBP fotoğraf`);
    else if (big) setError(`${big.name}: en fazla 10 MB olabilir`);
    else if (files.length + picked.length > REQUEST_PHOTO_MAX)
      setError(`En fazla ${REQUEST_PHOTO_MAX} fotoğraf ekleyebilirsiniz`);
    else {
      setError(null);
      onChange([...files, ...picked]);
    }
    if (input.current) input.current.value = '';
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {files.map((f, i) => (
          <div key={previews[i]} className="relative size-20 overflow-hidden rounded-md border">
            <img src={previews[i]} alt={f.name} className="size-full object-cover" />
            <button
              type="button"
              className="absolute top-1 right-1 rounded-full bg-background/90 p-0.5"
              aria-label={`${f.name} kaldır`}
              onClick={() => onChange(files.filter((_, j) => j !== i))}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {files.length < REQUEST_PHOTO_MAX && (
          <Button
            type="button"
            variant="outline"
            className="size-20 flex-col gap-1 text-xs"
            onClick={() => input.current?.click()}
          >
            <ImagePlus />
            Fotoğraf
          </Button>
        )}
      </div>
      <input
        ref={input}
        id="request-photos"
        type="file"
        accept={REQUEST_PHOTO_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => add(e.target.files)}
      />
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          İsteğe bağlı, en fazla {REQUEST_PHOTO_MAX} fotoğraf.
        </p>
      )}
    </div>
  );
}

export function NewRequestDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (request: MyRequestDto) => void;
}) {
  const { user, siteId } = useSession();
  const units = (user?.occupancies ?? []).filter((o) => o.siteId === siteId);
  const [photos, setPhotos] = useState<File[]>([]);
  const form = useForm<RequestCreateInput>({
    resolver: zodResolver(requestCreateSchema),
    values: {
      unitId: units[0]?.unitId ?? '',
      location: 'UNIT',
      category: '' as RequestCategory,
      title: '',
      description: '',
    },
  });
  const errors = form.formState.errors;

  const mutation = useApiMutation(
    (v: RequestCreateInput) => {
      const body = new FormData();
      for (const [key, value] of Object.entries(v)) body.append(key, value);
      for (const photo of photos) body.append('photos', photo);
      return postForm<MyRequestDto>('/requests/mine', body);
    },
    {
      success: (r) => `Talebiniz iletildi (#${r.number})`,
      onSuccess: (r) => {
        form.reset();
        setPhotos([]);
        onOpenChange(false);
        onCreated?.(r);
      },
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Arıza / talep bildir</DialogTitle>
          <DialogDescription>
            Talebiniz yönetime iletilir; durumunu ve yanıtları bu sayfadan takip edebilirsiniz.
          </DialogDescription>
        </DialogHeader>
        <form
          id="request-form"
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
        >
          {units.length > 1 && (
            <Field
              label="Daire"
              htmlFor="request-unit"
              required
              error={errors.unitId?.message}
              className="sm:col-span-2"
            >
              <Controller
                control={form.control}
                name="unitId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="request-unit" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((o) => (
                        <SelectItem key={o.unitId} value={o.unitId}>
                          {unitLabel(o.siteKind, o.blockName, o.unitNumber)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          )}
          <Field
            label="Kategori"
            htmlFor="request-category"
            required
            error={errors.category?.message}
          >
            <Controller
              control={form.control}
              name="category"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="request-category" className="w-full">
                    <SelectValue placeholder="Seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {REQUEST_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {requestCategoryLabels[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="Yer" htmlFor="request-location" required>
            <Controller
              control={form.control}
              name="location"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="request-location" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNIT">Dairem</SelectItem>
                    <SelectItem value="COMMON">Ortak alan</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field
            label="Başlık"
            htmlFor="request-title"
            required
            error={errors.title?.message}
            className="sm:col-span-2"
          >
            <Input
              id="request-title"
              placeholder="Örn. Asansör 3. katta durmuyor"
              maxLength={120}
              {...form.register('title')}
            />
          </Field>
          <Field
            label="Açıklama"
            htmlFor="request-description"
            required
            error={errors.description?.message}
            className="sm:col-span-2"
          >
            <Textarea
              id="request-description"
              rows={4}
              maxLength={2000}
              {...form.register('description')}
            />
          </Field>
          <div className="grid gap-1.5 sm:col-span-2">
            <span className="text-sm font-medium">Fotoğraflar</span>
            <PhotoPicker files={photos} onChange={setPhotos} />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button type="submit" form="request-form" disabled={mutation.isPending}>
            Gönder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CommentForm({
  path,
  label,
  placeholder,
  button,
}: {
  path: string;
  label: string;
  placeholder: string;
  button: string;
}) {
  const [note, setNote] = useState('');
  const send = useApiMutation(
    () => apiFetch<unknown>(path, { method: 'POST', body: { note: note.trim() } }),
    { success: 'Mesaj gönderildi', onSuccess: () => setNote('') },
  );
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (note.trim()) send.mutate(undefined);
      }}
    >
      <Textarea
        aria-label={label}
        placeholder={placeholder}
        rows={2}
        maxLength={1000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        className="w-fit"
        disabled={!note.trim() || send.isPending}
      >
        {button}
      </Button>
    </form>
  );
}

const statusTitles: Record<RequestStatus, string> = {
  NEW: 'Yeni olarak işaretle',
  IN_PROGRESS: 'İşleme al',
  RESOLVED: 'Çözüldü olarak kapat',
  REJECTED: 'Talebi reddet',
};

export function RequestStatusDialog({
  request,
  status,
  onOpenChange,
}: {
  request: ServiceRequestDetailDto;
  status: RequestStatus | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useApiMutation(
    (next: RequestStatus) =>
      apiFetch<ServiceRequestDetailDto>(`/requests/${request.id}/status`, {
        method: 'POST',
        body: { status: next, note: note.trim() || undefined },
      }),
    {
      success: (r) => `Talep: ${requestStatusLabels[r.status]}`,
      onSuccess: () => {
        setNote('');
        onOpenChange(false);
      },
    },
  );
  if (!status) return null;
  const rejecting = status === 'REJECTED';
  const who = request.fromStaff ? 'Görevli' : 'Sakin';
  const toWho = request.fromStaff ? 'Görevliye not' : 'Sakine not';

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) setError(null);
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{statusTitles[status]}</DialogTitle>
          <DialogDescription>
            #{request.number} · {request.title}
          </DialogDescription>
        </DialogHeader>
        <form
          id="request-status-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (rejecting && note.trim().length < 3) {
              setError('Reddetme nedenini yazın');
              return;
            }
            mutation.mutate(status);
          }}
        >
          <Field
            label={rejecting ? 'Reddetme nedeni' : toWho}
            htmlFor="request-status-note"
            required={rejecting}
            error={error ?? undefined}
            hint={
              rejecting
                ? `${who} bu açıklamayı görür.`
                : `İsteğe bağlı; ${who.toLocaleLowerCase('tr')} bu notu görür.`
            }
          >
            <Textarea
              id="request-status-note"
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button
            type="submit"
            form="request-status-form"
            variant={rejecting ? 'destructive' : 'default'}
            disabled={mutation.isPending}
          >
            {statusTitles[status]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RequestTaskDialog({
  request,
  open,
  onOpenChange,
}: {
  request: ServiceRequestDetailDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [employeeId, setEmployeeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<TaskPriority>(
    request.category === 'SECURITY' ? 'HIGH' : 'NORMAL',
  );
  const mutation = useApiMutation(
    () =>
      apiFetch<ServiceRequestDetailDto>(`/requests/${request.id}/task`, {
        method: 'POST',
        body: { employeeId: employeeId || null, dueDate: dueDate || null, priority },
      }),
    { success: 'Görev oluşturuldu', onSuccess: () => onOpenChange(false) },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Görev oluştur</DialogTitle>
          <DialogDescription>
            Talep bir çalışana görev olarak verilir. Görev tamamlanınca talep de çözüldü olarak
            kapanır.
          </DialogDescription>
        </DialogHeader>
        <form
          id="request-task-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(undefined);
          }}
        >
          <Field label="Çalışan" htmlFor="request-task-employee" className="sm:col-span-2">
            <EmployeeSelect
              id="request-task-employee"
              value={employeeId}
              onChange={setEmployeeId}
            />
          </Field>
          <Field label="Son tarih" htmlFor="request-task-due">
            <Input
              id="request-task-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
          <Field label="Öncelik" htmlFor="request-task-priority">
            <PrioritySelect id="request-task-priority" value={priority} onChange={setPriority} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button type="submit" form="request-task-form" disabled={mutation.isPending}>
            Görev oluştur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type StaffTopic = (typeof STAFF_MESSAGE_CATEGORIES)[number];

const staffTopicHints: Record<StaffTopic, string> = {
  SECURITY: 'Tanımadığınız, siteye girmeye çalışan biri gibi',
  FAULT: 'Bozulan, akan, yanmayan bir şey',
  OTHER: 'Yöneticiye iletmek istediğiniz başka bir konu',
};

export function StaffMessageDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [topic, setTopic] = useState<StaffTopic | null>(null);
  const [text, setText] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTopic(null);
    setText('');
    setUrgent(false);
    setPhotos([]);
    setError(null);
  };

  const mutation = useApiMutation(
    () => {
      const body = new FormData();
      body.append('category', topic ?? '');
      body.append('description', text);
      body.append('urgent', String(urgent));
      for (const photo of photos) body.append('photos', photo);
      return postForm<MyRequestDto>('/requests/mine/staff-message', body);
    },
    {
      success: 'Mesajınız yöneticiye iletildi',
      onSuccess: () => {
        reset();
        onOpenChange(false);
      },
    },
  );

  const submit = () => {
    const parsed = staffMessageSchema.safeParse({
      category: topic ?? undefined,
      description: text,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Bilgileri kontrol edin');
      return;
    }
    setError(null);
    mutation.mutate(undefined);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Yöneticiye yaz</DialogTitle>
          <DialogDescription>
            Gördüğünüz bir durumu yöneticiye bildirin. Yönetici yanıt yazınca telefonunuza bildirim
            gelir.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2" role="radiogroup" aria-label="Konu">
            <span className="text-sm font-medium">Konu</span>
            {STAFF_MESSAGE_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={topic === c}
                onClick={() => setTopic(c)}
                className={cn(
                  'grid gap-0.5 rounded-lg border p-3 text-left transition-colors',
                  topic === c
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'hover:bg-muted',
                )}
              >
                <span className="font-semibold">{staffMessageCategoryLabels[c]}</span>
                <span className="text-sm text-muted-foreground">{staffTopicHints[c]}</span>
              </button>
            ))}
          </div>
          <Field label="Ne oldu?" htmlFor="staff-message-text" required>
            <Textarea
              id="staff-message-text"
              rows={4}
              maxLength={2000}
              placeholder="Örn. B Blok otoparkında 20 dakikadır bekleyen tanımadığım biri var."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </Field>
          <label
            htmlFor="staff-message-urgent"
            className="flex items-start gap-3 rounded-lg border p-3"
          >
            <Checkbox
              id="staff-message-urgent"
              checked={urgent}
              onCheckedChange={(v) => setUrgent(v === true)}
              className="mt-0.5"
            />
            <span className="grid gap-0.5">
              <span className="font-medium">Acil</span>
              <span className="text-sm text-muted-foreground">
                Hemen bakılması gerekiyorsa işaretleyin. Can güvenliği varsa önce 112&apos;yi
                arayın.
              </span>
            </span>
          </label>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Fotoğraflar</span>
            <PhotoPicker files={photos} onChange={setPhotos} />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            Gönder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
