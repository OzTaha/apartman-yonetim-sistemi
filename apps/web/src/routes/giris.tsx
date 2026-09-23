import { loginSchema, type LoginInput } from '@apartman/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { CircleAlert, LogIn } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AuthShell } from '@/components/brand';
import { Field } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { ensureSession, login } from '@/lib/auth';
import { safeRedirect } from '@/lib/format';

export const Route = createFileRoute('/giris')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search['redirect'] === 'string' ? search['redirect'] : undefined,
  }),
  beforeLoad: async ({ search }) => {
    if (await ensureSession()) throw redirect({ href: safeRedirect(search.redirect) });
  },
  component: LoginPage,
});

function LoginPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await login(values);
      await navigate({ href: safeRedirect(search.redirect) });
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>Giriş yap</CardTitle>
          <CardDescription>E-posta adresiniz veya telefon numaranızla giriş yapın.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={onSubmit} noValidate>
            {error && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Field
              label="E-posta veya telefon"
              htmlFor="identifier"
              error={form.formState.errors.identifier?.message}
            >
              <Input
                id="identifier"
                autoComplete="username"
                inputMode="email"
                autoFocus
                {...form.register('identifier')}
              />
            </Field>
            <Field label="Şifre" htmlFor="password" error={form.formState.errors.password?.message}>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...form.register('password')}
              />
            </Field>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              <LogIn />
              {form.formState.isSubmitting ? 'Giriş yapılıyor…' : 'Giriş yap'}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="text-center text-xs text-muted-foreground">
        Hesabınız yoksa site yönetiminden davet bağlantısı isteyin.
      </p>
    </AuthShell>
  );
}
