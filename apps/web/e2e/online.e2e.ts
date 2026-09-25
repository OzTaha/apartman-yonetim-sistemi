import { expect, type APIRequestContext, type Page, test } from '@playwright/test';

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

async function addDebtForResident(request: APIRequestContext, amountKurus: number) {
  const auth = await request.post('/api/auth/login', {
    data: { identifier: 'yonetici@ornek.com', password: 'Deneme123!' },
  });
  const token = (await auth.json()).accessToken as string;
  const me = await (
    await request.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
  ).json();
  const siteId = me.memberships.find((m: { siteName: string }) => m.siteName === 'Örnek Apartmanı')
    .siteId as string;
  const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': siteId };
  const units = await (await request.get('/api/units', { headers })).json();
  const unit = units.find((u: { number: string }) => u.number === '1');
  const types = await (await request.get('/api/charge-types', { headers })).json();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(
    new Date(),
  );
  const res = await request.post('/api/charges', {
    headers,
    data: {
      chargeTypeId: types[0].id,
      scope: 'SELECTED',
      unitIds: [unit.id],
      amountMode: 'PER_UNIT',
      amountKurus,
      issueDate: today,
      dueDate: today,
      description: 'Online ödeme testi',
    },
  });
  expect(res.status()).toBe(201);
}

test('sakin borcunu online öder, başarısız denemede borç açık kalır', async ({
  page,
  request,
}, info) => {
  await addDebtForResident(request, 12_345);
  await login(page, '05321000000');
  await expect(page.getByRole('heading', { name: 'Dairem' })).toBeVisible();

  await page.getByRole('button', { name: 'Online öde' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Test modu: gerçek ödeme alınmaz.')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await dialog.getByRole('button', { name: 'Ödemeye geç' }).click();
  await expect(page.getByText('Test ödeme sayfası')).toBeVisible();
  await page.getByRole('button', { name: 'Ödeme başarısız olsun' }).click();
  await expect(page.getByText('Ödeme başarısız', { exact: true })).toBeVisible();
  await expect(page.getByText('Kart reddedildi')).toBeVisible();
  await page.getByRole('link', { name: 'Tekrar dene' }).click();

  await expect(page.getByRole('heading', { name: 'Dairem' })).toBeVisible();
  await page.getByRole('button', { name: 'Online öde' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ödemeye geç' }).click();
  await page.getByRole('button', { name: 'Ödemeyi onayla' }).click();
  await expect(page.getByText('Ödendi', { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: info.outputPath('odeme-sonuc.png'), fullPage: true });

  const [receipt] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Makbuzu indir' }).click(),
  ]);
  expect(receipt.suggestedFilename()).toMatch(/^makbuz-\d+-1\.pdf$/);

  await page.getByRole('link', { name: "Dairem'e dön" }).click();
  await expect(page.getByText('Ödenmemiş borcunuz yok.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Online öde' })).toHaveCount(0);
});

test('yönetici online ödeme ayarını görür', async ({ page }) => {
  await login(page, 'yonetici@ornek.com');
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();
  await page.goto('/aidat-ayarlari');
  await expect(page.getByText('Online ödeme', { exact: true })).toBeVisible();
  await expect(page.getByText(/Test modu: sakinler test ödeme sayfasına/)).toBeVisible();
  await expectNoHorizontalScroll(page);
});
