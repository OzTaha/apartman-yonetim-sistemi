# Teslim ve kullanım rehberi

Bu rehber, apartman veya site yönetimi için hazırlanmıştır. Sistem size ait sunucuda çalışır; veriler yalnızca bu
sunucuda ve sizin belirlediğiniz yedek deposunda tutulur.

## Size teslim edilenler

- Sistemin adresi (ör. `https://yonetim.ornekapartman.com`) ve sistem yöneticisi hesabı
- Sunucu erişim bilgileri ve sunucu ayar dosyasının (`.env`) bir kopyası. Bu dosyada veritabanı ve oturum anahtarları
  bulunur; şifre kasasında saklayın, kimseyle paylaşmayın.
- Varsa yedek deposu, ödeme kuruluşu ve SMS sağlayıcısı hesapları (hepsi sizin adınıza açılmıştır)

İlk girişte sistem yöneticisi şifrenizi değiştirin (sağ alttaki kullanıcı menüsü > Şifre değiştir).

Her kullanıcı yazı boyutunu (Normal, Büyük, Çok büyük) ve açık/koyu görünümü üst çubukta bildirim zilinin yanındaki
güneş/ay düğmesinden kendi cihazı için seçebilir. Telefonda menüye alttaki çubuktan ulaşılır.

Sakinler ilk girişte Dairem sayfasında kısa bir tanıtım turu görür (borç kartı, sık yapılan işler, yönetim iletişimi,
yazı boyutu, menü). Tur bir kez çıkar; kullanıcı menüsündeki "Tanıtım turunu göster" ile tekrar açılır. Sayfa
başlıklarının yanındaki "i" düğmesi o bölümün kısa açıklamasını gösterir. Dairem sayfasındaki "Yönetim" kartında site
yöneticisi ile sakinin kendi bloğunun yöneticisinin adı ve telefonu görünür; telefon numarası kayıtlı değilse yalnızca
adı gösterilir.

## Roller

| Rol               | Neler yapabilir                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| Sistem yöneticisi | Apartman ve siteleri oluşturur, yöneticileri atar, uygulama adını, logoyu ve tema rengini değiştirir             |
| Site yöneticisi   | Daireler, sakinler, aidat, tahsilat, kasa, çalışanlar, talepler, duyuru ve mesajları yönetir                     |
| Blok yöneticisi   | Kendi bloğunun sakinlerini, borç ve tahsilatlarını, giderlerini, taleplerini ve duyurularını yönetir             |
| Denetçi           | Kasa, gelir-gider, borç ve tahsilatları görür; hiçbir kaydı değiştiremez                                         |
| Sakin             | Kendi borçlarını, ödemelerini, makbuzlarını, duyuruları ve giderleri görür; online öder; arıza ve talep bildirir |

## İlk adımlar

1. **Daireler:** Daireler sayfasından "Toplu ekle" ile daireleri oluşturun (sitelerde önce bloklar eklenir).
2. **Sakinler:** Her dairenin sayfasından malik veya kiracıyı ekleyin. Telefon ve iletişim onayı SMS için gereklidir.
   Ev sahibi (malik) eklerken tapudaki arsa payını da girin (örneğin 24/480 ise 24); genel kurulda toplantı yeter
   sayısı buna göre otomatik hesaplanır. Arsa payı hiç girilmezse genel kurul ekranlarında gösterilmez.
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
- **İşlem geçmişi:** Kimin hangi kaydı ne zaman değiştirdiğini sistem yöneticisi "İşlem geçmişi" sayfasında görür;
  diğer yöneticilerde bu sayfa yoktur.
- **Gider:** Kasa sayfasında "Gider ekle"; faturayı veya fotoğrafını ekleyebilirsiniz. Sitelerde giderin "Site geneli"
  mi yoksa bir bloğa mı ait olduğunu seçin; blok giderini yalnızca o bloğun sakinleri görür. "Dairelere borç olarak
  yansıt" ile gider ilgili dairelere borç olarak paylaştırılır.
- **Yapılan işler:** Çatı onarımı, boya, asansör revizyonu gibi işleri "Yapılan işler" sayfasından ekleyin. Anlaşılan
  tutar girildiğinde "Dairelere borç olarak yansıt" işaretli gelir ve tutar işin kapsamındaki dairelere eşit
  paylaştırılıp doğrudan borç olarak yazılır; ayrıca borç girmeniz gerekmez. İş kasadaki birikimden ödenecekse işareti
  kaldırın. Tutar değişirse ödenmemiş borçlar kendiliğinden yeniden hesaplanır. Firmaya yaptığınız ödemeleri işin
  sayfasından "Ödeme ekle" ile kaydedin; bu ödemeler ikinci kez dairelere yansıtılmaz.
