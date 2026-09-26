import { expect, type Page, test } from '@playwright/test';

const PASSWORD = 'Deneme123!';

async function login(page: Page, identifier: string) {
  await page.goto('/giris');
  await page.locator('#identifier').fill(identifier);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}

async function useApartment(page: Page) {
  const auth = await page.request.post('/api/auth/login', {
    data: { identifier: 'yonetici@ornek.com', password: PASSWORD },
  });
  const token = (await auth.json()).accessToken as string;
  const me = await (
    await page.request.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
  ).json();
  const siteId = me.memberships.find((m: { siteName: string }) => m.siteName === 'Örnek Apartmanı')
    .siteId as string;
  await page.evaluate((id) => localStorage.setItem('apartman.activeSiteId', id), siteId);
}

test('yönetici sakine şifre yenileme bağlantısı gönderir, sakin yeni şifreyle girer', async ({
  page,
  browser,
}) => {
  await login(page, 'yonetici@ornek.com');
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();
  await useApartment(page);
  await page.goto('/sakinler');
  await expect(page.getByRole('heading', { name: 'Sakinler' })).toBeVisible();

  await page.getByRole('button', { name: 'Ayşe Yılmaz için işlemler' }).first().click();
  await page.getByRole('menuitem', { name: 'Şifre yenileme bağlantısı' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/24 saat geçerlidir/)).toBeVisible();
  await dialog.getByRole('button', { name: 'SMS ile gönder' }).click();
  await expect(page.getByText('Bağlantı SMS ile gönderildi')).toBeVisible();
  const url = await dialog.getByRole('textbox', { name: 'Şifre yenileme bağlantısı' }).inputValue();
  expect(url).toMatch(/\/sifre-yenile\/[\w-]{40,}$/);

  const residentContext = await browser.newContext({
    viewport: page.viewportSize() ?? undefined,
    locale: 'tr-TR',
  });
  const resident = await residentContext.newPage();
  await resident.goto('/giris');
  await resident.getByRole('button', { name: 'Şifremi unuttum' }).click();
  await expect(resident.locator('#forgot-identifier')).toBeVisible();

  await resident.goto(new URL(url).pathname);
  await expect(resident.getByText('Merhaba Ayşe, yeni şifrenizi girin.')).toBeVisible();
  await resident.locator('#password').fill(PASSWORD);
  await resident.locator('#confirm').fill('baska-sifre');
  await resident.getByRole('button', { name: 'Şifremi yenile' }).click();
  await expect(resident.getByText('Şifreler eşleşmiyor')).toBeVisible();
  await resident.locator('#confirm').fill(PASSWORD);
  await resident.getByRole('button', { name: 'Şifremi yenile' }).click();
  await expect(resident.getByText('Şifreniz yenilendi')).toBeVisible();

  await resident.getByRole('link', { name: 'Giriş yap' }).click();
  await resident.locator('#identifier').fill('05321000000');
  await resident.locator('#password').fill(PASSWORD);
  await resident.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(resident.getByRole('heading', { name: 'Dairem' })).toBeVisible();

  await resident.goto(new URL(url).pathname);
  await expect(resident.getByText('Bu bağlantı zaten kullanılmış')).toBeVisible();
  await residentContext.close();
});
