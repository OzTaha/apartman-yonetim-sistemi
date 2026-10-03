import { expect, test } from './fixtures';

test.use({ showTours: true });

test('yönetici ilk girişte turu görür; bugün yapılacaklar, sayfa açıklaması ve hızlı arama çalışır', async ({
  page,
}) => {
  await page.goto('/giris');
  await page.locator('#identifier').fill('yonetici@ornek.com');
  await page.locator('#password').fill('Deneme123!');
  await page.getByRole('button', { name: 'Giriş yap' }).click();

  const tour = page.getByRole('dialog', { name: 'Her gün önce buraya bakın' });
  await expect(tour).toBeVisible({ timeout: 20_000 });
  await tour.getByRole('button', { name: 'Atla' }).click();
  await expect(tour).toBeHidden();

  const today = page.locator('[data-tour="today"]');
  await expect(today.getByText('Bugün yapılacaklar')).toBeVisible();
  await expect(today.getByRole('link').first()).toBeVisible();

  await page.goto('/kasa');
  await page.getByRole('button', { name: 'Kasa nedir? hakkında bilgi' }).click();
  await expect(page.getByText('Apartmanın parasının nereye girip nereden çıktığını')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Ara (Ctrl+K)' }).click();
  const search = page.getByRole('dialog', { name: 'Ara' });
  await search.getByLabel('Arama').fill('borç');
  await search.getByRole('option').filter({ hasText: 'Borçlar' }).first().click();
  await expect(page).toHaveURL(/\/borclar/);
  await expect(page.getByRole('heading', { name: 'Borçlar', exact: true })).toBeVisible();
});
