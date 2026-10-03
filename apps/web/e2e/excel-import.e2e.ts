import { fileURLToPath } from 'node:url';
import { expect, test } from './fixtures';

const file = fileURLToPath(new URL('./data/aktarma.xlsx', import.meta.url));

test('yönetici Excel şablonunu indirir, dosyayı yükleyince önizleme ve hataları görür', async ({
  page,
}) => {
  await page.goto('/giris');
  await page.locator('#identifier').fill('yonetici@ornek.com');
  await page.locator('#password').fill('Deneme123!');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible({ timeout: 20_000 });

  await page.goto('/excel-aktarma');
  await expect(page.getByRole('heading', { name: "Excel'den aktar" })).toBeVisible();
  const [template] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Şablonu indir' }).click(),
  ]);
  expect(template.suggestedFilename()).toBe('toplu-aktarma-sablonu.xlsx');

  await page.locator('#import-file').setInputFiles(file);
  await expect(page.getByText('3. Kontrol edin ve aktarın')).toBeVisible();
  await expect(page.getByText('1 satırda sorun var')).toBeVisible();
  await expect(page.getByText('Telefon: Geçerli bir telefon numarası girin')).toBeVisible();
  await expect(page.getByText('A Blok · Daire 1 sistemde zaten var')).toBeVisible();
  await expect(page.getByRole('button', { name: /kaydı aktar$/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(page.getByText('3. Kontrol edin ve aktarın')).toBeHidden();
});
