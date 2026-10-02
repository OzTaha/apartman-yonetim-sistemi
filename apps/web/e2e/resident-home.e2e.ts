import { expect, test } from './fixtures';

test.use({ showTours: true });

test('sakin ilk girişte turu bir kez görür, borç kartı ve yönetim iletişimi görünür', async ({
  page,
}) => {
  await page.goto('/giris');
  await page.locator('#identifier').fill('05321000000');
  await page.locator('#password').fill('Deneme123!');
  await page.getByRole('button', { name: 'Giriş yap' }).click();

  const tour = page.getByRole('dialog', { name: 'Borcunuz burada' });
  await expect(tour).toBeVisible({ timeout: 20_000 });
  await expect(tour.getByText('1 / 5')).toBeVisible();
  await tour.getByRole('button', { name: 'İleri' }).click();
  await expect(page.getByRole('dialog', { name: 'Sık yapılan işler' })).toBeVisible();
  await page.getByRole('button', { name: 'Atla' }).click();
  await expect(page.getByRole('dialog', { name: 'Sık yapılan işler' })).toBeHidden();

  await expect(page.getByText('Ödenecek borcunuz')).toBeVisible();
  const contacts = page.locator('[data-tour="contacts"]');
  await expect(contacts.getByText('Apartman yöneticisi')).toBeVisible();
  await expect(contacts.getByRole('link', { name: /ara$/ })).toHaveAttribute('href', /^tel:\+90/);

  await page.getByRole('button', { name: 'Ödenecek borç hakkında bilgi' }).click();
  await expect(page.getByText('Dairenizin henüz ödenmemiş aidat')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.reload();
  await expect(page.getByText('Ödenecek borcunuz')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  await expect(page.getByRole('dialog', { name: 'Borcunuz burada' })).toBeHidden();

  const menu = page.getByRole('button', { name: 'Kullanıcı menüsü' });
  if (!(await menu.isVisible()))
    await page.getByRole('button', { name: 'Menüyü aç/kapat' }).click();
  await menu.click();
  await page.getByRole('menuitem', { name: 'Tanıtım turunu göster' }).click();
  await expect(page.getByRole('dialog', { name: 'Borcunuz burada' })).toBeVisible({
    timeout: 10_000,
  });
});
