# Etüt Platformu — Mimari ve Mühendislik Notları

Bu belge, kök dizindeki README'nin teknik ekidir: tasarım kararlarının nedenlerini, güvenlik sınırlarını ve ölçülmüş performans iyileştirmelerini anlatır.

## Testler neden Docker istemiyor

`test/db.ts`, gömülü bir Postgres olan **PGlite** üzerinde çalışır ve Supabase'in
sağladığı `auth` şemasını (`auth.users`, `auth.uid()`) ile `anon` / `authenticated`
rollerini taklit eder. Testler `set role authenticated` ile koştuğu için tablo sahibi
değildirler — yani **RLS politikaları gerçekten devrededir**. Tüm migration'lar her
test çalıştırmasında sıfırdan uygulanır.

Supabase'in tamamını (Auth, Storage, Studio) yerelde çalıştırmak için Docker gerekir:

```bash
npx supabase start
```

## Mimari notlar

**Kontenjan ve bekleme listesi veritabanındadır.** `rezervasyon_yap` ve
`rezervasyon_birak` fonksiyonları etüt satırını `for update` ile kilitler; eşzamanlı
isteklerin kontenjanı aşmaması ancak böyle garanti edilir. Bu yüzden `reservations`
tablosunda öğrenciye yazma politikası **yoktur** — tek giriş noktası bu fonksiyonlardır.

**Çakışmalar kısıtla engellenir.** Öğretmen ve derslik çifte rezervasyonu `btree_gist`
exclusion constraint'leriyle; öğrencinin aynı saatte iki etüde kaydı rezervasyon
fonksiyonunda engellenir.

**RLS politikaları çapraz tabloya doğrudan bakmaz.** Bir politika başka bir RLS'li
tabloyu sorgularsa Postgres özyinelemeye girer ve politikalar OR'landığı için bu döngü
ilgisiz rolleri de etkiler. Tüm çapraz kontroller `SECURITY DEFINER` yardımcı
fonksiyonların (`etut_ogretmeni_mi`, `veli_etudu_gorebilir`, `ogrenciyi_gorebilir` …)
arkasındadır.

**Bildirimler kanal-bağımsızdır.** `notifications` uygulama içi kaydı tutar;
`notification_outbox` her dış kanal (SMS, e-posta) için ayrı satır tutar. SMS
sağlayıcısı devreye alındığında yalnızca outbox'ı tüketen bir işçi yazılır, uygulama
kodu değişmez.

## Supabase proje ayarları

Proje oluştururken (Settings > API):

| Ayar | Değer | Neden |
|---|---|---|
| Enable Data API | **Açık** | `supabase-js` tabloları bu API üzerinden sorgular |
| Automatically expose new tables | **Kapalı** | Yetkiler `0005_yetkiler.sql` içinde açıkça verilir; yeni tablo kendiliğinden açılmaz |
| Enable automatic RLS | **Açık** | RLS açmayı unutulan tablo veri sızdırmak yerine kapalı kalır |

## Kabul edilmiş denetim uyarıları

Supabase güvenlik denetimi (`get_advisors`) iki kalemi bilerek açık bırakıldığı
için raporlamaya devam eder:

**`security_definer_view` — `v_ogretmen_dizini`, `v_ogrenci_dizini`.**
Bu görünümlerin amacı zaten RLS'i aşmaktır: `users` tablosu kişinin kendisine ve
yöneticiye kapalıdır (telefon/e-posta orada durur), ama öğrencinin etüt kartında
öğretmen adını, öğretmenin de yoklama listesinde öğrenci adını görmesi gerekir.
Görünüm yalnızca ad/soyad/sınıf sütunlarını verir ve `auth_school_id()` ile
filtrelenir; giriş yapmamış çağrıda bu null döner, yani sorgu boş sonuç verir.
`anon` rolüne select yetkisi de yoktur. RLS satır bazlıdır, sütun bazlı değildir —
bu daraltmayı yapmanın başka yolu yok.

