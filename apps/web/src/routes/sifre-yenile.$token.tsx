import { passwordSchema, type PasswordResetInfoDto } from '@apartman/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { CircleAlert, CircleCheck, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthShell } from '@/components/brand';
import { Field } from '@/components/form-field';
import { LoadingRows } from '@/components/page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiFetch, errorMessage } from '@/lib/api';

export const Route = createFileRoute('/sifre-yenile/$token')({
  component: PasswordResetPage,
});

const formSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'Şifreler eşleşmiyor', path: ['confirm'] });
type FormValues = z.infer<typeof formSchema>;

function PasswordResetPage() {
  const { token } = Route.useParams();
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const path = `/auth/password-resets/${encodeURIComponent(token)}`;

  const info = useQuery({
    queryKey: ['password-reset', token],
    queryFn: () => apiFetch<PasswordResetInfoDto>(path, { noRetry: true, siteId: null }),
    retry: false,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: '', confirm: '' },
  });

  async function submit(values: FormValues) {
    setSubmitError(null);
    try {
      await apiFetch<void>(path, {
        method: 'POST',
        body: { password: values.password },
        noRetry: true,
        siteId: null,
      });
      setDone(true);
    } catch (e) {
      setSubmitError(errorMessage(e));
    }
  }

  if (info.isPending) {
    return (
      <AuthShell>
        <LoadingRows rows={3} />
      </AuthShell>
    );
  }

  if (info.isError) {
    return (
      <AuthShell>
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Bağlantı kullanılamıyor</AlertTitle>
          <AlertDescription>{errorMessage(info.error)}</AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <Link to="/giris">Giriş sayfasına git</Link>
        </Button>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell>
        <Alert>
          <CircleCheck />
          <AlertTitle>Şifreniz yenilendi</AlertTitle>
          <AlertDescription>
            Yeni şifrenizle giriş yapabilirsiniz. Diğer cihazlardaki oturumlarınız kapatıldı.
          </AlertDescription>
        </Alert>
        <Button asChild>
          <Link to="/giris">Giriş yap</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>Yeni şifre belirleyin</CardTitle>
          <CardDescription>Merhaba {info.data.firstName}, yeni şifrenizi girin.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" noValidate onSubmit={form.handleSubmit(submit)}>
            {submitError && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}
            <Field
              label="Yeni şifre"
              htmlFor="password"
              error={form.formState.errors.password?.message}
              hint="En az 8 karakter"
            >
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                autoFocus
                {...form.register('password')}
              />
            </Field>
            <Field
              label="Yeni şifre (tekrar)"
              htmlFor="confirm"
              error={form.formState.errors.confirm?.message}
            >
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                {...form.register('confirm')}
              />
            </Field>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              <KeyRound />
              {form.formState.isSubmitting ? 'Kaydediliyor…' : 'Şifremi yenile'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
