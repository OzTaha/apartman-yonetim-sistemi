import { expect, test } from '@playwright/test';

test('girişte boşluk yazılamaz; çıkış yapınca giriş ekranı açılır ve oturum geri gelmez', async ({
  page,
}) => {
  await page.goto('/giris');
  await page.locator('#identifier').pressSequentially(' yonetici @ornek.com ');
  await expect(page.locator('#identifier')).toHaveValue('yonetici@ornek.com');
  await page.locator('#password').fill('Deneme123!');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();

  const menu = page.getByRole('button', { name: 'Kullanıcı menüsü' });
  if (!(await menu.isVisible()))
    await page.getByRole('button', { name: 'Menüyü aç/kapat' }).click();
  await menu.click();
  await page.getByRole('menuitem', { name: 'Çıkış yap' }).click();
  await expect(page).toHaveURL(/\/giris/);
  await expect(page.getByRole('button', { name: 'Giriş yap' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Giriş yap' })).toBeVisible();
});

test('sayfa yenilenince oturum sürer; oturum geçersizleşince tek denemeyle giriş ekranı açılır', async ({
  page,
}) => {
  await page.goto('/giris');
  await page.locator('#identifier').fill('yonetici@ornek.com');
  await page.locator('#password').fill('Deneme123!');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible({ timeout: 20_000 });

  for (let i = 0; i < 3; i++) {
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible({ timeout: 15_000 });
  }

  let refreshCalls = 0;
  await page.route('**/api/**', (route) => {
    if (route.request().url().includes('/api/auth/refresh')) refreshCalls++;
    return route.fulfill({ status: 401, json: { message: 'Oturum geçersiz' } });
  });
  const link = page.getByRole('link', { name: 'Daireler' }).first();
  try {
    if (!(await link.isVisible()))
      await page.getByRole('button', { name: 'Menüyü aç/kapat' }).click({ timeout: 2000 });
    await link.click({ timeout: 2000 });
  } catch {
    // Arka plandaki bir istek oturumu daha önce düşürmüş olabilir.
  }
  await expect(page.getByRole('button', { name: 'Giriş yap' })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(3000);
  expect(refreshCalls).toBe(1);
  await expect(page).toHaveURL(/\/giris/);
});
