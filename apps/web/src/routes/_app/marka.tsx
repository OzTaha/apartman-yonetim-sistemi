import {
  brandingSchema,
  LOGO_MAX_BYTES,
  LOGO_MAX_SIZE,
  LOGO_MIN_SIZE,
  type BrandingDto,
  type BrandingInput,
} from '@apartman/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, createFileRoute } from '@tanstack/react-router';
import { ImageUp, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { BrandMark } from '@/components/brand';
import { Field } from '@/components/form-field';
import { PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiFetch, errorMessage, uploadFile } from '@/lib/api';
import { brandingKey, useBranding } from '@/lib/branding';
import { useSession } from '@/lib/session';

export const Route = createFileRoute('/_app/marka')({
  component: BrandingPageGuard,
});

function BrandingPageGuard() {
  const { user } = useSession();
  if (!user?.isPlatformAdmin) return <Navigate to="/" replace />;
  return <BrandingPage />;
}

function readSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      reject(new Error('Görsel okunamadı'));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

function BrandingPage() {
  const branding = useBranding();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm<BrandingInput, unknown, z.output<typeof brandingSchema>>({
    resolver: zodResolver(brandingSchema),
    values: { appName: branding.appName },
  });

  const saved = (data: BrandingDto) => queryClient.setQueryData(brandingKey, data);

  async function run(action: () => Promise<BrandingDto>, success: string) {
    setBusy(true);
    try {
      saved(await action());
      toast.success(success);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.type !== 'image/png') return toast.error('Logo PNG biçiminde olmalıdır');
    if (file.size > LOGO_MAX_BYTES) return toast.error('Logo en fazla 1 MB olabilir');
    const size = await readSize(file).catch(() => null);
    if (
      !size ||
      size.width !== size.height ||
      size.width < LOGO_MIN_SIZE ||
      size.width > LOGO_MAX_SIZE
    ) {
      return toast.error(
        `Logo kare olmalı ve ${LOGO_MIN_SIZE}–${LOGO_MAX_SIZE} piksel arasında olmalıdır`,
      );
    }
    await run(() => uploadFile<BrandingDto>('/branding/logo', file), 'Logo yüklendi');
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Marka ayarları"
        description="Giriş ekranında, menüde, tarayıcı sekmesinde, telefona eklenen uygulamada ve PDF çıktılarında görünür."
      />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Uygulama adı</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4"
            noValidate
            onSubmit={form.handleSubmit((v) =>
              run(
                () => apiFetch<BrandingDto>('/branding', { method: 'PUT', body: v }),
                'Uygulama adı kaydedildi',
              ),
            )}
          >
            <Field
              label="Ad"
              htmlFor="brand-name"
              required
              error={form.formState.errors.appName?.message}
            >
              <Input id="brand-name" maxLength={40} {...form.register('appName')} />
            </Field>
            <Button type="submit" className="w-fit" disabled={busy}>
              Kaydet
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Logo</CardTitle>
          <CardDescription>
            Kare PNG, {LOGO_MIN_SIZE}–{LOGO_MAX_SIZE} piksel, en fazla 1 MB. Telefona eklenen
            uygulamanın simgesi de bu olur.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <BrandMark />
          <input
            ref={input}
            type="file"
            accept="image/png"
            className="hidden"
            aria-label="Logo dosyası"
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>
            <ImageUp />
            {branding.logoUrl ? 'Logoyu değiştir' : 'Logo yükle'}
          </Button>
          {branding.logoUrl && (
            <Button
              variant="outline"
              className="text-destructive"
              disabled={busy}
              onClick={() =>
                void run(
                  () => apiFetch<BrandingDto>('/branding/logo', { method: 'DELETE' }),
                  'Logo kaldırıldı',
                )
              }
            >
              <Trash2 />
              Logoyu kaldır
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
