# Teslim ve kullanım rehberi

Bu rehber, apartman veya site yönetimi için hazırlanmıştır. Sistem size ait sunucuda çalışır; veriler yalnızca bu
sunucuda ve sizin belirlediğiniz yedek deposunda tutulur.

## Size teslim edilenler

- Sistemin adresi (ör. `https://yonetim.ornekapartman.com`) ve sistem yöneticisi hesabı
- Sunucu erişim bilgileri ve sunucu ayar dosyasının (`.env`) bir kopyası. Bu dosyada veritabanı ve oturum anahtarları
  bulunur; şifre kasasında saklayın, kimseyle paylaşmayın.
- Varsa yedek deposu, ödeme kuruluşu ve SMS sağlayıcısı hesapları (hepsi sizin adınıza açılmıştır)

İlk girişte sistem yöneticisi şifrenizi değiştirin (sağ alttaki kullanıcı menüsü > Şifre değiştir).

## Roller

| Rol               | Neler yapabilir                                                                         |
| ----------------- | --------------------------------------------------------------------------------------- |
| Sistem yöneticisi | Apartman ve siteleri oluşturur, yöneticileri atar, uygulama adını ve logoyu değiştirir  |
| Site yöneticisi   | Daireler, sakinler, aidat, tahsilat, kasa, çalışanlar, duyurular ve mesajları yönetir   |
| Sakin             | Kendi borçlarını, ödemelerini, makbuzlarını, duyuruları ve giderleri görür; online öder |

## İlk adımlar

1. **Daireler:** Daireler sayfasından "Toplu ekle" ile daireleri oluşturun (sitelerde önce bloklar eklenir).
2. **Sakinler:** Her dairenin sayfasından malik veya kiracıyı ekleyin. Telefon ve iletişim onayı SMS için gereklidir.
3. **Davet:** Sakinin yanındaki menüden "Davet bağlantısı oluştur" ile bağlantı üretip sakine iletin; sakin kendi
   şifresini belirleyerek portala girer.
4. **Aidat:** Aidat ayarlarından aylık tutarı ve son ödeme gününü girin. Aidat her ayın 1'inde kendiliğinden yazılır.
5. **Kasa:** Kasa ayarlarından hesaplarınızın açılış bakiyelerini girin.

## Günlük işler

- **Tahsilat:** Panelde "Ödeme al" ile elden veya havale ödemeleri kaydedilir; makbuz kendiliğinden oluşur.
- **Gider:** Kasa sayfasında "Gider ekle"; faturayı veya fotoğrafını ekleyebilirsiniz.
- **Duyuru:** Duyurular sayfasından tüm sakinlere, bloklara veya seçili dairelere duyuru yayınlanır; kimin okuduğu
  görülür.
- **Mesaj:** Mesajlar sayfasından borç hatırlatması, acil durum veya genel bilgi SMS/WhatsApp ile gönderilir.
  İletişim onayı vermemiş sakinlere mesaj gönderilmez.
- **Çalışanlar:** Vardiya planı, görevler ve tekrarlayan görevler "Çalışan ve görev" menüsündedir.
- **Ay kapanışı:** Gelir-gider raporu sayfasında geçmiş ayı kapatın; kapanan ayın kayıtları değiştirilemez.

Kayıtlar silinmez, iptal edilir. İptal edilen kayıtlar nedeniyle birlikte saklanır.

## Telefona uygulama olarak ekleme

- **Android (Chrome):** Siteyi açın, menüden "Uygulamayı yükle" veya "Ana ekrana ekle"yi seçin.
- **iPhone (Safari):** Siteyi açın, paylaş düğmesine basıp "Ana Ekrana Ekle"yi seçin.

Uygulama internet bağlantısı olmadan açıldığında bağlantı olmadığını bildirir; bağlantı gelince devam eder.

## Şifresini unutanlar

- **Sakin:** Sakinler sayfasında sakinin yanındaki menüden "Şifre yenileme bağlantısı"nı seçin. Bağlantıyı
  kopyalayıp iletebilir ya da SMS/WhatsApp ile gönderebilirsiniz.
- **Site yöneticisi:** Sistem yöneticisi "Apartman ve siteler" sayfasından bağlantı oluşturur.
- **Sistem yöneticisi:** Bağlantı sunucuda oluşturulur; teknik destek alın.

Bağlantı tek kullanımlıktır ve 24 saat geçerlidir. Yeni şifre belirlenince kişinin diğer cihazlardaki oturumları
kapatılır.

## Yedekler

Sistem her gece kendiliğinden yedek alır ve son 14 günü saklar. Dış depo tanımlıysa yedekler oraya da kopyalanır.
Yedeklerin varlığını ayda bir kontrol etmeniz önerilir. Geri yükleme sunucuda yapılır; bunun için teknik destek alın.

## Kişisel veriler

Sistemde sakinlerin ad, telefon ve e-posta bilgileri bulunur. Bu verilerin sorumlusu yönetim olarak sizsiniz.
Sakinlerden iletişim onayı alınmadan SMS/WhatsApp gönderilmez; onay bilgisi sakin kaydında tutulur. Sistem
yöneticisi ve site yöneticisi hesaplarını yalnızca yetkili kişilerle paylaşın.

## Değişiklik ve destek

Yeni özellik, ödeme kuruluşu veya SMS sağlayıcısı bağlantısı ve sürüm güncellemeleri ayrı iş olarak yapılır.
Sunucu, alan adı ve sağlayıcı hesaplarının ücret ve yenilemeleri size aittir.
