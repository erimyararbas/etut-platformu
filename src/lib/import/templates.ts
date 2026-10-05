/**
 * Excel içe aktarım şablonlarının TEK kaynağı.
 *
 * Hem `scripts/generate-templates.ts` (okula gönderilen .xlsx dosyalarını üretir)
 * hem de yükleme ayrıştırıcısı bu tanımları kullanır; böylece şablonun kolonları
 * ile doğrulama kuralları asla birbirinden ayrışamaz.
 */

import tymm from "@/data/tymm.json";

export const SEVIYELER = [
  "Hazırlık",
  "9. Sınıf",
  "10. Sınıf",
  "11. Sınıf",
  "12. Sınıf",
] as const;

export const EVET_HAYIR = ["E", "H"] as const;
export const DURUMLAR = ["Aktif", "Pasif"] as const;
export const YAKINLIKLAR = ["Anne", "Baba", "Vasi", "Diğer"] as const;

/** Prototipteki etüt türleri — okul bu listeyi kısaltıp uzatabilir. */
export const VARSAYILAN_ETUT_TURLERI = [
  "Konu Anlatımı",
  "Soru Çözümü",
  "Deneme Analizi",
  "Ödev Kontrolü",
  "Birebir",
  "Grup Etüdü",
  "Tekrar Dersi",
  "Sınıf Etüdü",
] as const;

export type ColumnType = "text" | "number" | "enum" | "phone" | "email" | "bool";

export interface TemplateColumn {
  /** Veritabanı/parser tarafındaki teknik ad. */
  key: string;
  /** Excel'de görünen Türkçe başlık. */
  header: string;
  required: boolean;
  type: ColumnType;
  /** enum kolonlarında açılır liste değerleri. */
  enumValues?: readonly string[];
  width: number;
  /** "Açıklama" sayfasındaki açıklama metni. */
  help: string;
  /** "Açıklama" sayfasındaki örnek değer. */
  example: string;
  /** Başka bir şablondaki değere karşılık gelmeli (çapraz referans doğrulaması). */
  refTemplate?: TemplateId;
  refColumn?: string;
  /** Virgülle ayrılmış çoklu değer kabul eder. */
  multi?: boolean;
  /** number sütunlarında izin verilen en küçük değer. */
  min?: number;
}

export type TemplateId =
  | "siniflar"
  | "dersler"
  | "konular"
  | "derslikler"
  | "etut_turleri"
  | "ogretmenler"
  | "ogrenciler"
  | "veliler";

export interface TemplateDef {
  id: TemplateId;
  /** Yükleme sırası — önceki şablonlar yüklenmeden sonrakiler kabul edilmez. */
  order: number;
  fileName: string;
  title: string;
  sheetName: string;
  description: string;
  dependsOn: TemplateId[];
  /**
   * Bir satırı benzersiz kılan sütunlar. Aynı anahtar ikinci kez geldiğinde
   * kayıt GÜNCELLENİR (upsert); dosya içinde iki kez geçerse hata verilir.
   */
  uniqueKey: string[];
  columns: TemplateColumn[];
  /** Veri sayfasına önceden basılan GERÇEK veri (okul gözden geçirip düzeltir). */
  preFilled?: Record<string, string | number>[];
  /** Yalnızca "Açıklama" sayfasında gösterilen örnek satırlar. */
  examples: Record<string, string>[];
  notes: string[];
}

const konularPreFilled = (
  tymm.subjects as { ders: string; grades: Record<string, string[]> }[]
).flatMap((s) =>
  SEVIYELER.flatMap((seviye) =>
    (s.grades[seviye] ?? []).map((konu, i) => ({
      ders_adi: s.ders,
      seviye: seviye as string,
      konu_adi: konu,
      sira: i + 1,
    })),
  ),
);