**`authenticated_security_definer_function_executable` — 12 fonksiyon.**
RLS yardımcıları ve iş kuralı fonksiyonları tanım gereği SECURITY DEFINER'dır.
Yetki kontrolleri fonksiyonların kendi içindedir (`servis_baglantisi_mi()` +
`auth.uid()` kontrolü) ve `test/yetki.test.ts` bunları doğrular.

Denetimin ilk çalıştırmasında bulduğu üç gerçek sorun 0006 ile kapatılmıştır:
giriş yapmamış kullanıcının RPC çağırabilmesi, fonksiyonlarda sabitlenmemiş
`search_path` ve `v_okullar_acik` görünümünün gereksiz yere definer olması.

## İçe aktarım nasıl çalışıyor

```
.xlsx  →  parse.ts  →  önizleme  →  [yönetici onayı]  →  apply.ts  →  veritabanı
             ↑                                              ↓
        lookupsGetir()                              davet kodları (.xlsx)
```

`parse.ts` veritabanına hiç dokunmaz; mevcut kayıtlar ve çapraz referanslar
`lookupsGetir()` ile dışarıdan verilir. Bu sayede önizleme **hiçbir şey
kaydetmeden** kesin sonucu gösterir.

`apply.ts` tek transaction içinde çalışır ve **asla silmez** — dosyada olmayan
kayda dokunulmaz, yanlış dosya yüklemek veri kaybettiremez.

**Auth kullanıcıları transaction dışındadır.** Supabase Auth kullanıcıları HTTP
ile oluşturulur, SQL transaction'ına giremez. Bu yüzden önce oluşturulur. İşlem
idempotenttir: auth kimliği sabit bir e-postadan türer
(`ogrenci-248@okul.etut.local`), dolayısıyla yarıda kalan bir yükleme tekrar
denendiğinde çift kayıt üretmez.

**Davet kodları.** Yeni kullanıcı için tek kullanımlık kod üretilir (`K7MP-3XRA`).
Kodun kendisi saklanmaz, yalnızca SHA-256 özeti. Doğrulama sabit sürelidir.
Şifresini belirlemiş kullanıcıya yeniden kod üretilmez — dosya tekrar yüklense bile.

## Kimlik doğrulama

Tek giriş alanı vardır; rol kimliğin biçiminden anlaşılır:

| Girdi | Rol | Auth e-postası |
|---|---|---|
| `@` içeriyor | öğretmen / yönetici | girdinin kendisi |
| 10–11 haneli numara | veli | `veli-905321112233@okul.etut.local` |
| diğer | öğrenci | `ogrenci-248@okul.etut.local` |

Öğrenci ve velinin auth e-postası **sentetiktir**: gerçek bir kutu değildir,
kullanıcı hiç görmez. Çözümleme veritabanına bakmadan yapılır — böylece giriş
ekranı "bu numara kayıtlı mı" bilgisini sızdırmaz, var olmayan kullanıcı da
parola hatası alır.

Şifreyi kimse dağıtmaz: içe aktarım her yeni kullanıcı için tek kullanımlık bir
davet kodu üretir, kullanıcı ilk girişte kendi şifresini belirler, kod o anda
silinir.

**Yetkilendirme proxy'de DEĞİLDİR.** `proxy.ts` yalnızca Supabase oturumunu
tazeler ve okul slug'ını çözer. "Bu kişi bunu görebilir mi" kararı her zaman
veritabanındaki RLS ile ve sayfa/action içindeki `rolZorunlu` / `actionYetkisi`
ile verilir; proxy'nin atlandığı bir yol açık kalmasın diye.

## İçe aktarım başarımı

Gerçek veriyle ölçülmüş iki darboğaz vardı; ikisi de giderildi.

**Satır başına sorgu.** İlk sürüm her satır için ayrı `insert` atıyordu.
Frankfurt'a her gidiş-dönüş ~200 ms olduğu için 158 satırlık konu dosyası
**33,5 saniye** sürüyordu; 1.248 öğrencilik gerçek bir dosya dakikalar alır ve
sunucusuz ortamda zaman aşımına uğrardı. Artık her şablon tek sorguda yazılıyor
(`unnest` ile diziler satırlara açılıyor) → **6,3 saniye**.

