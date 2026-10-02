import { expect, test } from './fixtures';

test('yönetici bu ay için yeni aidat girerken sorulur, yanlış tanımı siler', async ({ page }) => {
  await page.goto('/giris');
  await page.locator('#identifier').fill('yonetici@ornek.com');
  await page.locator('#password').fill('Deneme123!');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible({ timeout: 20_000 });

  await page.goto('/aidat-ayarlari');
  await expect(page.getByRole('heading', { name: 'Aidat ayarları' })).toBeVisible();
  await page.getByRole('button', { name: 'Aidat nasıl yazılır? hakkında bilgi' }).click();
  await expect(page.getByText('Sizin her ay bir şey yapmanız gerekmez.')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.locator('#plan-amount').fill('2.345,00');
  await page.getByRole('button', { name: 'Aidatı kaydet' }).click();
  const ask = page.getByRole('alertdialog');
  await expect(ask.getByRole('heading', { name: 'Bu ayın aidatı da değişsin mi?' })).toBeVisible();
  await ask.getByRole('button', { name: 'Hayır, sonraki aylar' }).click();
  await expect(page.getByText(/Yeni aidat .* itibarıyla geçerli$/)).toBeVisible();

  const remove = page.getByRole('button', { name: /^Daire başı ₺2\.345,00, .* tanımını sil$/ });
  await remove.click();
  const confirm = page.getByRole('alertdialog');
  await expect(
    confirm.getByText('Bu tanımla daha önce dairelere yazılmış aidatlar silinmez', {
      exact: false,
    }),
  ).toBeVisible();
  await confirm.getByRole('button', { name: 'Evet, sil' }).click();
  await expect(page.getByText('Aidat tanımı silindi')).toBeVisible();
  await expect(remove).toHaveCount(0);
});
