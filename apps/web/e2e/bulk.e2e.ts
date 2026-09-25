import { expect, test } from '@playwright/test';

test('toplam tutar dairelere eşit bölünür ve borçlar toplu iptal edilir', async ({ page }) => {
  await page.goto('/giris');
  await page.locator('#identifier').fill('yonetici@ornek.com');
  await page.locator('#password').fill('Deneme123!');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();

  await page.goto('/borclar');
  await page.getByRole('button', { name: 'Borç ekle' }).click();
  const dialog = page.getByRole('dialog');
  await page.locator('#ch-mode').click();
  await page.getByRole('option', { name: 'Toplamı dairelere eşit böl' }).click();
  await dialog.locator('#ch-amount').fill('1.000');
  const preview = dialog.getByRole('listitem');
  const count = await preview.count();
  expect(count).toBeGreaterThan(1);
  const amounts = new Set(
    (await preview.allInnerTexts()).map((t) =>
      t
        .split('\n')
        .at(-1)!
        .replace(/,\d\d$/, ''),
    ),
  );
  expect(amounts.size).toBeLessThanOrEqual(2);
  await dialog.getByRole('button', { name: 'Borcu yaz' }).click();
  await expect(page.getByText(`${count} daireye toplam ₺1.000,00 borç yazıldı`)).toBeVisible();

  await page.getByRole('combobox', { name: 'Borç türü filtresi' }).click();
  await page.getByRole('option', { name: 'Demirbaş' }).click();
  await page.getByRole('checkbox', { name: 'Tümünü seç' }).filter({ visible: true }).click();
  const bar = page.getByRole('region', { name: 'Toplu işlem' });
  await expect(bar).toContainText(`${count} borç seçildi`);
  await bar.getByRole('button', { name: 'Seçilenleri iptal et' }).click();
  await page.locator('#cancel-reason').fill('Yanlış yazıldı');
  await page.getByRole('dialog').getByRole('button', { name: 'İptal et' }).click();
  await expect(page.getByText(`${count} borç iptal edildi`)).toBeVisible();
  await expect(page.getByText('Seçili filtrelere uygun borç bulunamadı.')).toBeVisible();
});
