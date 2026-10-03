import { expect, test } from './fixtures';

test('yönetici görevliye hesap açar; görevli kargo kaydeder ve teslim eder', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120_000);
  const suffix = String(Date.now()).slice(-6);
  const lastName = `${info.project.name === 'masaustu' ? 'M' : 'T'}${suffix}`;
  const phone = `0539${info.project.name === 'masaustu' ? '1' : '2'}${suffix}`;

  await page.goto('/giris');
  await page.locator('#identifier').fill('yonetici@ornek.com');
  await page.locator('#password').fill('Deneme123!');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible({ timeout: 20_000 });

  await page.goto('/calisanlar');
  await page.getByRole('button', { name: 'Çalışan ekle' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#emp-first').fill('Kapıcı');
  await dialog.locator('#emp-last').fill(lastName);
  await dialog.locator('#emp-phone').fill(phone);
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByRole('heading', { name: `Kapıcı ${lastName}` })).toBeVisible();

  await page.getByRole('button', { name: 'Davet bağlantısı oluştur' }).click();
  const link = page.getByLabel('Davet bağlantısı');
  await expect(link).toHaveValue(/\/davet\/[\w-]{20,}$/);
  const inviteUrl = await link.inputValue();
  await page.getByLabel(/Kapı sayfasını kullanabilir/).click();
  await expect(page.getByText('Kaydedildi')).toBeVisible();

  const staffContext = await browser.newContext({
    viewport: page.viewportSize() ?? undefined,
    locale: 'tr-TR',
  });
  const staff = await staffContext.newPage();
  await staff.goto(new URL(inviteUrl).pathname);
  await expect(staff.getByText(/Görevli/).first()).toBeVisible();
  await staff.locator('#password').fill('GorevliSifre123');
  await staff.locator('#confirm').fill('GorevliSifre123');
  await staff.getByRole('button', { name: 'Hesabımı oluştur' }).click();
  await expect(staff.getByRole('heading', { name: 'Merhaba, Kapıcı' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(staff.getByText('Bekleyen işiniz yok')).toBeVisible();

  await staff.getByRole('link', { name: 'Kapı: kargo ve misafir' }).click();
  await staff.getByRole('button', { name: 'Kargo geldi' }).click();
  const pkg = staff.getByRole('dialog');
  await pkg.getByLabel('Daire ara').fill('A Blok · Daire 1');
  await pkg.getByRole('option').first().click();
  await pkg.getByRole('button', { name: 'Aras' }).click();
  await pkg.getByRole('button', { name: 'Kaydet' }).click();
  await expect(staff.getByText('Kargo kaydedildi, sakine bildirim gönderildi')).toBeVisible();

  const row = staff.getByRole('listitem').filter({ hasText: 'A Blok · Daire 1' }).filter({
    hasText: 'Aras',
  });
  await row.first().getByRole('button', { name: 'Teslim et' }).click();
  await staff.getByRole('dialog').getByRole('button', { name: 'Teslim edildi' }).click();
  await expect(staff.getByText('Teslim edildi', { exact: true }).first()).toBeVisible();

  await staff.goto('/islerim');
  await expect(staff.getByRole('link', { name: 'Genel kurul' })).toHaveCount(0);
  const note = `Otoparkta tanımadığım biri ${suffix}`;
  await staff.getByRole('button', { name: 'Yöneticiye yaz' }).click();
  const msg = staff.getByRole('dialog');
  await msg.getByRole('radio', { name: /Şüpheli durum/ }).click();
  await msg.getByLabel('Ne oldu?').fill(note);
  await msg.getByLabel('Acil').click();
  await msg.getByRole('button', { name: 'Gönder' }).click();
  await expect(staff.getByText('Mesajınız yöneticiye iletildi')).toBeVisible();
  await expect(staff.getByRole('list', { name: 'Gönderdiğim mesajlar' })).toContainText(note);

  await page.goto('/talepler');
  const item = page.getByText(note).locator('visible=true').first();
  await expect(item).toBeVisible();
  await item.click();
  await expect(page.getByRole('heading', { name: note })).toBeVisible();
  await expect(page.getByText('Görevliden', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Acil', { exact: true }).first()).toBeVisible();
  await staffContext.close();
});
