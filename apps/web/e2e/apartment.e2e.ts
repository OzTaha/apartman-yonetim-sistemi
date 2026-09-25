import { expect, type Page, test } from '@playwright/test';

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'sayfa yatay olarak taşıyor').toBeLessThanOrEqual(1);
}

async function switchPlace(page: Page, name: string) {
  const switcher = page.getByRole('button', { name: 'Site değiştir' });
  if (!(await switcher.isVisible())) {
    await page.getByRole('button', { name: 'Menüyü aç/kapat' }).click();
  }
  await switcher.click();
  await page.getByRole('menuitem', { name }).click();
}

const unitLink = (page: Page, label: string) =>
  page.getByText(label, { exact: true }).filter({ visible: true }).first();

test('apartmanda blok görünmez; geçmişi olmayan daire silinir, ödemesi olan arşivlenir', async ({
  page,
}) => {
  await page.goto('/giris');
  await page.locator('#identifier').fill('yonetici@ornek.com');
  await page.locator('#password').fill('Deneme123!');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();

  await switchPlace(page, 'Örnek Apartmanı');
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();
  await page.goto('/daireler');
  await expect(page.getByText('5 daire', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bloklar' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Blok filtresi' })).toHaveCount(0);
  await expect(unitLink(page, 'Daire 1')).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: 'Daire ekle' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('#unit-block')).toHaveCount(0);
  await dialog.locator('#unit-number').fill('6');
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Daire eklendi')).toBeVisible();

  await unitLink(page, 'Daire 6').click();
  await expect(page.getByRole('heading', { name: 'Daire 6' })).toBeVisible();
  await page.getByRole('button', { name: 'Sil' }).click();
  await expect(page.getByRole('dialog').getByText('Daire 6 silinsin mi?')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Sil' }).click();
  await expect(page.getByText('Daire 6 silindi')).toBeVisible();
  await expect(page).toHaveURL(/\/daireler$/);

  await unitLink(page, 'Daire 5').click();
  await expect(page.getByRole('heading', { name: 'Daire 5' })).toBeVisible();
  await page.getByRole('button', { name: 'Sil' }).click();
  await expect(page.getByRole('dialog').getByText('Daire 5 arşivlensin mi?')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Arşivle' }).click();
  await expect(page.getByText('Daire 5 arşivlendi')).toBeVisible();
  await expect(page.getByText(/Bu daire arşivde/)).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.goto('/daireler');
  await expect(unitLink(page, 'Daire 1')).toBeVisible();
  await expect(page.getByText('Daire 5', { exact: true }).filter({ visible: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Arşiv filtresi' }).click();
  await page.getByRole('option', { name: 'Arşivdekiler' }).click();
  await unitLink(page, 'Daire 5').click();
  await page.getByRole('button', { name: 'Arşivden çıkar' }).click();
  await expect(page.getByText('Daire arşivden çıkarıldı')).toBeVisible();
});
