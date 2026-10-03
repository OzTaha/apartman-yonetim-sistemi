export interface PageHelp {
  title: string;
  body: string[];
}

const help: Record<string, PageHelp> = {
  '/panel': {
    title: 'Panel nedir?',
    body: [
      'Panel, apartmanın veya sitenin bugünkü durumunu tek bakışta gösteren ana sayfadır.',
      '"Bugün yapılacaklar" kartı sizi bekleyen işleri sıralar: borcunu geciktiren daireler, yeni arıza talepleri, günü gelen görevler. Yanındaki düğmeye basınca o işin sayfası açılır.',
      'Alttaki kutucuklar bu ayın rakamlarıdır. Bir kutucuğa dokunursanız ayrıntısı açılır. Örneğin "Gecikmiş borçlu daire" kutusuna dokunursanız hangi dairelerin borçlu olduğunu görürsünüz.',
    ],
  },
  '/daireler': {
    title: 'Daireler nedir?',
    body: [
      'Binadaki tüm dairelerin listesidir. Her dairenin kimde oturduğu, borcu ve bilgileri buradan açılır.',
      'İlk kurulumda "Toplu ekle" ile daireleri bir seferde oluşturabilirsiniz. Örneğin 1’den 12’ye kadar daire numarası yazarsanız 12 daire birden eklenir.',
      'Bir daireye dokunduğunuzda o dairenin sakinlerini, borçlarını ve ödemelerini görürsünüz; buradan ödeme de alabilirsiniz.',
    ],
  },
  '/daireler/*': {
    title: 'Daire sayfası',
    body: [
      'Bu sayfa tek bir dairenin dosyası gibidir: kimin oturduğu, ne kadar borcu olduğu ve geçmiş ödemeleri burada.',
      '"Ödeme al" ile sakinden aldığınız parayı kaydedersiniz; sistem makbuzu kendisi hazırlar. "Borç ekle" ile aidat dışında bir borç yazabilirsiniz, örneğin yakıt veya demirbaş payı.',
      '"Hesap ekstresi" dairenin tüm borç ve ödemelerini tarih sırasıyla PDF olarak verir.',
    ],
  },
  '/sakinler': {
    title: 'Sakinler nedir?',
    body: [
      'Dairelerde oturan ev sahipleri (malik) ve kiracıların listesidir.',
      'Bir sakini sisteme ekledikten sonra "Davet bağlantısı" oluşturup ona gönderirsiniz. Sakin o bağlantıyla kendi şifresini belirler ve telefonundan borcunu, duyuruları görmeye başlar.',
      'Bir sakin taşındığında silmek yerine "Taşındı" olarak işaretleyin; geçmiş kayıtları kaybolmaz.',
    ],
  },
  '/excel-aktarma': {
    title: "Excel'den aktar nedir?",
    body: [
      'Daireleri, sakinleri ve eski yönetimden kalan borçları tek tek yazmak yerine bir Excel dosyasıyla hepsini birden eklersiniz.',
      'Önce şablonu indirin. Şablonun ilk sayfasında hangi sütuna ne yazılacağı anlatılır. Doldurup kaydettikten sonra buraya yükleyin.',
      'Sistem önce bir önizleme gösterir: kaç daire, kaç sakin, kaç borç ekleneceğini ve varsa hangi satırda sorun olduğunu söyler. Siz "Aktar"a basmadan hiçbir şey kaydedilmez. Sistemde zaten olan daire ve sakinler atlanır.',
    ],
  },
  '/yetkililer': {
    title: 'Yetkililer nedir?',
    body: [
      'Size yardım edecek kişileri burada atarsınız.',
      'Blok yöneticisi yalnızca kendi bloğunun dairelerini, borçlarını ve taleplerini görür; o blokta ödeme alabilir. Denetçi ise kasayı ve hesapları görür ama hiçbir şeyi değiştiremez.',
      'Atamak istediğiniz kişinin önce sakin olarak eklenmiş ve davet bağlantısıyla hesabını açmış olması gerekir.',
    ],
  },
  '/islem-gecmisi': {
    title: 'İşlem geçmişi nedir?',
    body: [
      'Sistemde kimin, ne zaman, neyi değiştirdiğinin kaydıdır. Bir defter gibi düşünebilirsiniz; silinemez.',
      'Örneğin bir ödeme iptal edildiyse kimin iptal ettiğini ve öncesindeki tutarı burada görürsünüz.',
    ],
  },
  '/bildirimler': {
    title: 'Bildirimler nedir?',
    body: [
      'Sizin ilgilenmeniz gereken yeni olaylar buraya düşer: yeni arıza talebi, şifresini unutan sakin gibi.',
      'Okumadığınız bildirimler kalın görünür ve üstteki zil simgesinde sayısı yazar. Bildirime dokununca ilgili sayfa açılır.',
    ],
  },
  '/talepler': {
    title: 'Arıza ve talepler nedir?',
    body: [
      'Sakinlerin telefondan bildirdiği arızalar, şikâyetler ve öneriler burada toplanır. Görevlilerin "Yöneticiye yaz" ile gönderdiği mesajlar da "Görevliden" etiketiyle burada görünür.',
      'Bir talebi açıp sakine yanıt yazabilirsiniz. Durumunu "İşleme al", "Çözüldü" veya "Reddet" ile değiştirdiğinizde sakin bunu kendi ekranında görür.',
      'İşi bir çalışana vermek isterseniz "Görev oluştur"a basın; görev bitince talep de kendiliğinden çözülür.',
    ],
  },
  '/talepler/*': {
    title: 'Talep sayfası',
    body: [
      'Sakinin yazdığı açıklama, eklediği fotoğraflar ve bugüne kadar yapılanlar burada.',
      'Yanıt yazın ve durumu güncelleyin; sakin her değişikliği kendi telefonunda görür.',
    ],
  },
  '/genel-kurul': {
    title: 'Genel kurul nedir?',
    body: [
      'Kat malikleri yılda en az bir kez toplanıp kararlar alır; buna genel kurul denir. Bu sayfa o toplantıları düzenlemenize yardım eder.',
      'Toplantıyı planlayın, gündem maddelerini yazın ve "Çağrı gönder" ile sakinlere duyurun. Toplantı günü kimin geldiğini işaretleyin; sistem yeterli kişi olup olmadığını kendisi hesaplar.',
      'Kararları yazıp toplantıyı tamamlayınca kararlar duyuru olarak sakinlere paylaşılabilir.',
    ],
  },
  '/genel-kurul/*': {
    title: 'Toplantı sayfası',
    body: [
      'Gündem, katılım listesi ve kararlar bu sayfada.',
      'Katılım listesinde her daire için "Katıldı", "Vekil" veya "Katılmadı" seçin. Üstteki kutu toplantının yapılabilmesi için yeterli kişi olup olmadığını gösterir.',
    ],
  },
  '/aidat': {
    title: 'Aidat tablosu nedir?',
    body: [
      'Her satır bir daire, her sütun bir aydır. Kutunun rengi o ayın aidatının durumunu söyler.',
      'Yeşil ödendi, sarı eksik ödendi, kırmızı gecikmiş, gri henüz son ödeme günü gelmedi demektir.',
      'Bir kutuya dokunursanız o dairenin hesabı açılır ve oradan ödeme alabilirsiniz.',
    ],
  },
  '/borclar': {
    title: 'Borçlar nedir?',
    body: [
      'Dairelere yazılmış tüm borçların listesidir: aidatlar ve sonradan eklenen yakıt, demirbaş gibi borçlar.',
      '"Borç ekle" ile bir daireye veya tüm dairelere aynı anda borç yazabilirsiniz. Örneğin çatı tamiri için her daireye 500 TL.',
      'Yanlış yazılmış bir borcu iptal edebilirsiniz. Ödemesi alınmış bir borcu iptal etmek için önce ödemeyi iptal etmeniz gerekir.',
    ],
  },
  '/tahsilatlar': {
    title: 'Tahsilatlar nedir?',
    body: [
      'Sakinlerden alınan tüm ödemelerin listesidir. Her ödemenin bir makbuzu vardır.',
      '"Ödeme al" ile elden veya havaleyle gelen parayı kaydedin. Sistem parayı dairenin en eski borcundan başlayarak düşer ve kasaya gelir olarak yazar.',
      'Yanlış girilen bir ödemeyi iptal ederseniz borç yeniden açılır.',
    ],
  },
  '/banka-hareketleri': {
    title: 'Banka hareketleri nedir?',
    body: [
      'Bankaya havaleyle gelen aidatları tek tek yazmak yerine, bankanızın internet şubesinden indirdiğiniz hesap dökümünü buraya yüklersiniz.',
      'Sistem açıklamadaki daire numarasına ve isme bakarak hangi ödemenin hangi daireye ait olduğunu tahmin eder. Siz kontrol edip onaylarsınız; onaylananlar tahsilat olur.',
    ],
  },
  '/raporlar': {
    title: 'Raporlar nedir?',
    body: [
      'Borçlu dairelerin ve alınan ödemelerin listesini Excel veya PDF olarak indirirsiniz.',
      'Örneğin toplantıda dağıtmak için "Borç raporu"nu PDF olarak alabilirsiniz.',
    ],
  },
  '/aidat-ayarlari': {
    title: 'Aidat ayarları nedir?',
    body: [
      'Aylık aidat tutarını ve son ödeme gününü burada belirlersiniz. Bir kez yazmanız yeterli; aidat her ayın 1’inde dairelere kendiliğinden yazılır.',
      'Online ödeme açıksa sakinler borçlarını kartla da ödeyebilir; bu ayar da buradadır.',
    ],
  },
  '/kasa': {
    title: 'Kasa nedir?',
    body: [
      'Apartmanın parasının nereye girip nereden çıktığını gösteren defterdir. Elden para için "Kasa", banka hesabı için "Banka" ayrı tutulur.',
      'Gelen aidatlar buraya kendiliğinden yazılır. Ödediğiniz faturaları "Gider ekle" ile girin; örneğin elektrik faturası 2.300 TL.',
      'Bir gideri "Dairelere yansıt" ile dairelere borç olarak paylaştırabilirsiniz.',
    ],
  },
  '/isler': {
    title: 'Yapılan işler nedir?',
    body: [
      'Binada yaptırılan tamir, boya, bakım gibi işlerin kaydıdır: hangi firma yaptı, ne kadar anlaşıldı, ne kadar ödendi.',
      'İş kaydederken "Dairelere borç olarak yansıt" seçiliyse tutar dairelere eşit borç olarak yazılır.',
      'İşaretlediğiniz işler sakinlerin "Giderler ve işler" sayfasında faturasıyla görünür; böylece paranın nereye harcandığını herkes görür.',
    ],
  },
  '/isler/*': {
    title: 'İş sayfası',
    body: [
      'İşin bilgileri, firmaya yapılan ödemeler ve faturaları burada.',
      'Ödemeleri taksit taksit girebilirsiniz; sayfa kalan tutarı kendisi hesaplar.',
    ],
  },
  '/firmalar': {
    title: 'Firmalar nedir?',
    body: [
      'Çalıştığınız usta ve firmaların telefon defteridir: asansörcü, temizlik şirketi, boyacı gibi.',
      'Bir firmaya bugüne kadar toplam ne kadar ödendiğini de burada görürsünüz.',
    ],
  },
  '/gelir-gider': {
    title: 'Gelir-gider raporu nedir?',
    body: [
      'Seçtiğiniz tarihler arasında ne kadar para girdiğini ve çıktığını özetler. Giderler türlerine göre (elektrik, temizlik, bakım…) grafikle gösterilir.',
      'Ay kapanışı yaparsanız o ayın kayıtları kilitlenir ve sonradan yanlışlıkla değiştirilemez.',
    ],
  },
  '/butce': {
    title: 'İşletme projesi nedir?',
    body: [
      'Önümüzdeki 12 ayda ne kadar harcama yapılacağını tahmin ettiğiniz yıllık bütçedir. Kanuna göre genel kurulda onaylanması gerekir.',
      'Gider kalemlerini yazdığınızda sistem her dairenin aylık ne kadar aidat ödemesi gerektiğini kendisi hesaplar.',
      '"Aidat planı olarak uygula" ile bu tutar aidat olarak başlar.',
    ],
  },
  '/butce/*': {
    title: 'Bütçe sayfası',
    body: [
      'Her gider kalemi için yıllık tahmini tutarı girin. Aşağıda dairelerin aylık payı hesaplanır.',
      'Yıl boyunca "Bütçe ve gerçekleşen" bölümünden tahmin ile gerçek harcamayı karşılaştırabilirsiniz.',
    ],
  },
  '/kasa-ayarlari': {
    title: 'Kasa ayarları nedir?',
    body: [
      'Kasa ve banka hesaplarınızı, gelir ve gider türlerini burada düzenlersiniz.',
      'Sistemi kullanmaya başladığınız gün kasada ve bankada ne kadar para olduğunu "Açılış bakiyesi" olarak girin; böylece bakiye doğru hesaplanır.',
      'Kullanmadığınız bir gider türünü silebilir veya "Pasif" yaparak listeden gizleyebilirsiniz.',
    ],
  },
  '/calisanlar': {
    title: 'Çalışanlar nedir?',
    body: [
      'Kapıcı, güvenlik, temizlik görevlisi gibi çalışanların listesidir.',
      'Çalışanların sisteme giriş hesabı yoktur; vardiyalarını ve görevlerini siz tutarsınız. Maaş ödemesini gider girerken çalışanı seçerek kaydedebilirsiniz.',
    ],
  },
  '/calisanlar/*': {
    title: 'Çalışan sayfası',
    body: ['Çalışanın bilgileri, vardiyaları, görevleri ve kendisine yapılan ödemeler burada.'],
  },
  '/vardiyalar': {
    title: 'Vardiya planı nedir?',
    body: [
      'Hangi çalışanın hangi gün, hangi saatler arasında çalışacağını gösteren haftalık çizelgedir.',
      '"Önceki haftayı kopyala" ile geçen haftanın planını tek düğmeyle bu haftaya taşıyabilirsiniz.',
    ],
  },
  '/gorevler': {
    title: 'Görevler nedir?',
    body: [
      'Çalışanlara verdiğiniz işlerin listesidir. Örneğin "Merdivenleri yıka, son gün cuma".',
      'Görevin durumunu "Devam ediyor" veya "Tamamlandı" yaparak takip edersiniz. Günü geçmiş görevler kırmızı görünür.',
    ],
  },
  '/gorevler/*': {
    title: 'Görev sayfası',
    body: [
      'Görevin açıklaması, kime verildiği ve bugüne kadar yapılanlar burada. Not ekleyebilir, durumunu değiştirebilirsiniz.',
    ],
  },
  '/tekrarlayan-gorevler': {
    title: 'Tekrarlayan görevler nedir?',
    body: [
      'Her gün, her hafta veya her ay yapılması gereken işleri bir kez tanımlarsınız; sistem zamanı gelince görevi kendisi oluşturur.',
      'Örneğin "Her pazartesi çöp kovalarını yıka" yazarsanız her pazartesi bu görev listede belirir.',
    ],
  },
  '/calisan-raporu': {
    title: 'Çalışan raporu nedir?',
    body: [
      'Seçtiğiniz tarihler arasında her çalışanın kaç vardiya çalıştığını, kaç görevi zamanında bitirdiğini ve ne kadar ödeme aldığını gösterir.',
    ],
  },
  '/duyurular': {
    title: 'Duyurular nedir?',
    body: [
      'Sakinlere haber vermek istediğiniz her şeyi buradan yayınlarsınız: su kesintisi, asansör bakımı, toplantı günü.',
      'Duyuru sakinlerin telefonundaki uygulamada görünür. İsterseniz SMS ile de gönderebilirsiniz.',
      'Önemli bir duyuruyu "Sabitle" ile en üstte tutabilir, bitiş tarihi vererek süresi dolunca gizleyebilirsiniz. Kaç kişinin okuduğunu da görürsünüz.',
    ],
  },
  '/duyurular/*': {
    title: 'Duyuru sayfası',
    body: ['Duyurunun metni, ekleri ve kimlerin okuduğu burada.'],
  },
  '/mesajlar': {
    title: 'Mesajlar nedir?',
    body: [
      'Sakinlere SMS veya WhatsApp ile gönderilen mesajların listesidir; kime gittiğini, kime gidemediğini burada görürsünüz.',
      '"Mesaj gönder" ile örneğin yalnızca borcu olan dairelere hatırlatma gönderebilirsiniz.',
      'İletişim izni vermemiş sakinlere kanun gereği mesaj gönderilmez.',
    ],
  },
  '/mesajlar/yeni': {
    title: 'Mesaj nasıl gönderilir?',
    body: [
      'Önce mesajın kime gideceğini seçin: herkes, bir blok, borcu olanlar gibi.',
      'Sonra mesajı yazın ya da hazır bir şablon seçin. "Kişiye özel bilgi ekle" düğmeleriyle her sakine kendi adı ve borcu yazılır.',
      '"Devam"a basınca kaç kişiye gideceği ve örnek mesaj gösterilir; onaylayınca gönderilir.',
    ],
  },
  '/mesajlar/*': {
    title: 'Gönderim sayfası',
    body: [
      'Bu mesajın kimlere gittiği tek tek listelenir. "Gönderilemedi" olanları tekrar deneyebilirsiniz.',
    ],
  },
  '/mesaj-ayarlari': {
    title: 'Şablonlar ve hatırlatma nedir?',
    body: [
      'Sık gönderdiğiniz mesajları şablon olarak saklarsınız; bir daha yazmanız gerekmez.',
      'Otomatik hatırlatmayı açarsanız, borcunu geciktiren sakinlere sistem kendiliğinden hatırlatma gönderir.',
    ],
  },
  '/anketler': {
    title: 'Anketler nedir?',
    body: [
      'Anket, yönetimin sakinlere bir soru sorup görüşlerini öğrenmesidir. Örneğin "Bahçeye çocuk oyun alanı yapılsın mı?"',
      'Her daire bir oy verir. Oyunuzu son güne kadar değiştirebilirsiniz. Oy verdikten sonra o ana kadarki sonucu görürsünüz.',
      'Yönetici hangi dairenin oy verdiğini görür ama kimin neye oy verdiğini göremez. Anket bitince sonuç duyuru olarak paylaşılabilir.',
    ],
  },
  '/anketler/*': {
    title: 'Anket sayfası',
    body: [
      'Seçeneklerin kaç oy aldığını ve hangi dairelerin henüz oy vermediğini burada görürsünüz.',
      '"Anketi bitir" ile oylamayı kapatın, sonra "Sonucu duyuru olarak paylaş" ile herkese duyurun.',
    ],
  },
  '/islerim': {
    title: 'İşlerim nedir?',
    body: [
      'Yöneticinin size verdiği işler ve çalışma saatleriniz bu sayfadadır.',
      'Bir işe başladığınızda "Başladım", bitirdiğinizde "Bitirdim" düğmesine basın. Yönetici işin bittiğini hemen görür.',
      'Şüpheli birini gördüğünüzde ya da bir şey bozulduğunda "Yöneticiye yaz" düğmesine basın. Örneğin: "Otoparkta tanımadığım biri arabalara bakıyor." Hemen bakılması gerekiyorsa "Acil" işaretleyin. Yöneticinin yanıtını aynı yerde görürsünüz.',
    ],
  },
  '/kapi': {
    title: 'Kapı sayfası nedir?',
    body: [
      'Binaya gelen kargoları ve misafirleri buradan kaydedersiniz. Kayıt yapınca dairede oturanların telefonuna bildirim gider.',
      'Kargo gelince "Kargo geldi"ye basın, daireyi seçin. Sakin kargoyu aldığında "Teslim et" deyin.',
      'Sakinler beklediği misafiri önceden bildirebilir; "Beklenen misafirler" listesinde görünür. Misafir gelince "Geldi"ye basın.',
      'Kişisel bilgi olduğu için kayıtlar 6 ay sonra kendiliğinden silinir.',
    ],
  },
  '/siteler': {
    title: 'Apartman ve siteler nedir?',
    body: [
      'Yönettiğiniz tüm apartman ve siteler burada. Yeni bir yer eklemek için "Yeni ekle"ye basın.',
      'Her yere bir yönetici atayabilirsiniz. Bir yeri silerseniz 30 gün boyunca "Silinenler" bölümünde bekler; bu sürede geri getirebilirsiniz.',
      'Silmeden önce tüm verileri Excel olarak indirmeniz önerilir.',
    ],
  },
  '/marka': {
    title: 'Marka ayarları nedir?',
    body: [
      'Uygulamanın adını, logosunu ve tema rengini değiştirirsiniz.',
      'Burada yaptığınız değişiklik herkesin ekranında görünür: giriş sayfası, menü, telefona eklenen uygulamanın simgesi ve PDF çıktıları.',
    ],
  },
  '/sifre': {
    title: 'Şifre değiştirme',
    body: [
      'Hesabınızın şifresini buradan değiştirirsiniz. Önce şu anki şifrenizi, sonra yeni şifrenizi iki kez yazın.',
      'Şifreniz en az 8 karakter olmalı. Başkalarının tahmin edemeyeceği bir şifre seçin ve kimseyle paylaşmayın.',
    ],
  },
};

export function pageHelp(pathname: string): PageHelp | undefined {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (help[path]) return help[path];
  const parts = path.split('/').filter(Boolean);
  for (let i = parts.length - 1; i > 0; i--) {
    const key = `/${parts.slice(0, i).join('/')}/*`;
    if (help[key]) return help[key];
  }
  return undefined;
}
