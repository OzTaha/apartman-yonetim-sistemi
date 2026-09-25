import { expect, type Page, test } from '@playwright/test';

const MANAGER = { identifier: 'yonetici@ornek.com', password: 'Deneme123!' };

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'sayfa yatay olarak taşıyor').toBeLessThanOrEqual(1);
}

async function chooseOption(page: Page, trigger: ReturnType<Page['getByRole']>, option: string) {
  await trigger.click();
  await page.getByRole('option', { name: option }).click();
}

test('yönetici blok ve daire ekler, sakin davetle hesap açıp dairesini görür', async ({
  page,
  browser,
}) => {
  const suffix = String(Date.now()).slice(-5);
  const blockName = `T${suffix}`;
  const phone = `0544${suffix}${String(Math.floor(Math.random() * 90) + 10)}`;

  await page.goto('/giris');
  await page.locator('#identifier').fill(MANAGER.identifier);
  await page.locator('#password').fill(MANAGER.password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();
  await page.goto('/daireler');
  await expect(page.getByRole('heading', { name: 'Daireler' })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: 'Bloklar' }).click();
  const blocksDialog = page.getByRole('dialog');
  await blocksDialog.locator('#block-name').fill(blockName);
  await blocksDialog.getByRole('button', { name: 'Ekle' }).click();
  await expect(page.getByText('Blok eklendi')).toBeVisible();
  await expect(blocksDialog.getByText(`${blockName} Blok`)).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Toplu ekle' }).click();
  const bulkDialog = page.getByRole('dialog');
  await chooseOption(page, bulkDialog.getByRole('combobox'), `${blockName} Blok`);
  await bulkDialog.locator('#bulk-start').fill('1');
  await bulkDialog.locator('#bulk-end').fill('4');
  await bulkDialog.locator('#bulk-per-floor').fill('2');
  await expect(
    bulkDialog.getByText(`${blockName} Blok için 1–4 arası 4 daire oluşturulacak, son kat 2.`),
  ).toBeVisible();
  await bulkDialog.getByRole('button', { name: 'Daireleri oluştur' }).click();
  await expect(page.getByText('4 daire oluşturuldu')).toBeVisible();

  await chooseOption(
    page,
    page.getByRole('combobox', { name: 'Blok filtresi' }),
    `${blockName} Blok (4)`,
  );
  await page
    .getByText(new RegExp(`^${blockName} Blok · (Daire )?1$`))
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: `${blockName} Blok · Daire 1` })).toBeVisible();
  await expect(page.getByText('Bu daire şu an boş')).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: 'Sakin ekle' }).click();
  const residentDialog = page.getByRole('dialog');
  await residentDialog.locator('#occ-first').fill('Deneme');
  await residentDialog.locator('#occ-last').fill(`Sakin${suffix}`);
  await residentDialog.locator('#occ-phone').fill(phone);
  await residentDialog.locator('#occ-consent').click();
  await residentDialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Sakin eklendi')).toBeVisible();
  await expect(page.getByText(`Deneme Sakin${suffix}`)).toBeVisible();

  await page.getByRole('button', { name: `Deneme Sakin${suffix} için işlemler` }).click();
  await page.getByRole('menuitem', { name: 'Davet bağlantısı oluştur' }).click();
  await page.getByRole('button', { name: 'Bağlantı oluştur' }).click();
  const inviteUrl = await page.getByRole('textbox', { name: 'Davet bağlantısı' }).inputValue();
  expect(inviteUrl).toMatch(/\/davet\/[\w-]{20,}$/);

  const residentContext = await browser.newContext({
    viewport: page.viewportSize() ?? undefined,
    locale: 'tr-TR',
  });
  const residentPage = await residentContext.newPage();
  await residentPage.goto(new URL(inviteUrl).pathname);
  await expect(residentPage.getByText(`${blockName} Blok · Daire 1`)).toBeVisible();
  await residentPage.locator('#password').fill('SakinSifre123');
  await residentPage.locator('#confirm').fill('SakinSifre123');
  await residentPage.getByRole('button', { name: 'Hesabımı oluştur' }).click();

  await expect(residentPage.getByRole('heading', { name: 'Dairem' })).toBeVisible();
  await expect(residentPage.getByText(`${blockName} Blok · Daire 1`)).toBeVisible();
  await residentPage.goto('/daireler');
  await expect(residentPage.getByRole('heading', { name: 'Dairem' })).toBeVisible();
  await expectNoHorizontalScroll(residentPage);
  await residentContext.close();

  await page.goto(new URL(inviteUrl).pathname);
  await expect(page.getByText('Bu davet bağlantısı zaten kullanılmış')).toBeVisible();
});
