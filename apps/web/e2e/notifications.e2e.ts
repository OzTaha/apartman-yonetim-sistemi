import { expect, type Page, test } from '@playwright/test';

async function login(page: Page, identifier: string) {
  await page.goto('/giris');
  await page.locator('#identifier').fill(identifier);
  await page.locator('#password').fill('Deneme123!');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}

test('tablolar sayfalanır, sayfa başına satır sayısı hatırlanır', async ({ page }) => {
  await login(page, 'yonetici@ornek.com');
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();
  await page.goto('/kasa');
  const pager = page.getByRole('navigation', { name: 'Sayfalama' });
  await expect(pager).toBeVisible();
  await pager.getByRole('combobox', { name: 'Sayfa başına satır' }).click();
  await page.getByRole('option', { name: '15', exact: true }).click();
  await expect(pager.getByText(/^1–15 \/ \d+$/)).toBeVisible();
  await pager.getByRole('button', { name: 'Sonraki sayfa' }).click();
  await expect(pager.getByText(/^16–\d+ \/ \d+$/)).toBeVisible();
  await expect(pager.getByText(/^2 \/ \d+$/)).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole('navigation', { name: 'Sayfalama' }).getByText(/^1–15 \/ \d+$/),
  ).toBeVisible();
});

test('sakinin şifre talebi yöneticiye anında düşer, yönetici bağlantıyı gönderir', async ({
  page,
  browser,
}) => {
  await login(page, 'yonetici@ornek.com');
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();
  await page.goto('/bildirimler');
  await expect(page.getByRole('heading', { name: 'Bildirimler' })).toBeVisible();

  const residentContext = await browser.newContext({
    viewport: page.viewportSize() ?? undefined,
    locale: 'tr-TR',
  });
  const resident = await residentContext.newPage();
  await resident.goto('/giris');
  await resident.getByRole('button', { name: 'Şifremi unuttum' }).click();
  await resident.locator('#forgot-identifier').fill('0555 000 00 00');
  await resident.getByRole('button', { name: 'Talep gönder' }).click();
  await expect(resident.getByText(/Sisteme kayıtlı değilsiniz/)).toBeVisible();
  await resident.locator('#forgot-identifier').fill('0532 100 00 00');
  await expect(resident.locator('#forgot-identifier')).toHaveValue('05321000000');
  await resident.getByRole('button', { name: 'Talep gönder' }).click();
  await expect(resident.getByText(/Talebiniz yönetime iletildi/)).toBeVisible();
  await residentContext.close();

  await expect(
    page.getByText('Ayşe Yılmaz (Daire 1) yeni şifre bağlantısı istiyor.').first(),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Bildirimler, \d+ okunmamış/ })).toBeVisible();

  const card = page
    .locator('[data-slot="card"]', { hasText: 'Ayşe Yılmaz (Daire 1)' })
    .filter({ hasText: 'Bekliyor' })
    .first();
  await card.getByRole('button', { name: 'Şifre bağlantısı gönder' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'SMS ile gönder' }).click();
  await expect(page.getByText('Bağlantı SMS ile gönderildi')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    page
      .locator('[data-slot="card"]', { hasText: 'Ayşe Yılmaz (Daire 1)' })
      .first()
      .getByText('Tamamlandı'),
  ).toBeVisible();
});
