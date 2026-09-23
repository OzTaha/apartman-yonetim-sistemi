import {
  passwordSchema,
  type AcceptInviteResultDto,
  type InvitationInfoDto,
} from '@apartman/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
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
import { session } from '@/lib/session';

export const Route = createFileRoute('/davet/$token')({
  component: InvitationPage,
});

const newPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'Şifreler eşleşmiyor', path: ['confirm'] });
type NewPasswordForm = z.infer<typeof newPasswordSchema>;

function InvitationPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [linked, setLinked] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const info = useQuery({
    queryKey: ['invitation', token],
    queryFn: () =>
      apiFetch<InvitationInfoDto>(`/auth/invitations/${encodeURIComponent(token)}`, {
        noRetry: true,
        siteId: null,
      }),
    retry: false,
  });

  const form = useForm<NewPasswordForm>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  });

  async function accept(password?: string) {
    setSubmitError(null);
    try {
      const result = await apiFetch<AcceptInviteResultDto>(
        `/auth/invitations/${encodeURIComponent(token)}/accept`,
        { method: 'POST', body: password ? { password } : {}, noRetry: true, siteId: null },
      );
      if (result.status === 'ACTIVATED') {
        session.setAuth(result);
        await navigate({ to: '/' });
      } else {
        setLinked(true);
      }
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
          <AlertTitle>Davet bağlantısı kullanılamıyor</AlertTitle>
          <AlertDescription>{errorMessage(info.error)}</AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <Link to="/giris">Giriş sayfasına git</Link>
        </Button>
      </AuthShell>
    );
  }

  const invitation = info.data;
  const unitLabel = `${invitation.siteName} · ${invitation.blockName} Blok, Daire ${invitation.unitNumber}`;

  if (linked) {
    return (
      <AuthShell>
        <Alert>
          <CircleCheck />
          <AlertTitle>Daire hesabınıza eklendi</AlertTitle>
          <AlertDescription>
            {unitLabel} artık mevcut hesabınızda görünüyor. Her zamanki şifrenizle giriş
            yapabilirsiniz.
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
          <CardTitle>Hoş geldiniz, {invitation.firstName}</CardTitle>
          <CardDescription>{unitLabel}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {submitError && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          {invitation.hasExistingAccount ? (
            <>
              <p className="text-sm text-muted-foreground">
                Bu bilgilerle kayıtlı bir hesabınız zaten var. Onaylarsanız daire mevcut hesabınıza
                eklenir.
              </p>
              <Button onClick={() => void accept()}>Daireyi hesabıma ekle</Button>
            </>
          ) : (
            <form
              className="grid gap-4"
              noValidate
              onSubmit={form.handleSubmit((v) => accept(v.password))}
            >
              <p className="text-sm text-muted-foreground">
                Hesabınızı oluşturmak için bir şifre belirleyin. Sonraki girişlerde telefon
                numaranızı veya e-posta adresinizi kullanabilirsiniz.
              </p>
              <Field
                label="Şifre"
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
                label="Şifre (tekrar)"
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
                {form.formState.isSubmitting ? 'Hesap oluşturuluyor…' : 'Hesabımı oluştur'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
