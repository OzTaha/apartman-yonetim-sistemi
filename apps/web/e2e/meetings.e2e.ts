import { expect, type Page, test } from './fixtures';

async function login(page: Page, identifier: string) {
  await page.goto('/giris');
  await page.locator('#identifier').fill(identifier);
  await page.locator('#password').fill('Deneme123!');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}

async function switchPlace(page: Page, name: string) {
  const switcher = page.getByRole('button', { name: 'Site değiştir' });
  if (!(await switcher.isVisible())) {
    await page.getByRole('button', { name: 'Menüyü aç/kapat' }).click();
  }
  await switcher.click();
  await page.getByRole('menuitem', { name }).click();
}

async function pick(page: Page, combobox: string, option: string) {
  await page.getByRole('combobox', { name: combobox }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'sayfa yatay olarak taşıyor').toBeLessThanOrEqual(1);
}

function localDate(daysAhead: number) {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(d);
}

test('yönetici genel kurulu planlar, çağırır, hazirun ve kararları girer; sakin kararları görür', async ({
  page,
}, info) => {
  test.setTimeout(150_000);
  const topic = `Çatı onarımı ${info.project.name === 'masaustu' ? 'M' : 'T'}${String(Date.now()).slice(-5)}`;

  await login(page, 'yonetici@ornek.com');
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible({ timeout: 20_000 });
  await switchPlace(page, 'Örnek Sitesi');
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();

  await page.goto('/genel-kurul');
  await expect(page.getByRole('heading', { name: 'Genel kurul' })).toBeVisible();
  await expect(
    page.locator('[data-slot="card"]', { hasText: 'Olağan genel kurul' }).getByText('Yapıldı'),
  ).toBeVisible();
  await expect(
    page.getByText('İşletme projesinin görüşülmesi ve karara bağlanması').filter({ visible: true }),
  ).toHaveCount(1);

  await page.getByRole('button', { name: 'Toplantı planla' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('1. gündem maddesi')).toHaveValue(
    'Açılış ve toplantı başkanının seçimi',
  );
  await pick(page, 'Toplantı türü', 'Olağanüstü genel kurul');
  await dialog.getByLabel('Tarih ve saat').fill(`${localDate(20)}T19:30`);
  await expect(dialog.getByLabel('İkinci toplantı')).toHaveValue(`${localDate(27)}T19:30`);
  await dialog.getByLabel('Yer').fill('Site sosyal tesis salonu');
  await dialog.getByLabel('2. gündem maddesi').fill(topic);
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Toplantı oluşturuldu')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Olağanüstü genel kurul' })).toBeVisible();

  await page.getByRole('button', { name: 'Çağrıyı yayınla' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Yayınla' }).click();
  await expect(page.getByText('Çağrı yayınlandı')).toBeVisible();
  await expect(page.getByRole('button', { name: 'İptal et' })).toBeVisible();

  const selects = page.getByRole('combobox', { name: /katılım$/ });
  const count = await selects.count();
  for (let i = 0; i < count; i++) {
    await selects.nth(i).click();
    await page.getByRole('option', { name: 'Katıldı', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Hazirunu kaydet' }).click();
  await expect(page.getByText('Hazirun kaydedildi')).toBeVisible();
  await expect(page.getByText('Birinci toplantı için yeter sayı sağlandı.')).toBeVisible();

  const decide = async (n: number, result: string, text: string) => {
    await pick(page, `${n}. madde sonucu`, result);
    await page.getByLabel(`${n}. madde karar metni`).fill(text);
    await page
      .getByRole('listitem')
      .filter({ has: page.getByLabel(`${n}. madde karar metni`) })
      .getByRole('button', { name: 'Kararı kaydet' })
      .click();
    await expect(page.getByText(`${n}. madde kaydedildi`)).toBeVisible();
  };
  await decide(1, 'Bilgilendirme', 'Toplantı başkanı seçildi.');
  await pick(page, '2. madde sonucu', 'Kabul edildi');
  await page.getByLabel('2. madde kabul oyu').fill(String(count));
  await page
    .getByLabel('2. madde karar metni')
    .fill('Çatı onarımı için teklif alınmasına karar verildi.');
  await page.getByRole('button', { name: 'Kararı kaydet' }).nth(1).click();
  await expect(page.getByText('2. madde kaydedildi')).toBeVisible();

  await page.getByRole('button', { name: 'Toplantıyı tamamla' }).click();
  await expect(page.getByRole('dialog').locator('#complete-share')).toBeChecked();
  await page.getByRole('dialog').getByRole('button', { name: 'Tamamla' }).click();
  await expect(
    page.getByText(/kararlar deftere işlendi ve duyuru olarak paylaşıldı/),
  ).toBeVisible();
  await expect(page.getByText(/tarihinde yayınlandı/).nth(1)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kararları duyuru olarak paylaş' })).toHaveCount(0);
  await expect(page.getByText(/Karar no \d+/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kararı kaydet' })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: info.outputPath('genel-kurul.png'), fullPage: true });

  const meetingUrl = page.url();
  await page.goto('/duyurular');
  await expect(
    page.getByText('Olağanüstü genel kurul kararları').filter({ visible: true }).first(),
  ).toBeVisible();
  await page.goto(meetingUrl);

  const [minutes] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Tutanak' }).click(),
  ]);
  expect(minutes.suggestedFilename()).toBe(`genel-kurul-tutanagi-${localDate(20)}.pdf`);

  await page.context().clearCookies();
  await login(page, '05321000011');
  await expect(page.getByRole('heading', { name: 'Daireler' })).toBeVisible();
  await page.goto('/genel-kurul');
  const card = page.locator('[data-slot="card"]', { hasText: topic });
  await expect(card.getByText('Kabul edildi')).toBeVisible();
  await expect(card.getByText('Çatı onarımı için teklif alınmasına karar verildi.')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Tutanağı indir' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Toplantı planla' })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});
