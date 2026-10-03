import { expect, type Page, test } from './fixtures';

const HOUR = 60 * 60 * 1000;

async function login(page: Page, identifier: string) {
  await page.goto('/giris');
  await page.locator('#identifier').fill(identifier);
  await page.locator('#password').fill('Deneme123!');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).not.toHaveURL(/giris/, { timeout: 20_000 });
}

async function idleFor(page: Page, ms: number) {
  await page.evaluate((value) => {
    localStorage.setItem('apartman.lastActivity', String(Date.now() - value));
    document.dispatchEvent(new Event('visibilitychange'));
  }, ms);
}

test('yönetici uzun süre işlem yapmazsa önce uyarılır, sonra oturumu kapanır', async ({ page }) => {
  await login(page, 'yonetici@ornek.com');
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();

  await idleFor(page, 3 * HOUR - 2 * 60 * 1000);
  const warning = page.getByRole('alertdialog', { name: 'Hâlâ burada mısınız?' });
  await expect(warning).toBeVisible();
  await warning.getByRole('button', { name: 'Devam et' }).click();
  await expect(warning).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();

  await idleFor(page, 3 * HOUR + 60 * 1000);
  await expect(page).toHaveURL(/\/giris\?neden=hareketsizlik/, { timeout: 15_000 });
  await expect(page.getByText('Uzun süre işlem yapılmadığı için')).toBeVisible();
  await page.goto('/panel');
  await expect(page.getByRole('button', { name: 'Giriş yap' })).toBeVisible();
});

test('sakin uzun süre işlem yapmasa da oturumu açık kalır', async ({ page }) => {
  await login(page, '05321000000');
  await expect(page.getByText('Ödenecek borcunuz')).toBeVisible();
  await idleFor(page, 5 * HOUR);
  await page.waitForTimeout(1500);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page).not.toHaveURL(/giris/);
});