- **Kasa ayarları:** Kullanılmayan gelir/gider kategorisini çöp kutusu simgesiyle silebilirsiniz. Kayıt girilmiş
  kategori silinemez; yeni kayıtlarda görünmemesi için pasif yapın, geçmiş raporlarda kalmaya devam eder.
- **Duyuru:** Duyurular sayfasından tüm sakinlere, bloklara veya seçili dairelere duyuru yayınlanır; kimin okuduğu
  görülür.
- **Mesaj:** Mesajlar sayfasından borç hatırlatması, acil durum veya genel bilgi SMS/WhatsApp ile gönderilir.
  İletişim onayı vermemiş sakinlere mesaj gönderilmez.
- **Arıza ve talepler:** Sakinlerin bildirdiği arızalar "Arıza ve talepler" sayfasına ve bildirimlere düşer. Talebi
  açıp sakine yanıt yazın, "İşleme al", "Çözüldü" veya "Reddet" ile durumunu güncelleyin. "Görev oluştur" ile talebi
  bir çalışana verebilirsiniz; görev tamamlanınca talep de kapanır. Sakinler talep açmak için "Taleplerim" sayfasını
  veya Dairem'deki "Arıza bildir" düğmesini kullanır. Yönetim henüz işlem yapmadıysa sakin talebini geri çekebilir;
  geri çekme 6 saniye içinde "Geri al" ile iptal edilebilir.
- **Çalışanlar:** Vardiya planı, görevler ve tekrarlayan görevler "Çalışan ve görev" menüsündedir.
- **İşletme projesi:** Yıllık bütçeyi "İşletme projesi" sayfasında hazırlayın: önümüzdeki 12 ayın tahmini giderlerini
  kalem kalem girin, sistem daire başına düşen aylık avans aidatı hesaplar. PDF'i genel kurula sunun; kabul edilince
  "Aidat planı olarak uygula" ile yeni aidat tutarını başlatın. Yıl boyunca "Bütçe ve gerçekleşen" bölümünden harcamaları
  bütçeyle karşılaştırabilirsiniz.
- **Genel kurul:** "Genel kurul" sayfasından toplantıyı planlayın ve en az 15 gün önce "Çağrıyı yayınla" ile
  sakinlere duyurun. Toplantı öncesi hazirun cetvelini PDF olarak yazdırıp imzaya açın. Toplantıda katılanları
  işaretleyin, her gündem maddesinin kararını yazın ve "Toplantıyı tamamla" deyin; kararlar karar defterine sıra
  numarasıyla işlenir ve tutanak PDF'i hazırlanır. "Kararları duyuru olarak paylaş" işaretliyse kararlar sakinlere duyuru
  olarak yayınlanır; sakinlerin genel kurul menüsü yoktur, kararları duyurulardan görürler.
- **Ay kapanışı:** Gelir-gider raporu sayfasında geçmiş ayı kapatın; kapanan ayın kayıtları değiştirilemez.

Parasal kayıtlar silinmez, iptal edilir. İptal edilen kayıtlar nedeniyle birlikte saklanır; bakiyelerden ve
toplamlardan düşer. Yanlış girilen sakin kaydı ise sakinin menüsündeki "Kaydı sil" ile silinebilir; daireden taşınan
sakin için "Taşındı olarak işaretle" kullanılır.

## Apartman veya site silme

Yalnızca sistem yöneticisi, "Apartman ve siteler" sayfasında ilgili kartın menüsünden "Sil" ile bir yeri silebilir.
Silmeden önce "Verileri Excel olarak indir" ile daireler, sakinler, borçlar, tahsilatlar, gelir-gider, yapılan işler,
firmalar, çalışanlar, talepler ve genel kurul kararları tek dosyada indirilir. Silmek için yerin adı yazılır ve sistem
yöneticisinin e-posta/telefonu ile şifresi yeniden girilir.

Silinen yer 30 gün boyunca aynı sayfadaki "Silinenler" bölümünde bekler ve "Geri getir" ile eski haline döner. Süre
dolunca tüm verileri kalıcı olarak silinir; yalnızca o yere bağlı olan yönetici ve sakin hesapları da kaldırılır.

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
