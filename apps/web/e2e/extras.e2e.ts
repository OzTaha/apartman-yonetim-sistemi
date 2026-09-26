import { expect, type Page, test } from '@playwright/test';

async function login(page: Page, identifier: string) {
  await page.goto('/giris');
  await page.locator('#identifier').fill(identifier);
  await page.locator('#password').fill('Deneme123!');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'sayfa yatay olarak taşıyor').toBeLessThanOrEqual(1);
}

function trToday() {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

test('borç durum yazısı iner, banka havalesi tahsilata dönüşür, işlem geçmişinde görünür', async ({
  page,
}, info) => {
  const suffix = `${info.project.name === 'masaustu' ? 'M' : 'T'}${String(Date.now()).slice(-5)}`;
  await login(page, 'yonetici@ornek.com');
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();

  await page.goto('/daireler');
  await page.getByText('A Blok · Daire 2').filter({ visible: true }).first().click();
  await expect(page.getByRole('heading', { name: 'A Blok · Daire 2' })).toBeVisible();
  const [letter] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Borç durum yazısı' }).click(),
  ]);
  expect(letter.suggestedFilename()).toMatch(/^borc-durum-A-2-\d{4}-\d{2}-\d{2}\.pdf$/);

  await page.goto('/banka-hareketleri');
  await expect(page.getByRole('heading', { name: 'Banka hareketleri' })).toBeVisible();
  const csv = [
    'Tarih;Açıklama;Tutar;Bakiye',
    `${trToday()};ELİF ARSLAN A BLOK D:2 AİDAT ${suffix};100,00;1.000,00`,
    `${trToday()};Kira ödemesi;-50,00;950,00`,
    `${trToday()};Bilinmeyen ${suffix};20,00;970,00`,
  ].join('\n');
  await page.locator('#bank-file').setInputFiles({
    name: 'hareketler.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });
  await expect(page.getByText(/2 gelen hareket bulundu · 1 satır/)).toBeVisible();
  await page.getByRole('button', { name: 'Dairelerle eşleştir' }).click();
  await expect(
    page.getByText('Açıklamada daire ve sakin adı geçiyor').filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(page.getByText('Eşleşti', { exact: true }).filter({ visible: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Tahsilat olarak kaydet (1)' }).click();
  await expect(page.getByText('1 tahsilat kaydedildi · ₺100,00')).toBeVisible();
  await expect(page.getByText('Aktarıldı', { exact: true }).filter({ visible: true })).toHaveCount(
    1,
  );
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: info.outputPath('banka.png'), fullPage: true });

  await page.goto('/islem-gecmisi');
  await expect(page.getByRole('heading', { name: 'İşlem geçmişi' })).toBeVisible();
  const row = page
    .getByText(/İçe aktarma/)
    .filter({ visible: true })
    .first();
  await row.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Banka hareketi · İçe aktarma')).toBeVisible();
  await expect(dialog.getByText('imported')).toBeVisible();
  await page.keyboard.press('Escape');
  await expectNoHorizontalScroll(page);

  await page.context().clearCookies();
  await login(page, '05321000012');
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();
  await page.goto('/islem-gecmisi');
  await expect(page.getByRole('heading', { name: 'İşlem geçmişi' })).toBeVisible();
  await page.goto('/banka-hareketleri');
  await expect(page).not.toHaveURL(/banka-hareketleri/);
});
