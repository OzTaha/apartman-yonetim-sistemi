import { LOGIN_NOTICE_TEXT, loginSchema, removeSpaces, type LoginInput } from '@apartman/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { CircleAlert, CircleCheck, Info, LogIn } from 'lucide-react';
import { type ChangeEvent, type FormEvent, useState } from 'react';
import { useForm } from 'react-hook-form';
import { AuthShell } from '@/components/brand';
import { Field } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PasswordInput } from '@/components/password-input';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch, errorMessage } from '@/lib/api';
import { ensureSession, login } from '@/lib/auth';
import { useBranding } from '@/lib/branding';
import { safeRedirect } from '@/lib/format';

export const Route = createFileRoute('/giris')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string; neden?: string } => ({
    redirect: typeof search['redirect'] === 'string' ? search['redirect'] : undefined,
    neden: typeof search['neden'] === 'string' ? search['neden'] : undefined,
  }),
  beforeLoad: async ({ search }) => {
    if (await ensureSession()) throw redirect({ href: safeRedirect(search.redirect) });
  },
  component: LoginPage,
});

const REMEMBER_KEY = 'apartman.rememberedIdentifier';

function readRemembered(): string {
  try {
    return localStorage.getItem(REMEMBER_KEY) ?? '';
  } catch {
    return '';
  }
}

function storeRemembered(identifier: string | null) {
  try {
    if (identifier) localStorage.setItem(REMEMBER_KEY, identifier);
    else localStorage.removeItem(REMEMBER_KEY);
  } catch {
    return;
  }
}

function LoginPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  const [remembered] = useState(readRemembered);
  const [remember, setRemember] = useState(Boolean(remembered));
  const { loginNotice } = useBranding();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: remembered, password: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await login(values);
      storeRemembered(remember ? values.identifier : null);
      await navigate({ href: safeRedirect(search.redirect) });
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <AuthShell>
      {loginNotice && (
        <Alert>
          <Info />
          <AlertDescription>{LOGIN_NOTICE_TEXT}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Giriş yap</CardTitle>
          <CardDescription>E-posta adresiniz veya telefon numaranızla giriş yapın.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={onSubmit} noValidate>
            {search.neden === 'hareketsizlik' && !error && (
              <Alert>
                <CircleAlert />
                <AlertDescription>
                  Uzun süre işlem yapılmadığı için güvenliğiniz için oturumunuz kapatıldı. Lütfen
                  yeniden giriş yapın.
                </AlertDescription>
              </Alert>
            )}
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
                autoFocus={!remembered}
                spellCheck={false}
                autoCapitalize="none"
                {...form.register('identifier', {
                  onChange: (e: ChangeEvent<HTMLInputElement>) => {
                    const value = removeSpaces(e.target.value);
                    if (value !== e.target.value) form.setValue('identifier', value);
                  },
                })}
              />
            </Field>
            <Field label="Şifre" htmlFor="password" error={form.formState.errors.password?.message}>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                autoFocus={Boolean(remembered)}
                {...form.register('password')}
              />
            </Field>
            <div className="flex items-center gap-2">
              <Checkbox
                id="remember"
                checked={remember}
                onCheckedChange={(v) => setRemember(v === true)}
              />
              <Label htmlFor="remember" className="font-normal">
                Kullanıcı adımı hatırla
              </Label>
            </div>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              <LogIn />
              {form.formState.isSubmitting ? 'Giriş yapılıyor…' : 'Giriş yap'}
            </Button>
          </form>
          <Button
            type="button"
            variant="link"
            className="mt-2 h-auto w-full p-0 text-sm"
            aria-expanded={forgot}
            onClick={() => setForgot((v) => !v)}
          >
            Şifremi unuttum
          </Button>
          {forgot && <ForgotPasswordForm />}
        </CardContent>
      </Card>
      <p className="text-center text-xs text-muted-foreground">
        Hesabınız yoksa site yönetiminden davet bağlantısı isteyin.
      </p>
    </AuthShell>
  );
}

function ForgotPasswordForm() {
  const [identifier, setIdentifier] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!identifier) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ message: string }>('/auth/password-reset-requests', {
        method: 'POST',
        body: { identifier },
        noRetry: true,
        siteId: null,
      });
      setResult({ ok: true, message: res.message });
    } catch (error) {
      setResult({ ok: false, message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mt-2 grid gap-3" noValidate onSubmit={(e) => void submit(e)}>
      <p className="text-sm text-muted-foreground">
        Telefon numaranızı veya e-posta adresinizi yazın. Talebiniz yönetime iletilir, yönetim size
        şifre yenileme bağlantısı gönderir.
      </p>
      <Field label="E-posta veya telefon" htmlFor="forgot-identifier">
        <Input
          id="forgot-identifier"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={identifier}
          onChange={(e) => setIdentifier(removeSpaces(e.target.value))}
        />
      </Field>
      <Button type="submit" variant="outline" disabled={busy || !identifier}>
        {busy ? 'Gönderiliyor…' : 'Talep gönder'}
      </Button>
      {result && (
        <Alert variant={result.ok ? 'default' : 'destructive'}>
          {result.ok ? <CircleCheck /> : <CircleAlert />}
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
