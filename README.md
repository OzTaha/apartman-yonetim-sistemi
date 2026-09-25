# Apartman Yönetim Sistemi

Çoklu site destekli, web tabanlı ve mobil uyumlu apartman/site yönetim sistemi.

## Proje yapısı

```
apps/api         NestJS 11 API (PostgreSQL + Prisma 7, Redis)
apps/web         React 19 + Vite + Tailwind 4 + shadcn/ui + TanStack Router/Query
packages/shared  Web ve API'nin ortak kullandığı Zod şemaları, tipler ve yardımcılar
docker/          Geliştirme ortamı için PostgreSQL ve Redis
```

## Gereksinimler

- Node.js 22.12 veya üstü
- pnpm 10
- Docker Desktop

pnpm kurulu değilse iki yol vardır:

```sh
# 1) Global kurulum (önerilir)
npm install -g pnpm@10

# 2) Kurulum yapmadan her komutu npx ile çalıştırmak
npx pnpm@10 install
```

## İlk kurulum

```sh
pnpm install
cp apps/api/.env.example apps/api/.env   # JWT_ACCESS_SECRET değerini değiştirin
pnpm db:up                                # PostgreSQL (5433) ve Redis (6380)
pnpm --filter @apartman/api prisma:deploy # tabloları oluşturur
pnpm --filter @apartman/api db:seed       # örnek veriyi yükler
pnpm dev                                  # API ve web uygulamasını birlikte başlatır
```

| Adres                            | Açıklama                   |
| -------------------------------- | -------------------------- |
| http://localhost:5173            | Web uygulaması             |
| http://localhost:3000/api/health | API sağlık kontrolü        |
| http://localhost:3000/api/docs   | Swagger API dokümantasyonu |

PostgreSQL 5433, Redis 6380 portunu kullanır.
Farklı port gerekirse `POSTGRES_PORT` / `REDIS_PORT` ortam değişkenleri ve `apps/api/.env` birlikte değiştirilmelidir.

### Örnek hesaplar (seed)

Tüm hesapların şifresi `Deneme123!`.

| Rol               | Giriş bilgisi        |
| ----------------- | -------------------- |
| Sistem yöneticisi | `admin@ornek.com`    |
| Site yöneticisi   | `yonetici@ornek.com` |
| Sakin (Daire 1)   | `05321000000`        |

Seed iki örnek yer oluşturur: 5 daireli "Örnek Apartmanı" ve 2 bloklu, 4 daireli "Örnek Sitesi".
Yönetici hesabı ikisini de yönetir. Son 3 ayın aidatı ve ödemeleri yüklenir. Apartmanın 3 numaralı
dairesi iki ay borçlu, arada bir ay ödenmiş örneğini gösterir. Her yerde iki örnek çalışan, geçen ve bu haftanın vardiyaları,
açık, gecikmiş ve tamamlanmış görevler ile bir tekrarlayan görev bulunur. Seed yalnızca boş veritabanında çalışır.

## Komutlar

| Komut                                        | Açıklama                                                 |
| -------------------------------------------- | -------------------------------------------------------- |
| `pnpm dev`                                   | Tüm uygulamaları geliştirme modunda başlatır             |
| `pnpm build`                                 | Tüm paketleri derler                                     |
| `pnpm test`                                  | Birim testleri (veritabanı gerekmez)                     |
| `pnpm --filter @apartman/api test:e2e`       | API uçtan uca testleri (ayrı `apartman_test` veritabanı) |
| `pnpm --filter @apartman/web test:e2e`       | Tarayıcı testleri, masaüstü ve 375px mobil (Playwright)  |
| `pnpm typecheck`                             | TypeScript tip kontrolü                                  |
| `pnpm lint`                                  | ESLint                                                   |
| `pnpm format`                                | Prettier ile biçimlendirme                               |
| `pnpm db:up` / `pnpm db:down`                | Geliştirme veritabanını başlatır / durdurur              |
| `pnpm --filter @apartman/api prisma:migrate` | Şema değişikliğinden migration oluşturur ve uygular      |
| `pnpm --filter @apartman/api prisma:studio`  | Prisma Studio ile veritabanını görüntüler                |

