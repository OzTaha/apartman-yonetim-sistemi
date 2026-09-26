import { expect, type Page, test } from '@playwright/test';

async function login(page: Page, identifier: string) {
  await page.goto('/giris');
  await page.locator('#identifier').fill(identifier);
  await page.locator('#password').fill('Deneme123!');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}

async function menuLink(page: Page, name: string) {
  const link = page.getByRole('link', { name, exact: true });
  if (!(await link.first().isVisible())) {
    await page.getByRole('button', { name: 'Menüyü aç/kapat' }).click();
  }
  return link.first();
}

async function pick(page: Page, trigger: string, option: string) {
  await page.locator(trigger).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test('yönetici yetkilileri görür; blok yöneticisi kendi bloğunu, denetçi finansı salt okunur yönetir', async ({
  page,
}, info) => {
  const suffix = `${info.project.name === 'masaustu' ? 'M' : 'T'}${String(Date.now()).slice(-4)}`;

  await login(page, 'yonetici@ornek.com');
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();
  await (await menuLink(page, 'Bildirimler')).click();
  await expect(page.getByRole('heading', { name: 'Bildirimler' })).toBeVisible();
  await page.goto('/yetkililer');
  const mehmet = page.locator('[data-slot="card"]', { hasText: 'Mehmet Kaya' });
  await expect(mehmet.getByText('Blok yöneticisi')).toBeVisible();
  await expect(mehmet.getByText('A Blok', { exact: true })).toBeVisible();
  await expect(
    page.locator('[data-slot="card"]', { hasText: 'Elif Arslan' }).getByText('Denetçi'),
  ).toBeVisible();

  await page.context().clearCookies();
  await login(page, '05321000011');
  await expect(page.getByRole('heading', { name: 'Daireler' })).toBeVisible();
  await expect(page.getByText('A Blok · Daire 2').filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText('B Blok · Daire 1').filter({ visible: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Daire ekle' })).toHaveCount(0);

  await page.goto('/kasa');
  await expect(page.getByRole('heading', { name: 'Blok giderleri' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gelir ekle' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Gider ekle' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('#tx-block')).toHaveText('A Blok');
  await dialog.locator('#tx-amount').fill('300');
  await pick(page, '#tx-category', 'Bakım ve onarım');
  await dialog.locator('#tx-desc').fill(`Kapı otomatiği ${suffix}`);
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText(/Gider kaydedildi/)).toBeVisible();
  await expect(page.getByText(`Kapı otomatiği ${suffix}`).filter({ visible: true })).toHaveCount(1);

  await page.goto('/borclar');
  await expect(page.getByRole('heading', { name: 'Borçlar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Borç ekle' })).toHaveCount(0);

  await page.context().clearCookies();
  await login(page, '05321000012');
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ödeme al' })).toHaveCount(0);
  await page.goto('/kasa');
  await expect(page.getByRole('heading', { name: 'Kasa' })).toBeVisible();
  await expect(page.getByText(`Kapı otomatiği ${suffix}`).filter({ visible: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Gider ekle' })).toHaveCount(0);
  await page.goto('/gelir-gider');
  await expect(page.getByRole('heading', { name: 'Gelir-gider raporu' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ayı kapat' })).toHaveCount(0);
  await page.goto('/sakinler');
  await expect(page).not.toHaveURL(/sakinler/);
});
