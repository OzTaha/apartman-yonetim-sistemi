import { expect, type Page, test } from '@playwright/test';

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'sayfa yatay olarak taşıyor').toBeLessThanOrEqual(1);
}

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

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

test('gider faturasıyla kaydedilir, işe taksit ödenir ve sakin şeffaflık sayfasını görür', async ({
  page,
}, info) => {
  const suffix = `${info.project.name === 'masaustu' ? 'M' : 'T'}${String(Date.now()).slice(-4)}`;
  await login(page, 'yonetici@ornek.com');
  await expect(page.getByRole('heading', { name: 'Daireler' })).toBeVisible();

  await page.goto('/kasa');
  await expect(page.getByText('Nakit kasa').first()).toBeVisible();
  await expect(page.getByText(/Toplam bakiye/)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: info.outputPath('kasa.png'), fullPage: true });

  await page.getByRole('button', { name: 'Gider ekle' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#tx-amount').fill('1.250,50');
  await pick(page, '#tx-category', 'Temizlik');
  await dialog.locator('#tx-desc').fill(`Merdiven temizliği ${suffix}`);
  await dialog.locator('#file-picker').setInputFiles({
    name: `fatura-${suffix}.pdf`,
    mimeType: 'application/pdf',
    buffer: PDF,
  });
  await expect(dialog.getByText(`fatura-${suffix}.pdf`)).toBeVisible();
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText(/Gider kaydedildi/)).toBeVisible();

  await page.getByText(`Merdiven temizliği ${suffix}`).filter({ visible: true }).first().click();
  const details = page.getByRole('dialog');
  await expect(details.getByText(`fatura-${suffix}.pdf`)).toBeVisible();
  await expect(details.getByText('Temizlik')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.goto('/isler');
  await page.getByRole('button', { name: 'İş ekle' }).first().click();
  const workDialog = page.getByRole('dialog');
  await workDialog.locator('#work-title').fill(`Çatı onarımı ${suffix}`);
  await workDialog.locator('#work-agreed').fill('10.000');
  await workDialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByRole('heading', { name: `Çatı onarımı ${suffix}` })).toBeVisible();

  await page.getByRole('button', { name: 'Ödeme ekle' }).click();
  const payDialog = page.getByRole('dialog');
  await payDialog.locator('#tx-amount').fill('4.000');
  await pick(page, '#tx-category', 'Bakım ve onarım');
  await payDialog.locator('#tx-desc').fill('Peşinat');
  await payDialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText(/Kalan ₺6\.000,00/)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: info.outputPath('is.png'), fullPage: true });

  const longName = `Screenshot 2026-09-25 at 15-07-58 çok uzun bir dosya adı ${'x'.repeat(80)} ${suffix}.pdf`;
  await page.locator('input[type=file]:not(#file-picker)').setInputFiles({
    name: longName,
    mimeType: 'application/pdf',
    buffer: PDF,
  });
  await expect(page.getByText('1 belge yüklendi')).toBeVisible();

  await page.goto('/giderler');
  const workCard = page
    .locator('[data-slot="card"]', { hasText: `Çatı onarımı ${suffix}` })
    .first();
  const card = await workCard.boundingBox();
  const file = await workCard.getByRole('listitem').first().boundingBox();
  expect(file!.x + file!.width).toBeLessThanOrEqual(card!.x + card!.width);
  await expectNoHorizontalScroll(page);

  await page.goto('/gelir-gider');
  await expect(page.getByRole('img', { name: /gelir ve gider grafiği/ })).toBeVisible();
  await expect(page.getByText('Ay kapanışı')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: info.outputPath('rapor.png'), fullPage: true });

  await page.goto('/tahsilatlar');
  await expect(page.getByRole('heading', { name: 'Tahsilatlar' })).toBeVisible();

  await page.context().clearCookies();
  await login(page, '05321000000');
  await expect(page).not.toHaveURL(/giris/);
  await page.goto('/giderler');
  await expect(page.getByRole('heading', { name: 'Giderler ve işler' })).toBeVisible();
  await expect(page.getByText('Dış cephe boyası', { exact: true })).toBeVisible();
  await expect(page.getByText('Aylık asansör bakımı').first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: info.outputPath('giderler.png'), fullPage: true });
});