Tarayıcı testleri ilk kez çalıştırılmadan önce Chromium indirilmelidir:
`pnpm --filter @apartman/web exec playwright install chromium`.
Testler geliştirme verisine dokunmaz: her çalıştırmada sıfırlanan `apartman_e2e` veritabanını ve
3100 (API), 5174 (web) portlarını kullanır.

## Yetki ve site izolasyonu

- **Roller:** sistem yöneticisi (tüm siteler), site yöneticisi, sakin.
- Siteye bağlı her istek `X-Site-Id` başlığı taşır. API kullanıcının o sitedeki üyeliğini doğrular.
- Siteye bağlı tablolara yapılan her sorguya aktif site filtresi otomatik eklenir (`apps/api/src/tenancy`).
  Ayrıca blok, daire ve sakin kayıtları veritabanında birleşik yabancı anahtarla aynı siteye bağlanır.
- Sakin yalnızca halen oturduğu daireyi ve kendi kaydını görebilir.
- Oturum: 15 dakikalık erişim token'ı (yalnızca bellekte) ve 30 günlük refresh token (httpOnly cookie).
  Refresh token her kullanımda yenilenir. Eski bir token tekrar kullanılırsa kullanıcının tüm oturumları kapatılır.
- Önemli değişiklikler `audit_logs` tablosuna kim/ne zaman/önce/sonra bilgisiyle yazılır.

## Apartman ve site

- Her yer "Apartman" (tek bina) veya "Site" (birden çok blok) olarak tanımlanır.
- Apartmanda blok kavramı arayüzde görünmez; daireler "Daire 5" olarak listelenir. Arka planda tek bir bina bloğu bulunur.
- Apartman siteye çevrilebilir. Site, en fazla bir bloğu varsa apartmana çevrilebilir.
- Ödeme ve sakin geçmişi olmayan daire, ödenmemiş aidatlarıyla birlikte silinir. Geçmişi olan daire silinmez, arşivlenir:
  listelerden, aylık aidattan ve toplu borçtan çıkar, geçmişi raporlarda kalır.
- Blok, içindeki tüm daireler silinebiliyorsa daireleriyle birlikte silinir.

## Aidat ve borç kuralları

- Aylık aidat her ayın 1'inde 00:05'te (İstanbul) tüm dairelere otomatik yazılır. Sunucu o gün kapalıysa açılışta o ayın aidatı yazılır.
  Aynı daireye aynı ay iki kez yazılmaz; "Aidat ayarları > Aidatı şimdi oluştur" ile elle de çalıştırılabilir.
- Aidat varsayılan olarak her daireye eşit yazılır. Sistem yöneticisi site ayarlarından "Oranlı aidat dağıtımı"nı açarsa
  m²'ye veya arsa payına göre dağıtım seçilebilir ve daire formunda bu alanlar görünür. Oranlı plan geçerliyken yeni dairede
  ilgili bilgi zorunludur; eksik bilgili daireler aidat ekranlarında uyarı olarak listelenir.
- Dağıtım kuruşu kuruşuna yapılır ve toplam her zaman girilen tutara eşittir.
- Son ödeme günü site ayarıdır (varsayılan 10). Bu tarihten sonra ödenmeyen borç "gecikmiş" görünür.
- Borçtan fazla ödeme kabul edilmez. Ödeme varsayılan olarak en eski borçtan başlanarak dağıtılır; istenirse ödenen aylar elle seçilir.
- Ödemesi olan borç iptal edilemez; önce ödeme iptal edilir. Kayıtlar silinmez, iptal nedeniyle birlikte saklanır.
- Borç durumu (ödendi / eksik / gecikmiş) ödemelerden hesaplanır, ayrıca saklanmaz.

## Panel ve sakin portalı

- Yönetici girişte paneli görür: daire sayısı, bu ay aidatını ödeyenler, gecikmiş borçlu daireler, aylık tahsilat,
  bekleyen borç, kasa bakiyesi, son 6 ayın gelir-gideri, geciken ve yaklaşan ödemeler, son hareketler.
- Sakin "Dairem" sayfasında güncel ve gecikmiş borcunu, ödenecek ve ödenmiş borçlarını, ödemelerini görür;
  her ödemenin makbuzunu ve istediği tarih aralığının hesap ekstresini indirir.
- Borç, tahsilat ve kasa hareketleri listelerinde kayıtlar toplu seçilip tek seferde iptal edilebilir. İptal edilemeyenler
  (ödemesi olan borç, kapatılmış aya ait kayıt vb.) atlanır ve nedeni gösterilir.

