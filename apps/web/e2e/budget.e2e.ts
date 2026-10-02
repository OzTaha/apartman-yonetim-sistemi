import { expect, type Page, test } from './fixtures';

async function login(page: Page, identifier: string) {
  await page.goto('/giris');
  await page.locator('#identifier').fill(identifier);
  await page.locator('#password').fill('Deneme123!');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}

async function switchPlace(page: Page, name: string) {
  const switcher = page.getByRole('button', { name: 'Site değiştir' });
  if (!(await switcher.isVisible())) {
    await page.getByRole('button', { name: 'Menüyü aç/kapat' }).click();
  }
  await switcher.click();
  await page.getByRole('menuitem', { name }).click();
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'sayfa yatay olarak taşıyor').toBeLessThanOrEqual(1);
}

test('yönetici bütçeden avans aidatı hesaplar, sonraki dönemi kopyalar; denetçi yalnızca görür', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await login(page, 'yonetici@ornek.com');
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();
  await switchPlace(page, 'Örnek Sitesi');
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();

  await page.goto('/butce');
  await expect(page.getByRole('heading', { name: 'İşletme projesi' })).toBeVisible();
  const current = page.locator('[data-slot="card"]', { hasText: 'Güncel dönem' });
  await expect(current.getByText('₺84.000,00')).toBeVisible();
  await expect(current.getByText(/5 gider kalemi · Daire başı/)).toBeVisible();
  await current.click();
  await expect(page.getByText('Temizlik firması sözleşmesi')).toHaveCount(0);
  await expect(page.getByLabel('1. kalemin açıklaması')).toHaveValue('Temizlik firması sözleşmesi');
  await expect(page.getByText('Bütçe ve gerçekleşen')).toBeVisible();
  await expectNoHorizontalScroll(page);

  const [pdf] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'PDF indir' }).click(),
  ]);
  expect(pdf.suggestedFilename()).toMatch(/^isletme-projesi-\d{4}-\d{2}\.pdf$/);

  await page.getByRole('link', { name: 'İşletme projesi' }).first().click();
  await page.getByRole('button', { name: 'Bütçe oluştur' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel(/5 gider kalemini kopyala/)).toBeChecked();
  await dialog.getByRole('button', { name: 'Oluştur' }).click();
  await expect(page.getByText('Bütçe oluşturuldu')).toBeVisible();
  await expect(page.getByLabel('5. kalemin yıllık tutarı')).toBeVisible();

  await page.getByRole('button', { name: 'Kalem ekle' }).click();
  await page.getByRole('combobox', { name: '6. kalem' }).click();
  await page.getByRole('option', { name: 'Su', exact: true }).click();
  await page.getByLabel('6. kalemin yıllık tutarı').fill('12.000');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Bütçe kaydedildi')).toBeVisible();
  await expect(page.getByText('₺96.000,00').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aidat planı olarak uygula' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: info.outputPath('butce.png'), fullPage: true });

  await page.getByRole('button', { name: 'Sil' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sil' }).click();
  await expect(page.getByText('Bütçe silindi')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'İşletme projesi' })).toBeVisible();

  await page.context().clearCookies();
  await login(page, '05321000012');
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();
  await page.goto('/butce');
  await expect(page.getByRole('button', { name: 'Bütçe oluştur' })).toHaveCount(0);
  await page.locator('[data-slot="card"]', { hasText: 'Güncel dönem' }).click();
  await expect(page.getByText('Temizlik firması sözleşmesi')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kaydet' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sil' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Aidat planı olarak uygula' })).toHaveCount(0);

  await page.context().clearCookies();
  await login(page, '05321000000');
  await expect(
    page.getByRole('heading', { name: /^(Günaydın|İyi günler|İyi akşamlar), / }),
  ).toBeVisible();
  await page.goto('/butce');
  await expect(page).not.toHaveURL(/butce/);
});
