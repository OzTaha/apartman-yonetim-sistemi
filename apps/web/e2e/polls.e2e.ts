import { expect, type Page, test } from './fixtures';

async function login(page: Page, identifier: string) {
  await page.goto('/giris');
  await page.locator('#identifier').fill(identifier);
  await page.locator('#password').fill('Deneme123!');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).not.toHaveURL(/giris/, { timeout: 20_000 });
}

async function switchPlace(page: Page, name: string) {
  const switcher = page.getByRole('button', { name: 'Site değiştir' });
  if ((page.viewportSize()?.width ?? 0) < 768) {
    await page.getByRole('button', { name: 'Menüyü aç/kapat' }).click();
  }
  await switcher.click();
  await page.getByRole('menuitem', { name }).click();
}

test('yönetici anket açar, sakin dairesi adına oy verir, yönetici bitirip sonucu paylaşır', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const question = `Bahçeye bank konulsun mu ${info.project.name === 'masaustu' ? 'M' : 'T'}${String(Date.now()).slice(-5)}?`;

  await login(page, 'yonetici@ornek.com');
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();
  await switchPlace(page, 'Örnek Apartmanı');
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();
  await page.goto('/anketler');
  await page.getByRole('button', { name: 'Yeni anket' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Anketi yayınla' }).click();
  await expect(dialog.getByText('Soruyu yazın (en az 5 karakter)')).toBeVisible();
  await dialog.locator('#poll-question').fill(question);
  await dialog.getByRole('button', { name: 'Anketi yayınla' }).click();
  await expect(page.getByRole('heading', { name: question })).toBeVisible();
  await expect(page.getByText(/daireden 0 daire oy verdi/)).toBeVisible();
  const detailUrl = page.url();

  await page.context().clearCookies();
  await login(page, '05321000000');
  await page.goto('/anketler');
  const card = page.locator('[data-slot=card]').filter({ hasText: question });
  await card.getByRole('radio', { name: 'Evet' }).click();
  await card.getByRole('button', { name: 'Oyumu ver' }).click();
  await expect(page.getByText('Oyunuz kaydedildi')).toBeVisible();
  await expect(card.getByText('Evet (sizin oyunuz)')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Oyumu değiştir' })).toBeVisible();

  await page.context().clearCookies();
  await login(page, 'yonetici@ornek.com');
  await page.goto(detailUrl);
  await expect(page.getByText(/daireden 1 daire oy verdi/)).toBeVisible();
  await page.getByRole('button', { name: 'Anketi bitir' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Evet, bitir' }).click();
  await expect(page.getByText('Anket bitirildi')).toBeVisible();
  await page.getByRole('button', { name: 'Sonucu duyuru olarak paylaş' }).click();
  await expect(page.getByText('Sonuç duyuru olarak paylaşıldı', { exact: true })).toBeVisible();
});
