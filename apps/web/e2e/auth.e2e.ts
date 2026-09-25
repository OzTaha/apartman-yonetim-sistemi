import { expect, test } from '@playwright/test';

test('girişte boşluk yazılamaz; çıkış yapınca giriş ekranı açılır ve oturum geri gelmez', async ({
  page,
}) => {
  await page.goto('/giris');
  await page.locator('#identifier').pressSequentially(' yonetici @ornek.com ');
  await expect(page.locator('#identifier')).toHaveValue('yonetici@ornek.com');
  await page.locator('#password').fill('Deneme123!');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('heading', { name: 'Daireler' })).toBeVisible();

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