export const TEMPLATES: TemplateDef[] = [
  {
    id: "siniflar",
    order: 1,
    fileName: "01_siniflar.xlsx",
    title: "Sınıflar / Şubeler",
    sheetName: "Sınıflar",
    description:
      "Okuldaki tüm sınıf şubeleri. Öğrenciler bu kodlarla eşleştirilir; etüt oluştururken “katılabilecek sınıflar” listesi de buradan gelir.",
    dependsOn: [],
    uniqueKey: ["sinif_kodu"],
    columns: [
      {
        key: "sinif_kodu",
        header: "Sınıf Kodu",
        required: true,
        type: "text",
        width: 14,
        help: "Okulda kullandığınız kısa kod. Öğrenci listesindeki “Sınıf Kodu” ile birebir aynı yazılmalı.",
        example: "11-A",
      },
      {
        key: "seviye",
        header: "Seviye",
        required: true,
        type: "enum",
        enumValues: SEVIYELER,
        width: 14,
        help: "Sınıf düzeyi. Konu (TYMM) listesi bu seviyeye göre eşleşir.",
        example: "11. Sınıf",
      },
      {
        key: "sube",
        header: "Şube",
        required: false,
        type: "text",
        width: 10,
        help: "Şube harfi. Boş bırakırsanız sınıf kodundan otomatik çıkarılır.",
        example: "A",
      },
      {
        key: "aciklama",
        header: "Açıklama",
        required: false,
        type: "text",
        width: 30,
        help: "İsteğe bağlı not (ör. Sayısal, Eşit Ağırlık).",
        example: "Sayısal",
      },
    ],
    examples: [
      { sinif_kodu: "11-A", seviye: "11. Sınıf", sube: "A", aciklama: "Sayısal" },
      { sinif_kodu: "11-B", seviye: "11. Sınıf", sube: "B", aciklama: "Eşit Ağırlık" },
      { sinif_kodu: "12-A", seviye: "12. Sınıf", sube: "A", aciklama: "" },
    ],
    notes: [
      "Sınıf kodu okul içinde benzersiz olmalıdır.",
      "Aynı dosyayı tekrar yüklerseniz mevcut sınıflar güncellenir, silinmez.",
    ],
  },

  {
    id: "dersler",
    order: 2,
    fileName: "02_dersler.xlsx",
    title: "Dersler",
    sheetName: "Dersler",
    description:
      "Etüt açılabilecek dersler. Öğretmen branşı, konu listesi ve etüt oluşturma ekranı bu listeden beslenir.",
    dependsOn: [],
    uniqueKey: ["ders_adi"],
    columns: [
      {
        key: "ders_adi",
        header: "Ders Adı",
        required: true,
        type: "text",
        width: 28,
        help: "Dersin tam adı. Konu ve öğretmen listelerinde birebir aynı yazılmalı.",
        example: "Matematik",
      },
      {
        key: "kisa_kod",
        header: "Kısa Kod",
        required: false,
        type: "text",
        width: 12,
        help: "İsteğe bağlı kısaltma (ör. MAT). Dar ekranlarda kullanılır.",
        example: "MAT",
      },
      {
        key: "aktif",
        header: "Aktif",
        required: true,
        type: "enum",
        enumValues: EVET_HAYIR,
        width: 8,
        help: "E = ders kullanımda, H = pasif (listelerde görünmez).",
        example: "E",
      },
    ],
    preFilled: (tymm.subjects as { ders: string }[]).map((s) => ({
      ders_adi: s.ders,
      kisa_kod: "",
      aktif: "E",
    })),
    examples: [{ ders_adi: "Geometri", kisa_kod: "GEO", aktif: "E" }],
    notes: [
      "Dosya, prototipte kullanılan 9 ders ile önceden doldurulmuştur.",
      "Kullanmadığınız dersin “Aktif” sütununu H yapın veya satırı silin.",
      "Eksik dersleri alta ekleyebilirsiniz.",
    ],
  },

  {
    id: "konular",
    order: 3,
    fileName: "03_konular_TYMM.xlsx",
    title: "Konular (TYMM)",
    sheetName: "Konular",
    description:
      "Ders × Sınıf Seviyesi × Konu ağacı. Öğretmen etüt açarken ve hedef atarken konuyu bu listeden seçer.",
    dependsOn: ["dersler"],
    uniqueKey: ["ders_adi", "seviye", "konu_adi"],
    columns: [
      {
        key: "ders_adi",
        header: "Ders Adı",
        required: true,
        type: "text",
        width: 26,
        help: "02_dersler.xlsx içindeki bir ders adıyla birebir aynı olmalı.",
        example: "Matematik",
        refTemplate: "dersler",
        refColumn: "ders_adi",
      },
      {
        key: "seviye",
        header: "Seviye",
        required: true,
        type: "enum",
        enumValues: SEVIYELER,
        width: 14,
        help: "Konunun okutulduğu sınıf seviyesi.",
        example: "11. Sınıf",
      },
      {
        key: "konu_adi",
        header: "Konu Adı",
        required: true,
        type: "text",
        width: 46,
        help: "Müfredattaki ünite / konu adı.",
        example: "Türev",
      },
      {
        key: "sira",
        header: "Sıra",
        required: false,
        type: "number",
        min: 0,
        width: 8,
        help: "Konunun listede görünme sırası. Boş bırakılırsa dosyadaki sıra kullanılır.",
        example: "1",
      },
    ],
    preFilled: konularPreFilled,
    examples: [
      { ders_adi: "Matematik", seviye: "11. Sınıf", konu_adi: "Türev", sira: "4" },
    ],
    notes: [
      `Dosya güncel müfredata göre önceden doldurulmuştur (${konularPreFilled.length} satır).`,
      "Zümreleriniz gözden geçirip düzeltsin; ihtiyaç duyduğunuz alt konuları ekleyebilirsiniz.",
      "Aynı ders + seviye + konu adı ikinci kez yazılırsa tek kayıt olarak güncellenir.",
    ],
  },

  {
    id: "derslikler",
    order: 4,
    fileName: "04_derslikler.xlsx",
    title: "Derslikler",
    sheetName: "Derslikler",
    description:
      "Etütlerin yapılacağı odalar. Sistem aynı odaya aynı saatte iki etüt açılmasını engeller ve kontenjanın oda kapasitesini aşmasına izin vermez.",
    dependsOn: [],
    uniqueKey: ["oda_kodu"],
    columns: [
      {
        key: "oda_kodu",
        header: "Oda Kodu",
        required: true,
        type: "text",
        width: 14,
        help: "Okulda kullandığınız oda kodu.",
        example: "B-204",
      },
      {
        key: "bina",
        header: "Bina",
        required: false,
        type: "text",
        width: 16,
        help: "İsteğe bağlı bina adı.",
        example: "B Blok",
      },
      {
        key: "kat",
        header: "Kat",
        required: false,
        type: "text",
        width: 8,
        help: "İsteğe bağlı kat bilgisi.",
        example: "2",
      },
      {
        key: "kapasite",
        header: "Kapasite",
        required: true,
        type: "number",
        min: 1,
        width: 10,
        help: "Odanın alabileceği öğrenci sayısı. Etüt kontenjanı bu sayıyı aşamaz.",
        example: "24",
      },
      {
        key: "aktif",
        header: "Aktif",
        required: true,
        type: "enum",
        enumValues: EVET_HAYIR,
        width: 8,
        help: "E = kullanılabilir, H = kullanım dışı.",
        example: "E",
      },
    ],
    examples: [
      { oda_kodu: "B-204", bina: "B Blok", kat: "2", kapasite: "24", aktif: "E" },
      { oda_kodu: "C-110", bina: "C Blok", kat: "1", kapasite: "20", aktif: "E" },
    ],
    notes: ["Oda kodu okul içinde benzersiz olmalıdır."],
  },

  {
    id: "etut_turleri",
    order: 5,
    fileName: "05_etut_turleri.xlsx",
    title: "Etüt Türleri",
    sheetName: "Etüt Türleri",
    description:
      "Öğretmenin etüt açarken seçebileceği türler. Öğretmen listesindeki “Verebileceği Etüt Türleri” sütunu bu adlara referans verir.",
    dependsOn: [],
    uniqueKey: ["tur_adi"],
    columns: [
      {
        key: "tur_adi",
        header: "Tür Adı",
        required: true,
        type: "text",
        width: 24,
        help: "Etüt türünün adı.",
        example: "Soru Çözümü",
      },
      {
        key: "aktif",
        header: "Aktif",
        required: true,
        type: "enum",
        enumValues: EVET_HAYIR,
        width: 8,
        help: "E = kullanımda, H = pasif.",
        example: "E",
      },
    ],
    preFilled: VARSAYILAN_ETUT_TURLERI.map((t) => ({ tur_adi: t, aktif: "E" })),
    examples: [{ tur_adi: "Deneme Analizi", aktif: "E" }],
    notes: [
      "Dosya prototipteki türlerle önceden doldurulmuştur.",
      "“Sınıf Etüdü” özel bir türdür: seçildiğinde kontenjan otomatik olarak seçilen sınıfların mevcuduna eşitlenir ve tüm öğrenciler otomatik atanır.",
    ],
  },

  {
    id: "ogretmenler",
    order: 6,
    fileName: "06_ogretmenler.xlsx",
    title: "Öğretmenler",
    sheetName: "Öğretmenler",
    description:
      "Etüt açacak öğretmenler. Her öğretmen yalnızca kendi branşındaki dersten etüt açabilir.",
    dependsOn: ["dersler", "etut_turleri"],
    uniqueKey: ["eposta"],
    columns: [
      {
        key: "ad",
        header: "Ad",
        required: true,
        type: "text",
        width: 16,
        help: "Öğretmenin adı.",
        example: "Ahmet",
      },
      {
        key: "soyad",
        header: "Soyad",
        required: true,
        type: "text",
        width: 16,
        help: "Öğretmenin soyadı.",
        example: "Yılmaz",
      },
      {
        key: "eposta",
        header: "E-posta",
        required: true,
        type: "email",
        width: 30,
        help: "Giriş kimliği olarak kullanılır ve okul içinde benzersiz olmalıdır. Öğrenci listesindeki “Mentör Öğretmen E-posta” bu adrese referans verir.",
        example: "ahmet.yilmaz@okul.k12.tr",
      },
      {
        key: "telefon",
        header: "Telefon",
        required: false,
        type: "phone",
        width: 18,
        help: "05XX XXX XX XX biçiminde. SMS bildirimi açıldığında kullanılacaktır.",
        example: "0532 111 22 33",
      },
      {
        key: "brans_ders_adi",
        header: "Branş (Ders Adı)",
        required: true,
        type: "text",
        width: 26,
        help: "02_dersler.xlsx içindeki bir ders adıyla birebir aynı olmalı.",
        example: "Matematik",
        refTemplate: "dersler",
        refColumn: "ders_adi",
      },
      {
        key: "verebilecegi_etut_turleri",
        header: "Verebileceği Etüt Türleri",
        required: false,
        type: "text",
        multi: true,
        width: 40,
        help: "Virgülle ayırın. Boş bırakılırsa tüm aktif türlere izin verilir.",
        example: "Soru Çözümü, Konu Anlatımı, Birebir",
        refTemplate: "etut_turleri",
        refColumn: "tur_adi",
      },
      {
        key: "mentor_mu",
        header: "Mentör mü?",
        required: true,
        type: "enum",
        enumValues: EVET_HAYIR,
        width: 12,
        help: "E ise öğrencilere mentör olarak atanabilir.",
        example: "E",
      },
      {
        /**
         * ZORUNLU DEĞİL: bir okulda bir veya iki rehber öğretmen olur. Altmış
         * satırın elli sekizine "H" yazdırmak, gerçek cevabı gürültüye
         * gömerdi. Boş bırakmak "hayır" demektir.
         */
        key: "rehber_mi",
        header: "Rehber mi?",
        required: false,
        type: "enum",
        enumValues: EVET_HAYIR,
        width: 12,
        help:
          "E ise rehberlik servisi paneline erişir. Rehberlik görüşme kayıtlarını " +
          "okul yönetimi bile göremez; bu yetkiyi yalnızca rehber öğretmenlere verin. " +
          "Boş bırakmak H ile aynıdır.",
        example: "H",
      },
      {
        key: "durum",
        header: "Durum",
        required: true,
        type: "enum",
        enumValues: DURUMLAR,
        width: 10,
        help: "Pasif öğretmen sisteme giriş yapamaz.",
        example: "Aktif",
      },
    ],
    examples: [
      {
        ad: "Ahmet",
        soyad: "Yılmaz",
        eposta: "ahmet.yilmaz@okul.k12.tr",
        telefon: "0532 111 22 33",
        brans_ders_adi: "Matematik",
        verebilecegi_etut_turleri: "Soru Çözümü, Konu Anlatımı, Birebir",
        mentor_mu: "E",
        rehber_mi: "H",
        durum: "Aktif",
      },
      {
        ad: "Selin",
        soyad: "Kaya",
        eposta: "selin.kaya@okul.k12.tr",
        telefon: "0533 444 55 66",
        brans_ders_adi: "Kimya",
        verebilecegi_etut_turleri: "",
        mentor_mu: "H",
        rehber_mi: "E",
        durum: "Aktif",
      },
    ],
    notes: [
      "E-posta benzersiz olmalıdır; aynı e-posta ikinci kez gelirse kayıt güncellenir.",
      "Yükleme sonrası her öğretmen için tek kullanımlık davet kodu üretilir; bu kodları listeden dışa aktarıp dağıtabilirsiniz.",
      'Rehber mi? sütunu yetki VERİR, geri ALMAZ: E yazıp yükledikten sonra H yapıp yeniden yüklemek yetkiyi kaldırmaz. Geri almak için Yönetim → Kullanıcılar ekranını kullanın.',
    ],
  },

  {
    id: "ogrenciler",
    order: 7,
    fileName: "07_ogrenciler.xlsx",
    title: "Öğrenciler",
    sheetName: "Öğrenciler",
    description:
      "Tüm öğrenciler. Öğrenci giriş yaparken okul numarasını kullanır.",
    dependsOn: ["siniflar", "ogretmenler"],
    uniqueKey: ["okul_no"],
    columns: [
      {
        key: "okul_no",
        header: "Okul No",
        required: true,
        type: "text",
        width: 12,
        help: "Öğrencinin okul numarası. Giriş kimliğidir, okul içinde benzersiz olmalıdır.",
        example: "248",
      },
      {
        key: "ad",
        header: "Ad",
        required: true,
        type: "text",
        width: 16,
        help: "Öğrencinin adı.",
        example: "Elif",
      },
      {
        key: "soyad",
        header: "Soyad",
        required: true,
        type: "text",
        width: 16,
        help: "Öğrencinin soyadı.",
        example: "Demir",
      },
      {
        key: "sinif_kodu",
        header: "Sınıf Kodu",
        required: true,
        type: "text",
        width: 14,
        help: "01_siniflar.xlsx içindeki bir sınıf koduyla birebir aynı olmalı.",
        example: "11-A",
        refTemplate: "siniflar",
        refColumn: "sinif_kodu",
      },
      {
        key: "telefon",
        header: "Telefon",
        required: false,
        type: "phone",
        width: 18,
        help: "Öğrencinin kendi numarası. SMS bildirimi açıldığında kullanılacaktır.",
        example: "0535 222 33 44",
      },
      {
        key: "eposta",
        header: "E-posta",
        required: false,
        type: "email",
        width: 30,
        help: "Varsa öğrenci e-postası. Zorunlu değildir; giriş okul numarasıyla yapılır.",
        example: "elif.demir@ogrenci.okul.k12.tr",
      },
      {
        key: "mentor_ogretmen_eposta",
        header: "Mentör Öğretmen E-posta",
        required: false,
        type: "email",
        width: 32,
        help: "06_ogretmenler.xlsx içindeki, “Mentör mü?” sütunu E olan bir öğretmenin e-postası. Sonradan panelden de atanabilir.",
        example: "ahmet.yilmaz@okul.k12.tr",
        refTemplate: "ogretmenler",
        refColumn: "eposta",
      },
      {
        key: "durum",
        header: "Durum",
        required: true,
        type: "enum",
        enumValues: DURUMLAR,
        width: 10,
        help: "Pasif öğrenci sisteme giriş yapamaz ve etüt listelerinde görünmez.",
        example: "Aktif",
      },
    ],
    examples: [
      {
        okul_no: "248",
        ad: "Elif",
        soyad: "Demir",
        sinif_kodu: "11-A",
        telefon: "0535 222 33 44",
        eposta: "",
        mentor_ogretmen_eposta: "ahmet.yilmaz@okul.k12.tr",
        durum: "Aktif",
      },
      {
        okul_no: "251",
        ad: "Kaan",
        soyad: "Yıldız",
        sinif_kodu: "11-A",
        telefon: "",
        eposta: "",
        mentor_ogretmen_eposta: "",
        durum: "Aktif",
      },
    ],
    notes: [
      "Okul numarası benzersiz olmalıdır; aynı numara ikinci kez gelirse kayıt güncellenir.",
      "Sınıf değişikliği için öğrenciyi silmenize gerek yok — yeni sınıf koduyla dosyayı tekrar yükleyin.",
      "Bu dosyayı yüklemeden önce 01_siniflar.xlsx ve 06_ogretmenler.xlsx yüklenmiş olmalıdır.",
    ],
  },

  {
    id: "veliler",
    order: 8,
    fileName: "08_veliler.xlsx",
    title: "Veliler",
    sheetName: "Veliler",
    description:
      "Veliler ve bağlı oldukları öğrenciler. Veli yalnızca kendi öğrencisinin bilgilerini görebilir.",
    dependsOn: ["ogrenciler"],
    uniqueKey: ["telefon", "ogrenci_okul_no"],
    columns: [
      {
        key: "ad",
        header: "Ad",
        required: true,
        type: "text",
        width: 16,
        help: "Velinin adı.",
        example: "Hakan",
      },
      {
        key: "soyad",
        header: "Soyad",
        required: true,
        type: "text",
        width: 16,
        help: "Velinin soyadı.",
        example: "Demir",
      },
      {
        key: "telefon",
        header: "Telefon",
        required: true,
        type: "phone",
        width: 18,
        help: "Velinin giriş kimliğidir; okul içinde benzersiz olmalıdır. 05XX XXX XX XX biçiminde.",
        example: "0532 777 88 99",
      },
      {
        key: "eposta",
        header: "E-posta",
        required: false,
        type: "email",
        width: 30,
        help: "Varsa veli e-postası. E-posta bildirimi açıldığında kullanılacaktır.",
        example: "hakan.demir@ornek.com",
      },
      {
        key: "ogrenci_okul_no",
        header: "Öğrenci Okul No",
        required: true,
        type: "text",
        width: 16,
        help: "07_ogrenciler.xlsx içindeki bir okul numarası.",
        example: "248",
        refTemplate: "ogrenciler",
        refColumn: "okul_no",
      },
      {
        key: "yakinlik",
        header: "Yakınlık",
        required: true,
        type: "enum",
        enumValues: YAKINLIKLAR,
        width: 12,
        help: "Velinin öğrenciye yakınlığı.",
        example: "Baba",
      },
    ],
    examples: [
      {
        ad: "Hakan",
        soyad: "Demir",
        telefon: "0532 777 88 99",
        eposta: "",
        ogrenci_okul_no: "248",
        yakinlik: "Baba",
      },
      {
        ad: "Ayşe",
        soyad: "Demir",
        telefon: "0533 111 00 22",
        eposta: "",
        ogrenci_okul_no: "248",
        yakinlik: "Anne",
      },
      {
        ad: "Hakan",
        soyad: "Demir",
        telefon: "0532 777 88 99",
        eposta: "",
        ogrenci_okul_no: "402",
        yakinlik: "Baba",
      },
    ],
    notes: [
      "BİR SATIR = BİR VELİ-ÖĞRENCİ BAĞI.",
      "Aynı velinin okulda iki çocuğu varsa aynı telefonla iki satır yazın (yukarıdaki örneğe bakın).",
      "Bir öğrencinin birden çok velisi varsa her veli için ayrı satır yazın.",
      "Bu dosyayı yüklemeden önce 07_ogrenciler.xlsx yüklenmiş olmalıdır.",
    ],
  },
];

export const TEMPLATES_BY_ID = Object.fromEntries(
  TEMPLATES.map((t) => [t.id, t]),
) as Record<TemplateId, TemplateDef>;

export function templatesInOrder(): TemplateDef[] {
  return [...TEMPLATES].sort((a, b) => a.order - b.order);
}