## Gelir-gider ve kasa

- Her yerde "Nakit kasa" ve "Banka hesabı" hazır gelir; başka hesaplar ve kategoriler "Kasa ayarları"ndan eklenir.
- Aidat ödemesi seçilen hesaba otomatik gelir olarak yazılır ve sıra numaralı PDF makbuz üretilir. Ödeme iptal edilirse gelir kaydı da iptal olur.
- Gider, gelir ve yapılan işlere PDF, JPG, PNG veya WEBP belge (en fazla 10 MB) eklenebilir. Dosya türü içeriğinden kontrol edilir;
  dosyalar yalnızca yetkili kullanıcıya, oturum açılarak verilir.
- Yapılan işlerde anlaşılan tutar, işe bağlı ödemeler (taksitler) ve kalan tutar izlenir.
- Sakinler "Giderler ve işler" sayfasında kasa toplamını, aylık gelir-gideri, işleri ve giderleri belgeleriyle görür.
  Yönetici tek tek kayıtları sakinlerden gizleyebilir; gizlenen tutarlar toplamlara dahil kalır.
- Ay kapanışı, kapanan ay ve öncesindeki gelir, gider, tahsilat ve belgeleri kilitler. Yalnızca son kapanış geri alınabilir.
- Yüklenen dosyalar `UPLOAD_DIR` klasöründe (varsayılan `apps/api/uploads`) tutulur; veritabanı ile birlikte yedeklenmelidir.

## Çalışan ve görev takibi

- Çalışanlar (kapıcı, güvenlik, temizlik, bahçıvan, diğer) yalnızca kayıt olarak tutulur, sisteme giriş hesapları yoktur.
  Vardiya ve görevleri yönetici girer; sakinler bu bölümü görmez.
- Vardiya planı haftalık tablodur, mobilde gün gün listelenir. Bitiş saati başlangıçtan küçükse vardiya ertesi güne taşar
  (ör. 20:00–08:00). Aynı çalışanın vardiyaları çakışamaz. "Önceki haftayı kopyala" çakışanları ve pasif çalışanları atlar.
- Görev durumları: yapılacak, devam ediyor, tamamlandı, iptal (neden zorunlu). Son tarihi geçen açık görev "gecikmiş" görünür.
  Oluşturma, atama, düzenleme, durum değişikliği ve notlar görev geçmişine kim/ne zaman bilgisiyle yazılır.
- Tekrarlayan görevler her gün, haftanın seçili günleri veya ayın belli bir günü (1–28) için tanımlanır. O günün görevi her sabah
  00:10'da (İstanbul) oluşur; sunucu kapalıysa açılışta oluşturulur. Aynı gün için iki kez oluşmaz.
- Kasaya gider girerken çalışan seçilebilir (maaş vb.). Çalışana bağlı gider varsayılan olarak sakinlerden gizlenir ve çalışanın
  sayfasında ödemeler arasında görünür. Bir gider aynı anda hem firmaya hem çalışana bağlanamaz.
- Geçmişi (vardiya, görev, ödeme) olan çalışan silinmez, pasif yapılır; pasif çalışana yeni vardiya veya görev verilemez.
- Çalışan raporu seçilen tarih aralığında vardiya sayısı ve süresini, tamamlanan ve geç tamamlanan görevleri, çalışana yapılan
  ödemeleri; ayrıca bugün itibarıyla açık ve geciken görevleri gösterir.

## Kurallar

- **Para:** Tüm tutarlar veritabanında kuruş cinsinden tam sayı tutulur. Dönüşüm ve gösterim için `@apartman/shared` içindeki `parseTlToKurus` ve `formatKurus` kullanılır.
- **Doğrulama:** Formlar ve API aynı Zod şemalarını kullanır (`packages/shared/src/schemas.ts`).
- **Telefon:** Numaralar `+905321234567` biçiminde saklanır (`normalizeTrPhone`).
- **Ortam değişkenleri:** API açılışta tüm değişkenleri doğrular. Eksik veya hatalı değer varsa hangi değişkenin sorunlu olduğunu yazarak durur.
- `apps/web/src/routeTree.gen.ts` TanStack Router tarafından otomatik üretilir ve git'e eklenir. Elle düzenlenmez.
