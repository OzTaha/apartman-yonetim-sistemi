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

test('yönetici duyuru yayınlar, SMS ile bildirir, borçlulara hatırlatma gönderir', async ({
  page,
}, info) => {
  const suffix = `${info.project.name === 'masaustu' ? 'M' : 'T'}${String(Date.now()).slice(-4)}`;
  await login(page, 'yonetici@ornek.com');
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();
  await expect(page.getByText('Son duyurular')).toBeVisible();

  await page.goto('/duyurular');
  await expect(page.getByRole('heading', { name: 'Duyurular' })).toBeVisible();
  await page.getByRole('button', { name: 'Duyuru yayınla' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#ann-title').fill(`Bahçe düzenlemesi ${suffix}`);
  await dialog.locator('#ann-body').fill('Cumartesi günü bahçe ilaçlanacaktır.');
  await dialog.locator('#ann-pinned').click();
  await dialog.locator('#ann-notify').click();
  await expect(dialog.getByText(/karakter · 1 SMS|karakter · 2 SMS/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Yayınla' }).click();
  await expect(page.getByText('Duyuru yayınlandı, mesajlar gönderiliyor')).toBeVisible();
  await expect(page.getByRole('heading', { name: `Bahçe düzenlemesi ${suffix}` })).toBeVisible();
  await expect(page.getByText(/Okuyanlar \(0\//)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: info.outputPath('duyuru.png'), fullPage: true });

  await page.getByRole('link', { name: 'Gönderilen mesajlar' }).click();
  await expect(page.getByText(/[1-9]\d* gönderildi/).first()).toBeVisible();
  await expect(page.getByText('Gönderildi').filter({ visible: true }).first()).toBeVisible();

  await page.goto('/mesajlar/yeni');
  await expect(page.getByRole('heading', { name: 'Mesaj gönder' })).toBeVisible();
  await expect(page.locator('#msg-target')).toHaveText('Gecikmiş borcu olan daireler');
  await page.getByRole('button', { name: '{borc}' }).click();
  await expect(page.locator('#msg-body')).toHaveValue(/Yönetimi\{borc\}$/);
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Devam' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByText(/kişiye SMS gönderilsin mi\?/)).toBeVisible();
  await expect(confirm.getByText(/Örnek:/)).toBeVisible();
  await confirm.getByRole('button', { name: 'Gönder' }).click();
  await expect(page.getByText(/mesaj gönderiliyor/)).toBeVisible();
  await expect(page.getByText('Aidat hatırlatması').first()).toBeVisible();
  await expect(page.getByText('Gönderildi').filter({ visible: true }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: info.outputPath('mesaj.png'), fullPage: true });

  await page.goto('/mesaj-ayarlari');
  await page.locator('#rem-enabled').click();
  await page.locator('#rem-days').fill('5');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Otomatik hatırlatma ayarı kaydedildi')).toBeVisible();
  await page.reload();
  await expect(page.locator('#rem-days')).toHaveValue('5');
  await expect(page.getByText('Aidat hatırlatması').first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.goto('/mesajlar');
  await expect(
    page.getByText('Duyuru', { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
});

test('sakin okunmamış duyuruyu görür, açınca okundu olur', async ({ page }, info) => {
  await login(page, '05321000000');
  await expect(page.getByRole('heading', { name: 'Dairem' })).toBeVisible();
  await expect(page.getByText(/okunmamış duyuru/)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Oku' }).click();
  await expect(page.getByRole('heading', { name: 'Duyurular' })).toBeVisible();

  const item = page.getByRole('button', { name: /Asansör bakımı/ });
  await item.click();
  await expect(item).toHaveAttribute('aria-expanded', 'true');
  await expect(item.getByText('Yeni')).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: info.outputPath('sakin-duyuru.png'), fullPage: true });
});
