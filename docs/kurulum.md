# Müşteri sunucusuna kurulum

Bu rehber, sistemi bir müşteri için sıfırdan kurmayı, güncellemeyi ve yedeklemeyi anlatır. Her müşterinin kendi
sunucusu, kendi alan adı ve kendi gizli anahtarları olur. Teslimden sonra sunucu hiçbir şekilde geliştiricinin
hesaplarına veya bilgisayarına bağlı kalmaz.

## 1. Gereksinimler

- Müşteri adına açılmış bir VPS veya bulut sunucu: Ubuntu 22.04 ya da 24.04, en az 2 vCPU, 4 GB RAM, 40 GB disk.
  Paylaşımlı web hosting paketleri (PHP hosting) yeterli değildir.
- Müşterinin alan adı veya alt alan adı (ör. `yonetim.ornekapartman.com`). DNS'te bu ad için sunucu IP'sini gösteren
  bir `A` kaydı açılmış olmalıdır.
- Sunucuda 80 ve 443 portları dışarıya açık olmalıdır (HTTPS sertifikası 80 portu üzerinden doğrulanır).

Docker Engine ve Compose eklentisini resmi depodan kurun:

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

## 2. Sürüm paketini hazırlama

Geliştirme bilgisayarında, commit edilmiş koddan paket oluşturulur. Paket yalnızca git'teki dosyaları içerir;
`.env` dosyaları ve yerel yüklemeler pakete girmez.

```sh
pnpm release                      # release/apartman-<sürüm>.tar.gz
scp release/apartman-<sürüm>.tar.gz kullanici@sunucu:/tmp/
```

## 3. Kurulum

```sh
sudo tar xzf /tmp/apartman-<sürüm>.tar.gz -C /opt
cd /opt/apartman/deploy
sudo ./install.sh
```

Kurulum betiği şunları sorar: alan adı, sertifika e-postası, uygulama adı, ilk apartman veya sitenin adı ve türü,
sistem yöneticisinin adı, e-postası ve şifresi. Ardından:

- Veritabanı, Redis ve oturum anahtarlarını sunucuda rastgele üretir ve `deploy/.env` dosyasına yazar
  (yalnızca root okuyabilir).
- Uygulamayı derleyip başlatır; veritabanı tabloları API açılırken oluşturulur.
- Sistem yöneticisini, ilk apartman veya siteyi ve uygulama adını kaydeder.
- Her gece 03:30'da yedek alacak zamanlanmış görevi ekler (`/etc/cron.d/apartman-yedek`).

DNS kaydı sunucuyu gösteriyorsa HTTPS sertifikası birkaç dakika içinde otomatik alınır ve süresi dolmadan yenilenir.

Kurulumdan sonra kontrol edin:

```sh
cd /opt/apartman/deploy
sudo docker compose ps           # tüm servisler "healthy" veya "running" olmalı
sudo docker compose logs -f api  # API günlükleri
```

Tarayıcıda `https://<alan-adı>` açılır ve sistem yöneticisi hesabıyla giriş yapılır. Marka ayarları, apartman ve
site yönetimi ile yöneticilerin atanması bu hesaptan yapılır.

## 4. Yedekleme ve geri yükleme

Her gece veritabanı (`db-<zaman>.dump`) ve yüklenen belgeler (`uploads-<zaman>.tar.gz`) `/var/backups/apartman`
klasörüne alınır. 14 günden eski yedekler silinir; süre `.env` içindeki `BACKUP_KEEP_DAYS` ile değiştirilir.

Elle yedek almak için:

```sh
sudo /opt/apartman/deploy/backup.sh
```

**Dış depoya kopya (önerilir):** Müşteri adına S3 uyumlu bir depo (Cloudflare R2, Backblaze B2, AWS S3 vb.) açılır,
yalnızca o kovaya yazabilen bir erişim anahtarı oluşturulur ve `deploy/.env` içine girilir:

```
BACKUP_S3_ENDPOINT=https://<hesap>.r2.cloudflarestorage.com
BACKUP_S3_REGION=auto
BACKUP_S3_BUCKET=apartman-yedek
BACKUP_S3_ACCESS_KEY=...
BACKUP_S3_SECRET_KEY=...
```

Bundan sonra her yedek dış depoya da kopyalanır. Dış depodaki eski yedeklerin silinmesi deponun kendi saklama
kuralıyla (lifecycle) ayarlanır.

