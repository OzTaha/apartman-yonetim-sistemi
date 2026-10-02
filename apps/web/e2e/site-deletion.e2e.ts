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

test('sistem yöneticisi siteyi verilerini indirip şifresiyle siler ve geri getirir', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const name = `Silinecek ${info.project.name === 'masaustu' ? 'M' : 'T'}${String(Date.now()).slice(-5)}`;
  await login(page, 'admin@ornek.com');
  await expect(page).not.toHaveURL(/giris/, { timeout: 20_000 });
  await page.goto('/siteler');
  await page.getByRole('button', { name: 'Ekle' }).click();
  const form = page.getByRole('dialog');
  await form.locator('#site-name').fill(name);
  await form.getByRole('button', { name: 'Kaydet' }).click();
  const siteCard = () =>
    page
      .locator('[data-slot="card"]')
      .filter({ has: page.locator('[data-slot="card-title"]', { hasText: name }) });
  const card = siteCard();
  await expect(card).toBeVisible();

  await card.getByRole('button', { name: `${name} için işlemler` }).click();
  await page.getByRole('menuitem', { name: 'Sil' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/30 gün boyunca/)).toBeVisible();

  const [file] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Verileri Excel olarak indir' }).click(),
  ]);
  expect(file.suggestedFilename()).toMatch(new RegExp(`^${name} veriler .*\\.xlsx$`));

  const submit = dialog.getByRole('button', { name: 'Evet, sil' });
  await expect(submit).toBeDisabled();
  await dialog.locator('#delete-confirm').fill(name);
  await dialog.locator('#delete-identifier').fill('admin@ornek.com');
  await dialog.locator('#delete-password').fill('yanlis-sifre');
  await submit.click();
  await expect(page.getByText('Kullanıcı adı veya şifre hatalı')).toBeVisible();

  await dialog.locator('#delete-password').fill('Deneme123!');
  await submit.click();
  await expect(page.getByText(`${name} silindi.`)).toBeVisible();
  await expect(card).toHaveCount(0);

  const deleted = page.locator('li', { hasText: name });
  await expect(deleted.getByText(/gün sonra kalıcı silinecek/)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: info.outputPath('silinenler.png'), fullPage: true });

  await deleted.getByRole('button', { name: 'Geri getir' }).click();
  await expect(page.getByText(`${name} geri getirildi`)).toBeVisible();
  await expect(siteCard()).toBeVisible();
});
