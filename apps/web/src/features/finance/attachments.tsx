import { ATTACHMENT_ACCEPT, type AttachmentDto, type AttachmentTarget } from '@apartman/shared';
import { Download, FileImage, FileText, Paperclip, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiFetch, downloadFile, errorMessage, openFile } from '@/lib/api';
import { useApiMutation, useRefreshSiteData } from '@/lib/queries';
import { checkFile, formatBytes, uploadAll } from './files';

function FileIcon({ mimeType }: { mimeType: string }) {
  const Icon = mimeType === 'application/pdf' ? FileText : FileImage;
  return <Icon className="size-4 shrink-0 text-muted-foreground" />;
}

export function AttachmentList({
  attachments,
  deletable = false,
}: {
  attachments: AttachmentDto[];
  deletable?: boolean;
}) {
  const remove = useApiMutation(
    (id: string) => apiFetch<void>(`/attachments/${id}`, { method: 'DELETE' }),
    { success: 'Belge silindi' },
  );
  if (attachments.length === 0) return null;

  const open = (a: AttachmentDto) =>
    void openFile(`/attachments/${a.id}`, a.fileName).catch((e: unknown) =>
      toast.error(errorMessage(e)),
    );
  const download = (a: AttachmentDto) =>
    void downloadFile(`/attachments/${a.id}`, a.fileName).catch((e: unknown) =>
      toast.error(errorMessage(e)),
    );

  return (
    <ul className="grid gap-1">
      {attachments.map((a) => (
        <li key={a.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
          <FileIcon mimeType={a.mimeType} />
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left hover:underline"
            onClick={() => open(a)}
          >
            {a.fileName}
          </button>
          <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(a.sizeBytes)}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`${a.fileName} indir`}
            onClick={() => download(a)}
          >
            <Download />
          </Button>
          {deletable && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={`${a.fileName} sil`}
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(`${a.fileName} silinsin mi?`)) remove.mutate(a.id);
              }}
            >
              <Trash2 />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function AttachmentUploadButton({
  target,
  targetId,
  label = 'Belge ekle',
}: {
  target: AttachmentTarget;
  targetId: string;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const refresh = useRefreshSiteData();
  const [busy, setBusy] = useState(false);

  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (input.current) input.current.value = '';
    const problems = files.map(checkFile).filter((p): p is string => !!p);
    problems.forEach((p) => toast.error(p));
    const valid = files.filter((f) => !checkFile(f));
    if (valid.length === 0) return;
    setBusy(true);
    const uploaded = await uploadAll(target, targetId, valid);
    setBusy(false);
    if (uploaded > 0) toast.success(`${uploaded} belge yüklendi`);
    await refresh();
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ATTACHMENT_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => void onFiles(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <Paperclip />
        {busy ? 'Yükleniyor…' : label}
      </Button>
    </>
  );
}

export function FilePicker({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  function add(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (input.current) input.current.value = '';
    picked.map(checkFile).forEach((p) => p && toast.error(p));
    onChange([...files, ...picked.filter((f) => !checkFile(f))]);
  }

  return (
    <div className="grid gap-2">
      <input
        ref={input}
        id="file-picker"
        type="file"
        accept={ATTACHMENT_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => add(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        className="justify-start"
        onClick={() => input.current?.click()}
      >
        <Paperclip />
        Fatura, makbuz veya fotoğraf ekle
      </Button>
      {files.length > 0 && (
        <ul className="grid gap-1">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm"
            >
              <FileIcon mimeType={f.type} />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={`${f.name} kaldır`}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
