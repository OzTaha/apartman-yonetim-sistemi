import { expect, type Page, test } from '@playwright/test';

async function login(page: Page, identifier: string) {
  await page.goto('/giris');
  await page.locator('#identifier').fill(identifier);
  await page.locator('#password').fill('Deneme123!');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}

test('sistem yöneticisi uygulama adını değiştirir; giriş ekranı ve sekme başlığı güncellenir', async ({
  page,
}, info) => {
  const name = `Deneme Yönetim ${info.project.name === 'masaustu' ? 'M' : 'T'}`;
  await login(page, 'admin@ornek.com');
  await expect(page).not.toHaveURL(/giris/);
  await page.goto('/marka');
  await expect(page.getByRole('heading', { name: 'Marka ayarları' })).toBeVisible();

  await page.locator('#brand-name').fill(name);
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Uygulama adı kaydedildi')).toBeVisible();
  await expect(page).toHaveTitle(name);

  await page.context().clearCookies();
  await page.goto('/giris');
  await expect(page.getByText(name)).toBeVisible();
  const manifest = await page.request.get('/api/branding/manifest.webmanifest');
  expect((await manifest.json()).name).toBe(name);

  await login(page, 'admin@ornek.com');
  await expect(page).not.toHaveURL(/giris/);
  await page.goto('/marka');
  await page.locator('#brand-name').fill('Apartman Yönetim Sistemi');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page).toHaveTitle('Apartman Yönetim Sistemi');
});

test('site yöneticisi marka ayarlarına giremez', async ({ page }) => {
  await login(page, 'yonetici@ornek.com');
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();
  await page.goto('/marka');
  await expect(page.getByRole('heading', { name: 'Marka ayarları' })).toHaveCount(0);
});
