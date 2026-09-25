import { expect, type Page, test } from '@playwright/test';

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

async function pick(page: Page, trigger: string, option: string) {
  await page.locator(trigger).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

const todayName = new Date().toLocaleDateString('tr-TR', {
  weekday: 'long',
  timeZone: 'Europe/Istanbul',
});

test('yönetici çalışan ekler, vardiya ve görev planlar, maaş öder ve raporu görür', async ({
  page,
}, info) => {
  const suffix = `${info.project.name === 'masaustu' ? 'M' : 'T'}${String(Date.now()).slice(-4)}`;
  const name = `Deniz${suffix} Tekin`;
  await login(page, 'yonetici@ornek.com');
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();

  await page.goto('/calisanlar');
  await expect(page.getByRole('heading', { name: 'Çalışanlar' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Çalışan ekle' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#emp-first').fill(`Deniz${suffix}`);
  await dialog.locator('#emp-last').fill('Tekin');
  await pick(page, '#emp-role', 'Güvenlik');
  await dialog.locator('#emp-phone').fill('0533 200 00 00');
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();

  await page.getByRole('button', { name: 'Görev ver' }).click();
  const taskDialog = page.getByRole('dialog');
  await taskDialog.locator('#task-title').fill(`Kapı kontrolü ${suffix}`);
  await taskDialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Görev eklendi')).toBeVisible();
  await expect(page.getByText(`Kapı kontrolü ${suffix}`)).toBeVisible();

  await page.getByRole('button', { name: 'Ödeme yap' }).click();
  const payDialog = page.getByRole('dialog');
  await expect(payDialog.locator('#tx-category')).toHaveText('Personel');
  await expect(payDialog.locator('#tx-visible')).not.toBeChecked();
  await payDialog.locator('#tx-amount').fill('5.000');
  await payDialog.locator('#tx-desc').fill('Eylül maaşı');
  await payDialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText(/Gider kaydedildi/)).toBeVisible();
  await expect(page.getByText('Ödemeler · ₺5.000,00')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: info.outputPath('calisan.png'), fullPage: true });

  await page.goto('/vardiyalar');
  await expect(page.getByRole('heading', { name: 'Vardiya planı' })).toBeVisible();
  await page.getByRole('button', { name: 'Vardiya ekle', exact: true }).click();
  await pick(page, '#shift-employee', name);
  await page.getByRole('dialog').getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Vardiya eklendi')).toBeVisible();
  await expect(page.getByText(name).filter({ visible: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Vardiya ekle', exact: true }).click();
  await pick(page, '#shift-employee', name);
  await page.getByRole('dialog').locator('#shift-start').fill('12:00');
  await page.getByRole('dialog').locator('#shift-end').fill('20:00');
  await page.getByRole('dialog').getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText(/aynı saatlerde başka vardiyası var/)).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Önceki haftayı kopyala' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Kopyala' }).click();
  await expect(page.getByText(/vardiya kopyalandı/)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: info.outputPath('vardiya.png'), fullPage: true });

  await page.goto('/gorevler');
  await page.getByText(`Kapı kontrolü ${suffix}`).filter({ visible: true }).first().click();
  await expect(page.getByRole('heading', { name: `Kapı kontrolü ${suffix}` })).toBeVisible();
  await page.getByRole('button', { name: 'Başlat', exact: true }).click();
  await expect(page.getByText('Görev başlatıldı')).toBeVisible();
  await page.getByRole('button', { name: 'Tamamla', exact: true }).click();
  await page.getByRole('dialog').locator('#task-status-note').fill('Kilit yağlandı');
  await page.getByRole('dialog').getByRole('button', { name: 'Görevi tamamla' }).click();
  await expect(page.getByText('Durum: Tamamlandı')).toBeVisible();
  await expect(page.getByText('Kilit yağlandı')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Yeniden aç' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: info.outputPath('gorev.png'), fullPage: true });

  await page.goto('/tekrarlayan-gorevler');
  await page.getByRole('button', { name: 'Tekrarlayan görev ekle' }).click();
  const recurring = page.getByRole('dialog');
  await recurring.locator('#rec-title').fill(`Çöp toplama ${suffix}`);
  await pick(page, '#rec-employee', name);
  await recurring.getByRole('button', { name: todayName, exact: true }).click();
  await expect(recurring.getByText(`Her ${todayName.toLocaleLowerCase('tr')}`)).toBeVisible();
  await recurring.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('bugünün görevi oluşturuldu')).toBeVisible();
  await expect(page.getByText(`Çöp toplama ${suffix}`)).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.goto('/gorevler');
  await expect(page.getByText(`Çöp toplama ${suffix}`).filter({ visible: true })).toBeVisible();

  await page.goto('/calisan-raporu');
  await expect(page.getByRole('heading', { name: 'Çalışan raporu' })).toBeVisible();
  await expect(page.getByText(name).filter({ visible: true })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: info.outputPath('rapor.png'), fullPage: true });
});

test('sakin çalışan sayfalarına erişemez', async ({ page }) => {
  await login(page, '05321000000');
  await expect(page.getByRole('heading', { name: 'Dairem' })).toBeVisible();
  await page.goto('/gorevler');
  await expect(page.getByRole('heading', { name: 'Dairem' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Çalışanlar' })).toHaveCount(0);
});
