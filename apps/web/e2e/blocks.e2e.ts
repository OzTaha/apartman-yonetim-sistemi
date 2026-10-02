import { expect, type Page, test } from './fixtures';

async function login(page: Page, identifier: string) {
  await page.goto('/giris');
  await page.locator('#identifier').fill(identifier);
  await page.locator('#password').fill('Deneme123!');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}

async function pick(page: Page, trigger: string, option: string) {
  await page.locator(trigger).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'sayfa yatay olarak taşıyor').toBeLessThanOrEqual(1);
}

test('blok gideri o bloğun dairelerine yansıtılır, toplu borç bloğa yazılır', async ({
  page,
}, info) => {
  const suffix = `${info.project.name === 'masaustu' ? 'M' : 'T'}${String(Date.now()).slice(-4)}`;
  await login(page, 'yonetici@ornek.com');
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();

  await page.goto('/kasa');
  await page.getByRole('button', { name: 'Gider ekle' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#tx-amount').fill('1.000');
  await pick(page, '#tx-category', 'Bakım ve onarım');
  await pick(page, '#tx-block', 'A Blok');
  await dialog.locator('#tx-desc').fill(`Asansör revizyonu ${suffix}`);
  await dialog.getByText('Dairelere borç olarak yansıt').click();
  await pick(page, '#tx-rf-type', 'Yakıt');
  await expect(dialog.getByText('Gider A Blok daireleri arasında paylaştırılıp')).toBeVisible();
  await expect(dialog.getByText('2 daireye ₺500,00 borç yazılır.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(
    page.getByText(/Gider kaydedildi · ₺1\.000,00 · 2 daireye borç yazıldı/),
  ).toBeVisible();

  await pick(page, '#tx-filter-block', 'A Blok');
  await page.getByText(`Asansör revizyonu ${suffix}`).filter({ visible: true }).first().click();
  const details = page.getByRole('dialog');
  await expect(details.getByText('A Blok', { exact: true })).toBeVisible();
  await expect(details.getByText(/2 daire · ₺1\.000,00 · ₺0,00 tahsil edildi/)).toBeVisible();
  await expect(details.getByRole('button', { name: 'Dairelere yansıt' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expectNoHorizontalScroll(page);

  await page.goto('/borclar');
  await page.getByRole('button', { name: 'Borç ekle' }).first().click();
  const charge = page.getByRole('dialog');
  await pick(page, '#ch-type', 'Yakıt');
  await pick(page, '#ch-scope', 'Seçili bloklar');
  await charge.getByLabel('B Blok').click();
  await charge.locator('#ch-amount').fill('250');
  await charge.locator('#ch-desc').fill(`B blok boya ${suffix}`);
  await charge.getByRole('button', { name: 'Borcu yaz' }).click();
  await expect(page.getByText('2 daireye toplam ₺500,00 borç yazıldı')).toBeVisible();

  await page.goto('/gelir-gider');
  const byBlock = page.locator('[data-slot="card"]', { hasText: 'Bloklara göre giderler' });
  await expect(byBlock.getByText('A Blok')).toBeVisible();
  await expect(byBlock.getByText('Site geneli')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: info.outputPath('bloklar.png'), fullPage: true });
});
