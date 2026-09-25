import { expect, type Page, test } from '@playwright/test';

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'sayfa yatay olarak taşıyor').toBeLessThanOrEqual(1);
}

const monthNames = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

test('aidat oluşturulur, ödeme alınır, tabloda ödendi görünür ve ekstre iner', async ({ page }) => {
  const suffix = String(Date.now()).slice(-5);
  const blockName = `P${suffix}`;
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
  const periodText = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

  await page.goto('/giris');
  await page.locator('#identifier').fill('yonetici@ornek.com');
  await page.locator('#password').fill('Deneme123!');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('heading', { name: 'Daireler' })).toBeVisible();

  await page.getByRole('button', { name: 'Bloklar' }).click();
  await page.getByRole('dialog').locator('#block-name').fill(blockName);
  await page.getByRole('dialog').getByRole('button', { name: 'Ekle' }).click();
  await expect(page.getByText('Blok eklendi')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Daire ekle' }).click();
  const unitDialog = page.getByRole('dialog');
  await unitDialog.getByRole('combobox').click();
  await page.getByRole('option', { name: `${blockName} Blok` }).click();
  await unitDialog.locator('#unit-number').fill('1');
  await unitDialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Daire eklendi')).toBeVisible();

  await page.goto('/aidat-ayarlari');
  await expect(page.getByText('Şu an geçerli')).toBeVisible();
  await page.locator('#plan-amount').fill('1.750');
  await expect(page.getByText(/daire için aylık toplam/)).toBeVisible();
  await page.locator('#plan-amount').fill('');
  await page.getByRole('button', { name: 'Oluştur' }).click();
  await expect(page.getByText(new RegExp(`${periodText}: [0-9]+ daireye toplam`))).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.goto('/aidat');
  await page.getByRole('combobox', { name: 'Blok filtresi' }).click();
  await page.getByRole('option', { name: `${blockName} Blok` }).click();
  const row = page.getByRole('row', { name: new RegExp(`^${blockName}-1`) });
  await expect(
    row.getByRole('img', { name: new RegExp(`^${periodText}: (Gecikmiş|Vadesi gelmedi)`) }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);

  await row.getByRole('rowheader').click();
  await expect(page.getByRole('heading', { name: `${blockName} Blok · Daire 1` })).toBeVisible();
  await expect(page.getByText(`Aidat · ${periodText}`)).toBeVisible();
  await page.getByRole('button', { name: 'Ödeme al' }).click();
  const payDialog = page.getByRole('dialog');
  await payDialog.getByRole('button', { name: 'Tümü' }).click();
  await expect(payDialog.getByText('Bu ödeme şu borçları kapatır:')).toBeVisible();
  await payDialog.locator('#pay-amount').fill('999999');
  await expect(payDialog.getByText(/açık borcundan fazla/)).toBeVisible();
  await expect(payDialog.getByRole('button', { name: /kaydet$/ })).toBeDisabled();
  await payDialog.getByRole('button', { name: 'Tümü' }).click();
  await payDialog.getByRole('button', { name: /kaydet$/ }).click();
  await expect(page.getByText(/ödeme kaydedildi/)).toBeVisible();
  await expect(page.getByText('Bu dairenin açık borcu yok.')).toBeVisible();

  await page.getByRole('button', { name: 'Ekstre' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'PDF indir' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    /^ekstre-.+-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.pdf$/,
  );

  await page.goto('/aidat');
  await page.getByRole('combobox', { name: 'Blok filtresi' }).click();
  await page.getByRole('option', { name: `${blockName} Blok` }).click();
  await expect(
    page
      .getByRole('row', { name: new RegExp(`^${blockName}-1`) })
      .getByRole('img', { name: new RegExp(`^${periodText}: Ödendi`) }),
  ).toBeVisible();
});
