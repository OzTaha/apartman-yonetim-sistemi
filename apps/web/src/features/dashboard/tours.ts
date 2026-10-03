import type { TourStep } from '@/components/tour';

const help: TourStep = {
  target: 'help',
  title: 'Anlamadığınız yerde "i"ye dokunun',
  body: 'Her sayfanın başlığının yanında bu düğme var. Dokununca o sayfanın ne işe yaradığı örnekle, basitçe anlatılır.',
};

const search: TourStep = {
  target: 'search',
  title: 'Aradığınızı hızlıca bulun',
  body: 'Büyüteç düğmesine dokunup bir sayfanın adını, daire numarasını veya sakinin adını yazın. Örneğin "Ayşe" yazarsanız Ayşe Hanım’ın dairesi çıkar. Bilgisayarda Ctrl ve K tuşlarına birlikte basarak da açabilirsiniz.',
};

const bell: TourStep = {
  target: 'bell',
  title: 'Bildirimler',
  body: 'Yeni bir arıza talebi geldiğinde ya da bir sakin şifresini unuttuğunda zilin üstünde kırmızı bir sayı çıkar. Zile dokunarak görebilirsiniz.',
};

const appearance: TourStep = {
  target: 'appearance',
  title: 'Yazıyı büyütün',
  body: 'Yazılar küçük geliyorsa bu düğmeden "Büyük" veya "Çok büyük" seçin. Koyu görünümü de buradan açabilirsiniz.',
};

const nav: TourStep = {
  target: 'nav',
  title: 'Menü',
  body: 'Diğer tüm sayfalar burada. Bu turu tekrar görmek isterseniz kullanıcı menüsünden "Tanıtım turunu göster"i seçin.',
};

export const managerTour: TourStep[] = [
  {
    target: 'today',
    title: 'Her gün önce buraya bakın',
    body: 'Sistem sizi bekleyen işleri bu kartta sıralar: borcunu geciktiren daireler, yeni arıza talepleri, günü gelen görevler. Satırdaki düğmeye basınca o işin sayfası açılır.',
  },
  {
    target: 'pay',
    title: 'Ödeme almak',
    body: 'Bir sakin aidatını elden veya havaleyle ödediğinde "Ödeme al"a basın, daireyi ve tutarı seçin. Makbuz kendiliğinden hazırlanır, para kasaya yazılır.',
  },
  {
    target: 'stats',
    title: 'Bu ayın durumu',
    body: 'Kaç dairenin aidatını ödediğini, ne kadar borç kaldığını ve kasada ne kadar para olduğunu gösterir. Bir kutuya dokunursanız ayrıntısı açılır.',
  },
  help,
  search,
  bell,
  appearance,
  nav,
];

export const auditorTour: TourStep[] = [
  {
    target: 'stats',
    title: 'Hoş geldiniz, denetçi',
    body: 'Siz kasayı, borçları ve ödemeleri görebilirsiniz ama hiçbir kaydı değiştiremezsiniz. Bu kutular bu ayın özetidir; dokunursanız ayrıntısı açılır.',
  },
  help,
  appearance,
  nav,
];

export const blockManagerTour: TourStep[] = [
  {
    target: 'help',
    title: 'Hoş geldiniz, blok yöneticisi',
    body: 'Siz yalnızca kendi bloğunuzun dairelerini, sakinlerini, borçlarını ve taleplerini görürsünüz. Bir daireye dokunarak ödeme alabilirsiniz. Anlamadığınız yerde başlığın yanındaki "i"ye dokunun.',
  },
  search,
  bell,
  appearance,
  nav,
];

export const adminTour: TourStep[] = [
  {
    target: 'new-site',
    title: 'Apartman veya site ekleyin',
    body: 'Yönettiğiniz her yer burada listelenir. Yeni bir apartman veya site eklemek için bu düğmeye basın, sonra ona bir yönetici atayın.',
  },
  help,
  {
    target: 'nav',
    title: 'Menü',
    body: 'Uygulamanın adını, logosunu ve rengini menüdeki "Marka ayarları"ndan değiştirebilirsiniz. Bu turu tekrar görmek için kullanıcı menüsünden "Tanıtım turunu göster"i seçin.',
  },
  appearance,
];