**Geri yükleme:** Sistem seçilen yedekteki haline döner; o andaki durum da önce yedeklenir.

```sh
sudo /opt/apartman/deploy/restore.sh                  # mevcut yedekleri listeler
sudo /opt/apartman/deploy/restore.sh 20260926-033000  # onay için EVET yazılır
```

Sunucu tamamen kaybolursa: yeni sunucuya aynı sürüm kurulur (`install.sh`), dış depodaki iki yedek dosyası
`/var/backups/apartman` klasörüne indirilir ve `restore.sh` çalıştırılır. Eski sunucunun `.env` dosyası saklandıysa
kurulumdan önce `deploy/.env` olarak yerine konabilir; bu durumda `install.sh` yerine
`sudo docker compose up -d --build` çalıştırılır.

## 5. Güncelleme

```sh
pnpm release                                            # geliştirme bilgisayarında
scp release/apartman-<yeni-sürüm>.tar.gz kullanici@sunucu:/tmp/
sudo /opt/apartman/deploy/update.sh /tmp/apartman-<yeni-sürüm>.tar.gz
```

Güncelleme önce yedek alır, ardından kodu yeni sürümle değiştirir (`deploy/.env` korunur) ve uygulamayı yeniden
derleyip başlatır. Veritabanı değişiklikleri API açılırken otomatik uygulanır.

## 6. Ödeme ve SMS sağlayıcıları

Kurulumda online ödeme kapalıdır (`PAYMENT_PROVIDER=none`) ve mesajlar gerçekten gönderilmez
(`MESSAGING_PROVIDER=log`, mesajlar yalnızca kayda geçer). Müşteri bir ödeme kuruluşu veya SMS/WhatsApp
sağlayıcısıyla sözleşme yaptığında hesap müşteri adına açılır, o sağlayıcı için bağlantı sınıfı yazılır ve
anahtarları `deploy/.env` dosyasına girilir. Test ödeme sağlayıcısı (`mock`) canlı ortamda çalışmaz.

## 7. Şifresini unutan kullanıcılar

- **Sakin:** Site yöneticisi veya sistem yöneticisi, Sakinler sayfasındaki işlem menüsünden "Şifre yenileme
  bağlantısı" oluşturur; bağlantı kopyalanır ya da SMS/WhatsApp ile gönderilir.
- **Site yöneticisi:** Sistem yöneticisi "Apartman ve siteler" sayfasında yöneticinin adının yanındaki anahtar
  simgesiyle bağlantı oluşturur. Site yöneticileri başka bir yöneticinin şifresini yenileyemez.
- **Sistem yöneticisi:** Sunucuda aşağıdaki komut, e-posta veya telefon numarasıyla bağlantı üretir:

```sh
cd /opt/apartman/deploy
sudo docker compose exec api node dist/cli/reset-password.js yonetici@ornekapartman.com
```

Bağlantılar tek kullanımlıktır ve 24 saat geçerlidir; yenisi üretilince eskisi geçersiz olur. Yeni şifre
belirlenince kullanıcının tüm açık oturumları kapatılır.

## 8. Sorun giderme

| Belirti                              | Kontrol                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| Site açılmıyor, sertifika hatası     | DNS `A` kaydı sunucu IP'sini gösteriyor mu, 80/443 açık mı: `sudo docker compose logs web` |
| Giriş ekranı açılıyor, giriş olmuyor | `sudo docker compose logs api`; `.env` içindeki `DOMAIN` tarayıcıdaki adresle aynı mı      |
| API başlamıyor                       | `sudo docker compose logs api` ilk satırları; eksik ortam değişkeni varsa adıyla yazılır   |
| Disk doluyor                         | `du -sh /var/backups/apartman`; `BACKUP_KEEP_DAYS` düşürülebilir                           |

## 9. Teslim kontrol listesi

- [ ] Sunucu, alan adı, yedek deposu ve varsa ödeme/SMS hesapları müşteri adına ve müşterinin erişiminde.
- [ ] `deploy/.env` dosyasının bir kopyası müşterinin şifre kasasına kaydedildi.
- [ ] Sistem yöneticisi hesabı müşteriye teslim edildi; müşteri şifresini değiştirdi.
- [ ] İlk yedek alındı ve (açıksa) dış depoda görüldü; bir geri yükleme denendi.
- [ ] Geliştiricinin SSH anahtarı ve geçici kullanıcıları sunucudan kaldırıldı.
