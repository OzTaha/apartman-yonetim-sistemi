import { passwordSchema, type AuthResponse } from '@apartman/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Field } from '@/components/form-field';
import { PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import { useApiMutation } from '@/lib/queries';
import { session } from '@/lib/session';

export const Route = createFileRoute('/_app/sifre')({
  component: ChangePasswordPage,
});

const formSchema = z
  .object({
    currentPassword: z.string().min(1, 'Mevcut şifrenizi girin'),
    newPassword: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    message: 'Şifreler eşleşmiyor',
    path: ['confirm'],
  });
type FormValues = z.infer<typeof formSchema>;

function ChangePasswordPage() {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  });
  const mutation = useApiMutation(
    ({ currentPassword, newPassword }: FormValues) =>
      apiFetch<AuthResponse>('/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      }),
    {
      success: 'Şifreniz değiştirildi. Diğer cihazlardaki oturumlar kapatıldı.',
      onSuccess: (auth) => {
        session.setAuth(auth);
        form.reset();
      },
    },
  );
  const errors = form.formState.errors;

  return (
    <div className="grid max-w-md gap-6">
      <PageHeader title="Şifre değiştir" />
      <Card>
        <CardContent>
          <form
            className="grid gap-4"
            noValidate
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
          >
            <Field label="Mevcut şifre" htmlFor="current" error={errors.currentPassword?.message}>
              <Input
                id="current"
                type="password"
                autoComplete="current-password"
                {...form.register('currentPassword')}
              />
            </Field>
            <Field
              label="Yeni şifre"
              htmlFor="new"
              error={errors.newPassword?.message}
              hint="En az 8 karakter"
            >
              <Input
                id="new"
                type="password"
                autoComplete="new-password"
                {...form.register('newPassword')}
              />
            </Field>
            <Field label="Yeni şifre (tekrar)" htmlFor="confirm" error={errors.confirm?.message}>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                {...form.register('confirm')}
              />
            </Field>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Kaydediliyor…' : 'Şifreyi değiştir'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
