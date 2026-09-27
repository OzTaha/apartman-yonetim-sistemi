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

| Rol               | Neler yapabilir                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| Sistem yöneticisi | Apartman ve siteleri oluşturur, yöneticileri atar, uygulama adını ve logoyu değiştirir                           |
| Site yöneticisi   | Daireler, sakinler, aidat, tahsilat, kasa, çalışanlar, talepler, duyuru ve mesajları yönetir                     |
| Blok yöneticisi   | Kendi bloğunun sakinlerini, borç ve tahsilatlarını, giderlerini, taleplerini ve duyurularını yönetir             |
| Denetçi           | Kasa, gelir-gider, borç ve tahsilatları görür; hiçbir kaydı değiştiremez                                         |
| Sakin             | Kendi borçlarını, ödemelerini, makbuzlarını, duyuruları ve giderleri görür; online öder; arıza ve talep bildirir |

## İlk adımlar

1. **Daireler:** Daireler sayfasından "Toplu ekle" ile daireleri oluşturun (sitelerde önce bloklar eklenir).
2. **Sakinler:** Her dairenin sayfasından malik veya kiracıyı ekleyin. Telefon ve iletişim onayı SMS için gereklidir.
3. **Davet:** Sakinin yanındaki menüden "Davet bağlantısı oluştur" ile bağlantı üretip sakine iletin; sakin kendi
   şifresini belirleyerek portala girer.
4. **Aidat:** Aidat ayarlarından aylık tutarı ve son ödeme gününü girin. Aidat her ayın 1'inde kendiliğinden yazılır.
5. **Kasa:** Kasa ayarlarından hesaplarınızın açılış bakiyelerini girin.
6. **Yetkililer (isteğe bağlı):** "Yetkililer" sayfasından blok yöneticisi ve denetçi atayın. Kişinin önce sakin olarak
   eklenmiş ve davet bağlantısıyla hesabını açmış olması gerekir.

## Günlük işler

- **Tahsilat:** Panelde "Ödeme al" ile elden veya havale ödemeleri kaydedilir; makbuz kendiliğinden oluşur.
- **Banka hareketleri:** İnternet bankacılığından indirdiğiniz hesap hareketlerini (Excel veya CSV) "Banka hareketleri"
  sayfasına yükleyin. Gelen havaleler dairelere önerilir; kontrol edip onayladığınızda tahsilat olarak kaydedilir.
- **Borç durum yazısı:** Daire satılırken veya kiracı taşınırken istenen "borcu yoktur" yazısını daire sayfasındaki
  "Borç durum yazısı" ile alın; borç varsa yazı borç dökümünü içerir.
- **İşlem geçmişi:** Kimin hangi kaydı ne zaman değiştirdiğini "İşlem geçmişi" sayfasında görebilirsiniz.
- **Gider:** Kasa sayfasında "Gider ekle"; faturayı veya fotoğrafını ekleyebilirsiniz. Sitelerde giderin "Site geneli"
  mi yoksa bir bloğa mı ait olduğunu seçin; blok giderini yalnızca o bloğun sakinleri görür. "Dairelere borç olarak
  yansıt" ile gider ilgili dairelere borç olarak paylaştırılır.
- **Duyuru:** Duyurular sayfasından tüm sakinlere, bloklara veya seçili dairelere duyuru yayınlanır; kimin okuduğu
  görülür.
- **Mesaj:** Mesajlar sayfasından borç hatırlatması, acil durum veya genel bilgi SMS/WhatsApp ile gönderilir.
  İletişim onayı vermemiş sakinlere mesaj gönderilmez.
- **Arıza ve talepler:** Sakinlerin bildirdiği arızalar "Arıza ve talepler" sayfasına ve bildirimlere düşer. Talebi
  açıp sakine yanıt yazın, "İşleme al", "Çözüldü" veya "Reddet" ile durumunu güncelleyin. "Görev oluştur" ile talebi
  bir çalışana verebilirsiniz; görev tamamlanınca talep de kapanır. Sakinler talep açmak için "Taleplerim" sayfasını
  veya Dairem'deki "Arıza / talep bildir" düğmesini kullanır.
- **Çalışanlar:** Vardiya planı, görevler ve tekrarlayan görevler "Çalışan ve görev" menüsündedir.
- **Ay kapanışı:** Gelir-gider raporu sayfasında geçmiş ayı kapatın; kapanan ayın kayıtları değiştirilemez.

Parasal kayıtlar silinmez, iptal edilir. İptal edilen kayıtlar nedeniyle birlikte saklanır; bakiyelerden ve
toplamlardan düşer. Yanlış girilen sakin kaydı ise sakinin menüsündeki "Kaydı sil" ile silinebilir; daireden taşınan
sakin için "Taşındı olarak işaretle" kullanılır.

## Telefona uygulama olarak ekleme

- **Android (Chrome):** Siteyi açın, menüden "Uygulamayı yükle" veya "Ana ekrana ekle"yi seçin.
- **iPhone (Safari):** Siteyi açın, paylaş düğmesine basıp "Ana Ekrana Ekle"yi seçin.

Uygulama internet bağlantısı olmadan açıldığında bağlantı olmadığını bildirir; bağlantı gelince devam eder.

## Şifresini unutanlar

- **Sakin:** Sakin giriş ekranında "Şifremi unuttum"a basıp telefonunu veya e-postasını yazar; talep yöneticilerin
  bildirimlerine anında düşer (üst çubuktaki zil). Bildirimden ya da Sakinler sayfasındaki menüden "Şifre yenileme
  bağlantısı" oluşturup kopyalayabilir veya SMS/WhatsApp ile gönderebilirsiniz. Talep sakinin blok yöneticisine de düşer. Bir yönetici gönderdiğinde talep
  herkeste "Tamamlandı" olur. Hesabı henüz olmayan sakinin talebi "Hesap açma talebi" olarak gelir; davet bağlantısı
  gönderilir.
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