**Auth kullanıcısı başına iki çağrı.** Her kullanıcı için önce "var mı" sorgusu,
sonra HTTP oluşturma yapılıyordu. Artık mevcutlar tek sorguda bulunuyor ve
yalnızca eksikler, sekizerli gruplar hâlinde paralel oluşturuluyor →
40 öğrenci **25 s → 6,1 s**.

> `AuthSaglayici` arayüzü bu yüzden `mevcutlariBul` + `olustur` diye ikiye
> ayrılmıştır. Tek bir `pg` bağlantısı eşzamanlı sorgu kaldırmaz; paralel
> çalışan kısmın veritabanına dokunmaması gerekir.

## Denetim kaydı nasıl yazılır

`audit_logs` tablosuna **hiçbir kullanıcının** yazma yetkisi yoktur — yönetici
dahil. Değiştirilebilen bir denetim kaydı denetim kaydı sayılmaz.

Bu yüzden kayıtlar kullanıcı oturumuyla değil, `lib/denetim.ts` üzerinden servis
tarafından yazılır. Kullanıcı oturumuyla yazmaya çalışmak sessizce başarısız
olur: supabase-js hatayı döndürür, kimse bakmazsa kayıt kaybolur. Bu bir kez
başımıza geldi; modül tam olarak bunu engellemek için var.

## İstemci / sunucu sınırı

Sunucu modülleri (`lib/supabase/server.ts`, `lib/etut/*.ts`, `lib/denetim.ts`)
`import "server-only"` ile işaretlidir. Bir istemci bileşeni bunlardan birini
—sadece bir tip için bile— import ederse Next derlemeyi durdurur.

Bu yüzden öğrenci kartının görünüm mantığı `lib/etut/ogrenci-gorunum.ts`
içinde ayrı durur: tipler ve `eylemBelirle` istemcide de gerekli, veritabanına
dokunan kısım ise hiç istemciye gitmemeli.

**`tsc` bu sınırı görmez, `next build` görür.** Arayüz değişikliklerinde
`npm run dogrula` çalıştırın; sadece tip kontrolü yetmez.

## PostgREST ilişki tuzağı

İki tablo arasında birden çok yabancı anahtar varsa gömme (embed) belirsizdir
ve sorgu 400 döner:

- `students` → `users`: `user_id` **ve** `mentor_teacher_id` üzerinden.
  Çözüm: `users!students_user_id_fkey(...)`
- `etuts` → `users`: doğrudan ilişki **yoktur** (`teacher_id` → `teachers`).
  Çözüm: ad/soyad `v_ogretmen_dizini` görünümünden ayrı çekilir.

İkisi de sessiz "kayıt yok" olarak görünmüştü; sorgu hatalarını artık
yutmuyoruz.

## Velinin veri sınırı

Veli **yalnızca** bağlı olduğu öğrencileri görür ve bu kısıt üç katmanda durur:

1. `v_velinin_ogrencileri` görünümü `parent_students` üzerinden `auth.uid()`'e
   bağlıdır ve yalnızca ad/soyad/okul no/sınıf verir — telefon ve e-posta yok.
2. `ogrenci_etut_gecmisi()` fonksiyonu SECURITY DEFINER'dır (doluluk ve öğretmen
   adı için gerekli), bu yüzden yetkiyi kendi içinde `ogrenciyi_gorebilir()` ile
   kontrol eder ve yabancı öğrenci istenirse hata fırlatır.
3. Sayfa, adres çubuğundan gelen öğrenci kimliğini velinin kendi listesiyle
   eşleştirir; eşleşmeyen kimlik yok sayılıp kendi çocuğuna düşülür.

Katılım yüzdesinin paydası TOPLAM etüt değil, **yoklaması alınmış** etüttür.
Öğretmen henüz yoklama almadıysa o etüt hesaba girmez; aksi hâlde veli
"katılım %50" görüp çocuğunun gelmediğini sanardı. Yoklama hiç alınmamışsa
yüzde yerine "—" yazılır.
