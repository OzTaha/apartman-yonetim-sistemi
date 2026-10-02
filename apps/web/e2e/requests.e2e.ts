import { expect, type Page, test } from './fixtures';

async function login(page: Page, identifier: string) {
  await page.goto('/giris');
  await page.locator('#identifier').fill(identifier);
  await page.locator('#password').fill('Deneme123!');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}

async function pick(page: Page, trigger: string, option: string) {
  await page.locator(trigger).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'sayfa yatay olarak taşıyor').toBeLessThanOrEqual(1);
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test('sakin fotoğraflı talep açar, yönetici görev verir, görev bitince talep çözülür', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const title = `Kapı zili çalmıyor ${info.project.name === 'masaustu' ? 'M' : 'T'}${String(Date.now()).slice(-5)}`;

  await login(page, '05321000000');
  await expect(
    page.getByRole('heading', { name: /^(Günaydın|İyi günler|İyi akşamlar), / }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Arıza bildir' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Arıza / talep bildir' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Gönder' }).click();
  await expect(dialog.getByText('Kategori seçin')).toBeVisible();
  await pick(page, '#request-category', 'Arıza');
  await dialog.locator('#request-title').fill(title);
  await dialog.locator('#request-description').fill('Zile basınca ses gelmiyor.');
  await dialog.locator('#request-photos').setInputFiles({
    name: 'zil.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(dialog.getByRole('img', { name: 'zil.png' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Gönder' }).click();
  await expect(page.getByText(/Talebiniz iletildi/)).toBeVisible();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('Yeni', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'zil.png' })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.context().clearCookies();
  await login(page, 'yonetici@ornek.com');
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();
  await page.goto('/bildirimler');
  const card = page.locator('[data-slot="card"]', { hasText: title });
  await expect(card.getByText('Yeni arıza talebi')).toBeVisible();
  await card.getByRole('button', { name: 'Talebi aç' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByRole('img', { name: 'zil.png' })).toBeVisible();

  await page.getByLabel('Sakine yanıt').fill('Elektrikçi yarın gelecek.');
  await page.getByRole('button', { name: 'Yanıt gönder' }).click();
  await expect(page.getByText('Elektrikçi yarın gelecek.')).toBeVisible();

  await page.getByRole('button', { name: 'Görev oluştur' }).click();
  await pick(page, '#request-task-priority', 'Acil');
  await page.getByRole('dialog').getByRole('button', { name: 'Görev oluştur' }).click();
  await expect(page.getByText('Görev oluşturuldu')).toBeVisible();
  await expect(page.getByText('İşlemde', { exact: true }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole('link', { name: 'Göreve git' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(title) })).toBeVisible();
  await page.getByRole('button', { name: 'Tamamla' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Görevi tamamla' }).click();
  await expect(page.getByText('Görev: Tamamlandı')).toBeVisible();
  await page.getByRole('link', { name: /Talep #\d+/ }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('Çözüldü', { exact: true }).first()).toBeVisible();

  await page.context().clearCookies();
  await login(page, '05321000000');
  await expect(
    page.getByRole('heading', { name: /^(Günaydın|İyi günler|İyi akşamlar), / }),
  ).toBeVisible();
  await page.goto('/taleplerim');
  const mine = page.locator('[data-slot="card"]', { hasText: title });
  await expect(mine.getByText('Yeni yanıt var')).toBeVisible();
  await expect(mine.getByText('Çözüldü')).toBeVisible();
  await mine.click();
  await expect(page.getByText('Elektrikçi yarın gelecek.')).toBeVisible();
  await expect(page.getByText('Yönetim').first()).toBeVisible();
  await expect(page.getByText(/Talep kapandı/)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: info.outputPath('talep.png'), fullPage: true });

  await page.goto('/talepler');
  await expect(page).not.toHaveURL(/talepler/);
});
