/**
 * Ayrıştırılmış Excel satırlarını veritabanına yazan katman.
 *
 * Tasarım kararları:
 *
 * 1. TEK TRANSACTION. Satırlar ya tamamen uygulanır ya hiç uygulanmaz. Hatalı
 *    satırlar zaten önizlemede ayıklanmıştır; bu aşamada beklenmedik bir hata
 *    olursa veritabanı yükleme öncesindeki hâline döner.
 *
 * 2. SİLME YOK. Dosyada olmayan kayıt silinmez, dokunulmaz. Yanlış dosya
 *    yüklemek veri kaybettiremez.
 *
 * 3. AUTH KULLANICISI TRANSACTION DIŞINDA. Supabase Auth kullanıcıları HTTP
 *    üzerinden oluşturulur, SQL transaction'ına giremez. Bu yüzden önce
 *    oluşturulur, sonra transaction açılır. İşlem idempotenttir: auth kullanıcısı
 *    sabit (okul no / telefon / e-postadan türeyen) bir kimlikle bulunur veya
 *    oluşturulur, dolayısıyla yarıda kalan bir yükleme tekrar denendiğinde
 *    çift kayıt üretmez — artakalan auth kullanıcısı da yeniden kullanılır.
 *
 * 4. VERİTABANI SOYUT. `DbClient` hem `pg.Client` hem PGlite tarafından
 *    karşılanır; böylece bu katmanın tamamı gömülü Postgres ile test edilebilir.
 */

import {
  TEMPLATES_BY_ID,
  SEVIYELER,
  type TemplateId,
} from "./templates";
import { refKey, type AyristirilmisSatir, type ImportLookups } from "./parse";
import { davetKoduUret, davetKoduOzeti, davetSonKullanma } from "./davet";
// Sentetik e-posta bir KİMLİK meselesidir; tek tanımı auth katmanındadır.
import { sentetikEposta } from "@/lib/auth/kimlik";

export { sentetikEposta };

// ---------------------------------------------------------------------------
// Dış bağımlılıklar
// ---------------------------------------------------------------------------

export interface DbClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}

/**
 * Supabase Auth'un kullanıcı yönetimi. Testlerde sahte bir uygulamayla
 * değiştirilir; üretimde `supabase.auth.admin` kullanır.
 */
export interface AuthSaglayici {
  /**
   * Var olan auth kullanıcılarını TEK sorguda bulur: refKey(eposta) → kimlik.
   *
   * Neden ayrı: oluşturma çağrıları paralel yapılıyor ve tek bir `pg` bağlantısı
   * eşzamanlı sorgu kaldırmaz ("client.query() when the client is already
   * executing a query"). Veritabanına dokunan kısım burada, tek seferde biter;
   * paralel çalışan `olustur` yalnızca HTTP yapar.
   */
  mevcutlariBul(epostalar: string[]): Promise<Map<string, string>>;
  /** Yalnızca bulunamayanlar için çağrılır. Veritabanına DOKUNMAZ. */
  olustur(eposta: string): Promise<string>;
}

export interface DavetKaydi {
  ad: string;
  soyad: string;
  /** Kullanıcının giriş yaparken yazacağı kimlik: okul no, e-posta veya telefon. */
  kimlik: string;
  rol: string;
  kod: string;
}

export interface UygulamaSonucu {
  batchId: string;
  eklendi: number;
  guncellendi: number;
  hataliAtlandi: number;
  /** Yeni oluşturulan kullanıcıların tek kullanımlık giriş kodları. */
  davetKodlari: DavetKaydi[];
}

export interface UygulamaGirdisi {
  schoolId: string;
  templateId: TemplateId;
  satirlar: AyristirilmisSatir[];
  /** İşlemi yapan yöneticinin kullanıcı kimliği. */
  yukleyenId: string;
  dosyaAdi: string;
  authSaglayici?: AuthSaglayici;
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

async function tek<T>(db: DbClient, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query<T>(sql, params);
  return rows[0];
}

/** Sınıf seviyeleri veriden gelir; yoksa standart liste ile oluşturulur. */
async function seviyeleriHazirla(db: DbClient, schoolId: string): Promise<Map<string, string>> {
  for (const [i, ad] of SEVIYELER.entries()) {
    await db.query(
      `insert into grade_levels (school_id, ad, sira) values ($1, $2, $3)
       on conflict (school_id, ad) do update set sira = excluded.sira`,
      [schoolId, ad, i],
    );
  }
  const { rows } = await db.query<{ id: string; ad: string }>(
    `select id, ad from grade_levels where school_id = $1`,
    [schoolId],
  );
  return new Map(rows.map((r) => [refKey(r.ad), r.id]));
}

async function haritaGetir(
  db: DbClient,
  sql: string,
  params: unknown[],
): Promise<Map<string, string>> {
  const { rows } = await db.query<{ id: string; anahtar: string }>(sql, params);
  return new Map(rows.map((r) => [refKey(r.anahtar), r.id]));
}

// ---------------------------------------------------------------------------
// Önizleme için gereken mevcut veri
// ---------------------------------------------------------------------------

/**
 * Ayrıştırıcının "ekle mi güncelle mi" kararını ve çapraz referans kontrolünü
 * yapabilmesi için veritabanındaki mevcut anahtarları toplar.
 */
export async function lookupsGetir(
  db: DbClient,
  schoolId: string,
  templateId: TemplateId,
): Promise<ImportLookups> {
  const kumeGetir = async (sql: string): Promise<Set<string>> => {
    const { rows } = await db.query<{ anahtar: string }>(sql, [schoolId]);
    return new Set(rows.map((r) => refKey(r.anahtar)));
  };

  const mevcutSorgulari: Record<TemplateId, string> = {
    siniflar: `select kod as anahtar from classes where school_id = $1`,
    dersler: `select ad as anahtar from subjects where school_id = $1`,
    konular: `select s.ad || chr(1) || g.ad || chr(1) || t.ad as anahtar
              from topics t
              join subjects s on s.id = t.subject_id
              join grade_levels g on g.id = t.grade_level_id
              where t.school_id = $1`,
    derslikler: `select kod as anahtar from rooms where school_id = $1`,
    etut_turleri: `select ad as anahtar from etut_types where school_id = $1`,
    ogretmenler: `select u.eposta as anahtar from teachers t
                  join users u on u.id = t.user_id
                  where t.school_id = $1 and u.eposta is not null`,
    ogrenciler: `select okul_no as anahtar from students where school_id = $1`,
    veliler: `select u.telefon || chr(1) || st.okul_no as anahtar
              from parent_students ps
              join users u on u.id = ps.parent_user_id
              join students st on st.user_id = ps.student_id
              where ps.school_id = $1 and u.telefon is not null`,
  };

  // "konular" ve "veliler" birleşik anahtar kullanır; ayrıştırıcı da aynı
  // ayırıcıyla (chr(1) = ) kurar.
  const mevcut = await kumeGetir(mevcutSorgulari[templateId]);

  const referanslar: ImportLookups["referanslar"] = {};
  for (const col of TEMPLATES_BY_ID[templateId].columns) {
    if (!col.refTemplate || referanslar[col.refTemplate]) continue;
    referanslar[col.refTemplate] = await kumeGetir(mevcutSorgulari[col.refTemplate]);
  }

  return { mevcut, referanslar };
}

// ---------------------------------------------------------------------------
// Satır işleyicileri
//
// TOPLU YAZMA. İlk sürüm satır başına bir sorgu atıyordu; Frankfurt'taki
// veritabanına her gidiş-dönüş ~200 ms sürdüğü için 158 satırlık konu dosyası
// 33 saniye alıyordu. 1.248 öğrencilik gerçek bir dosya dakikalar sürer ve
// sunucusuz ortamda zaman aşımına uğrardı.
//
// Bu yüzden her şablon TEK sorguda yazılır: değerler dizi olarak gönderilip
// `unnest` ile satırlara açılır. Gidiş-dönüş sayısı satır sayısından bağımsız
// hale gelir.
//
// `on conflict do update` aynı anahtarın tek ifadede iki kez geçmesine izin
// vermez ("cannot affect row a second time"). Bu bizim için sorun değil:
// ayrıştırıcı dosya içindeki tekrarları zaten hata olarak ayıklıyor.
// ---------------------------------------------------------------------------

interface Baglam {
  db: DbClient;
  schoolId: string;
  slug: string;
  seviyeler: Map<string, string>;
  dersler: Map<string, string>;
  siniflar: Map<string, string>;
  turler: Map<string, string>;
  ogretmenler: Map<string, string>;
  ogrenciler: Map<string, string>;
  /** e-posta → auth kullanıcı kimliği (transaction öncesi hazırlandı) */
  authIds: Map<string, string>;
  davetler: DavetKaydi[];
}

export interface YazmaSonucu {
  eklendi: number;
  guncellendi: number;
}

type Isleyici = (
  ctx: Baglam,
  degerler: Record<string, unknown>[],
) => Promise<YazmaSonucu>;

/** `xmax = 0` yalnızca INSERT edilen satırlarda doğrudur; UPDATE'te değildir. */
function say(rows: { eklendi: boolean }[]): YazmaSonucu {
  const eklendi = rows.filter((r) => r.eklendi).length;
  return { eklendi, guncellendi: rows.length - eklendi };
}

/** Bir sütunu dizi olarak çıkarır. */
const kolon = <T>(d: Record<string, unknown>[], k: string, don: (v: unknown) => T): T[] =>
  d.map((x) => don(x[k]));

const metin = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const zorunluMetin = (v: unknown): string => String(v);

/**
 * Kullanıcı satırlarını toplu yazar, rollerini ekler ve şifresini henüz
 * belirlememiş olanlara tek kullanımlık davet kodu üretir.
 *
 * Aynı kişi birden çok satırda geçebilir (bir veli iki çocuğuna bağlıysa);
 * bu yüzden kimliğe göre tekilleştirilir.
 */
async function kullanicilariYaz(
  ctx: Baglam,
  kisiler: {
    authId: string;
    ad: string;
    soyad: string;
    eposta: string | null;
    telefon: string | null;
    durum: string;
    roller: string[];
    kimlik: string;
    rolEtiketi: string;
  }[],
): Promise<Map<string, boolean>> {
  const tekil = new Map<string, (typeof kisiler)[number]>();
  for (const k of kisiler) if (!tekil.has(k.authId)) tekil.set(k.authId, k);
  const liste = [...tekil.values()];
  if (!liste.length) return new Map();

  const { rows } = await ctx.db.query<{ id: string; eklendi: boolean }>(
    `insert into users (id, school_id, ad, soyad, eposta, telefon, durum)
     select x.id, $1, x.ad, x.soyad, x.eposta, x.telefon, x.durum::kayit_durumu
     from unnest($2::uuid[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[])
          as x(id, ad, soyad, eposta, telefon, durum)
     on conflict (id) do update set
       ad = excluded.ad, soyad = excluded.soyad,
       eposta = excluded.eposta, telefon = excluded.telefon,
       durum = excluded.durum
     returning id, (xmax = 0) as eklendi`,
    [
      ctx.schoolId,
      liste.map((k) => k.authId),
      liste.map((k) => k.ad),
      liste.map((k) => k.soyad),
      liste.map((k) => k.eposta),
      liste.map((k) => k.telefon),
      liste.map((k) => (k.durum === "Pasif" ? "pasif" : "aktif")),
    ],
  );

  // Roller: (kullanıcı, rol) çiftleri düzleştirilir.
  const rolKullanici: string[] = [];
  const rolAd: string[] = [];
  for (const k of liste) {
    for (const r of k.roller) {
      rolKullanici.push(k.authId);
      rolAd.push(r);
    }
  }
  if (rolKullanici.length) {
    await ctx.db.query(
      `insert into user_roles (user_id, school_id, role)
       select x.uid, $1, x.rol::kullanici_rolu
       from unnest($2::uuid[], $3::text[]) as x(uid, rol)
       on conflict do nothing`,
      [ctx.schoolId, rolKullanici, rolAd],
    );
  }

  // Şifresini belirlememiş olanlara kod üret.
  const { rows: kodBekleyen } = await ctx.db.query<{ id: string }>(
    `select id from users where id = any($1::uuid[]) and not sifre_belirlendi_mi`,
    [liste.map((k) => k.authId)],
  );

  if (kodBekleyen.length) {
    const sonKullanma = davetSonKullanma().toISOString();
    const ids: string[] = [];
    const ozetler: string[] = [];
    for (const { id } of kodBekleyen) {
      const kisi = tekil.get(id)!;
      const kod = davetKoduUret();
      ids.push(id);
      ozetler.push(davetKoduOzeti(kod));
      ctx.davetler.push({
        ad: kisi.ad,
        soyad: kisi.soyad,
        kimlik: kisi.kimlik,
        rol: kisi.rolEtiketi,
        kod,
      });
    }
    await ctx.db.query(
      `update users u
          set setup_token_hash = x.ozet, setup_token_expires_at = $3::timestamptz
         from unnest($1::uuid[], $2::text[]) as x(id, ozet)
        where u.id = x.id`,
      [ids, ozetler, sonKullanma],
    );
  }

  return new Map(rows.map((r) => [r.id, r.eklendi]));
}

const ISLEYICILER: Record<TemplateId, Isleyici> = {
  siniflar: async (ctx, d) => {
    const { rows } = await ctx.db.query<{ id: string; kod: string; eklendi: boolean }>(
      `insert into classes (school_id, kod, grade_level_id, sube, aciklama)
       select $1, x.kod, x.gid, x.sube, x.aciklama
       from unnest($2::text[], $3::uuid[], $4::text[], $5::text[])
            as x(kod, gid, sube, aciklama)
       on conflict (school_id, kod) do update set
         grade_level_id = excluded.grade_level_id,
         sube = excluded.sube,
         aciklama = excluded.aciklama
       returning id, kod, (xmax = 0) as eklendi`,
      [
        ctx.schoolId,
        kolon(d, "sinif_kodu", zorunluMetin),
        d.map((x) => ctx.seviyeler.get(refKey(String(x.seviye))) ?? null),
        // Şube boşsa sınıf kodundan çıkarılır: "11-A" → "A".
        d.map((x) => (x.sube as string | null) ?? String(x.sinif_kodu).split(/[-/]/)[1] ?? null),
        kolon(d, "aciklama", metin),
      ],
    );
    for (const r of rows) ctx.siniflar.set(refKey(r.kod), r.id);
    return say(rows);
  },

  dersler: async (ctx, d) => {
    const { rows } = await ctx.db.query<{ id: string; ad: string; eklendi: boolean }>(
      `insert into subjects (school_id, ad, kisa_kod, aktif)
       select $1, x.ad, x.kod, x.aktif
       from unnest($2::text[], $3::text[], $4::boolean[]) as x(ad, kod, aktif)
       on conflict (school_id, ad) do update set
         kisa_kod = excluded.kisa_kod, aktif = excluded.aktif
       returning id, ad, (xmax = 0) as eklendi`,
      [
        ctx.schoolId,
        kolon(d, "ders_adi", zorunluMetin),
        kolon(d, "kisa_kod", metin),
        d.map((x) => x.aktif === "E"),
      ],
    );
    for (const r of rows) ctx.dersler.set(refKey(r.ad), r.id);
    return say(rows);
  },

  konular: async (ctx, d) => {
    const { rows } = await ctx.db.query<{ eklendi: boolean }>(
      `insert into topics (school_id, subject_id, grade_level_id, ad, sira)
       select $1, x.ders, x.seviye, x.ad, x.sira
       from unnest($2::uuid[], $3::uuid[], $4::text[], $5::int[])
            as x(ders, seviye, ad, sira)
       on conflict (subject_id, grade_level_id, ad) do update set sira = excluded.sira
       returning (xmax = 0) as eklendi`,
      [
        ctx.schoolId,
        d.map((x) => ctx.dersler.get(refKey(String(x.ders_adi))) ?? null),
        d.map((x) => ctx.seviyeler.get(refKey(String(x.seviye))) ?? null),
        kolon(d, "konu_adi", zorunluMetin),
        d.map((x) => (x.sira as number | null) ?? 0),
      ],
    );
    return say(rows);
  },

  derslikler: async (ctx, d) => {
    const { rows } = await ctx.db.query<{ eklendi: boolean }>(
      `insert into rooms (school_id, kod, bina, kat, kapasite, aktif)
       select $1, x.kod, x.bina, x.kat, x.kapasite, x.aktif
       from unnest($2::text[], $3::text[], $4::text[], $5::int[], $6::boolean[])
            as x(kod, bina, kat, kapasite, aktif)
       on conflict (school_id, kod) do update set
         bina = excluded.bina, kat = excluded.kat,
         kapasite = excluded.kapasite, aktif = excluded.aktif
       returning (xmax = 0) as eklendi`,
      [
        ctx.schoolId,
        kolon(d, "oda_kodu", zorunluMetin),
        kolon(d, "bina", metin),
        kolon(d, "kat", metin),
        d.map((x) => x.kapasite as number),
        d.map((x) => x.aktif === "E"),
      ],
    );
    return say(rows);
  },

  etut_turleri: async (ctx, d) => {
    const { rows } = await ctx.db.query<{ id: string; ad: string; eklendi: boolean }>(
      `insert into etut_types (school_id, ad, aktif)
       select $1, x.ad, x.aktif
       from unnest($2::text[], $3::boolean[]) as x(ad, aktif)
       on conflict (school_id, ad) do update set aktif = excluded.aktif
       returning id, ad, (xmax = 0) as eklendi`,
      [ctx.schoolId, kolon(d, "tur_adi", zorunluMetin), d.map((x) => x.aktif === "E")],
    );
    for (const r of rows) ctx.turler.set(refKey(r.ad), r.id);
    return say(rows);
  },

  ogretmenler: async (ctx, d) => {
    const kisiler = d.map((x) => {
      const eposta = String(x.eposta);
      return {
        authId: ctx.authIds.get(refKey(eposta))!,
        ad: String(x.ad),
        soyad: String(x.soyad),
        eposta,
        telefon: (x.telefon as string | null) ?? null,
        durum: String(x.durum),
        // Roller EKLENİR, çıkarılmaz (bkz. kullanicilariYaz: `on conflict do
        // nothing`). Yani "E" yazıp yükledikten sonra "H" yapmak yetkiyi geri
        // almaz; geri alma Yönetim → Kullanıcılar ekranından yapılır. Şablonun
        // notunda da böyle yazıyor.
        roller: [
          "ogretmen",
          ...(x.mentor_mu === "E" ? ["mentor"] : []),
          ...(x.rehber_mi === "E" ? ["rehber"] : []),
        ],
        kimlik: eposta,
        rolEtiketi: "Öğretmen",
      };
    });
    const eklendiMi = await kullanicilariYaz(ctx, kisiler);

    await ctx.db.query(
      `insert into teachers (user_id, school_id, brans_subject_id, verebilecegi_tur_ids, mentor_mu)
       select x.uid, $1, x.brans, x.turler::uuid[], x.mentor
       -- DİKKAT: unnest iki boyutlu diziyi düzleştirir, dolayısıyla "dizi
       -- sütunu" böyle taşınamaz. Her satırın tür listesi Postgres dizi
       -- söz dizimiyle ("{id1,id2}") metin olarak gönderilip burada çevrilir.
       from unnest($2::uuid[], $3::uuid[], $4::text[], $5::boolean[])
            as x(uid, brans, turler, mentor)
       on conflict (user_id) do update set
         brans_subject_id = excluded.brans_subject_id,
         verebilecegi_tur_ids = excluded.verebilecegi_tur_ids,
         mentor_mu = excluded.mentor_mu`,
      [
        ctx.schoolId,
        kisiler.map((k) => k.authId),
        d.map((x) => ctx.dersler.get(refKey(String(x.brans_ders_adi))) ?? null),
        d.map(
          (x) =>
            "{" +
            ((x.verebilecegi_etut_turleri as string[]) ?? [])
              .map((t) => ctx.turler.get(refKey(t)))
              .filter((v): v is string => !!v)
              .join(",") +
            "}",
        ),
        d.map((x) => x.mentor_mu === "E"),
      ],
    );

    for (const k of kisiler) ctx.ogretmenler.set(refKey(k.eposta), k.authId);
    return say(kisiler.map((k) => ({ eklendi: eklendiMi.get(k.authId) ?? false })));
  },

  ogrenciler: async (ctx, d) => {
    const kisiler = d.map((x) => {
      const okulNo = String(x.okul_no);
      return {
        authId: ctx.authIds.get(refKey(sentetikEposta(ctx.slug, "ogrenci", okulNo)))!,
        ad: String(x.ad),
        soyad: String(x.soyad),
        eposta: (x.eposta as string | null) ?? null,
        telefon: (x.telefon as string | null) ?? null,
        durum: String(x.durum),
        roller: ["ogrenci"],
        kimlik: okulNo,
        rolEtiketi: "Öğrenci",
      };
    });
    const eklendiMi = await kullanicilariYaz(ctx, kisiler);

    await ctx.db.query(
      `insert into students (user_id, school_id, okul_no, class_id, mentor_teacher_id)
       select x.uid, $1, x.no, x.sinif, x.mentor
       from unnest($2::uuid[], $3::text[], $4::uuid[], $5::uuid[])
            as x(uid, no, sinif, mentor)
       on conflict (user_id) do update set
         okul_no = excluded.okul_no,
         class_id = excluded.class_id,
         -- Dosyada mentör boş bırakılmışsa mevcut atamayı silme.
         mentor_teacher_id = coalesce(excluded.mentor_teacher_id, students.mentor_teacher_id)`,
      [
        ctx.schoolId,
        kisiler.map((k) => k.authId),
        kisiler.map((k) => k.kimlik),
        d.map((x) => ctx.siniflar.get(refKey(String(x.sinif_kodu))) ?? null),
        d.map((x) => {
          const m = x.mentor_ogretmen_eposta as string | null;
          return m ? (ctx.ogretmenler.get(refKey(m)) ?? null) : null;
        }),
      ],
    );

    for (const k of kisiler) ctx.ogrenciler.set(refKey(k.kimlik), k.authId);
    return say(kisiler.map((k) => ({ eklendi: eklendiMi.get(k.authId) ?? false })));
  },

  veliler: async (ctx, d) => {
    const kisiler = d.map((x) => {
      const telefon = String(x.telefon);
      return {
        authId: ctx.authIds.get(refKey(sentetikEposta(ctx.slug, "veli", telefon)))!,
        ad: String(x.ad),
        soyad: String(x.soyad),
        eposta: (x.eposta as string | null) ?? null,
        telefon,
        durum: "Aktif",
        roller: ["veli"],
        kimlik: telefon,
        rolEtiketi: "Veli",
      };
    });
    await kullanicilariYaz(ctx, kisiler);

    const yakinlikHarita: Record<string, string> = {
      Anne: "anne",
      Baba: "baba",
      Vasi: "vasi",
      Diğer: "diger",
    };

    // Bir satır = bir veli–öğrenci BAĞI. Aynı veli birden çok satırda geçebilir;
    // sayım bağ üzerinden yapılır, kullanıcı üzerinden değil.
    const { rows } = await ctx.db.query<{ eklendi: boolean }>(
      `insert into parent_students (parent_user_id, student_id, school_id, yakinlik)
       select x.veli, x.ogrenci, $1, x.yakinlik::yakinlik_turu
       from unnest($2::uuid[], $3::uuid[], $4::text[]) as x(veli, ogrenci, yakinlik)
       on conflict (parent_user_id, student_id) do update set yakinlik = excluded.yakinlik
       returning (xmax = 0) as eklendi`,
      [
        ctx.schoolId,
        kisiler.map((k) => k.authId),
        d.map((x) => ctx.ogrenciler.get(refKey(String(x.ogrenci_okul_no))) ?? null),
        d.map((x) => yakinlikHarita[String(x.yakinlik)] ?? "diger"),
      ],
    );
    return say(rows);
  },
};

// ---------------------------------------------------------------------------
// Auth kullanıcılarının hazırlanması (transaction dışında)
// ---------------------------------------------------------------------------

const KULLANICI_URETEN: TemplateId[] = ["ogretmenler", "ogrenciler", "veliler"];

function authEpostasi(
  templateId: TemplateId,
  slug: string,
  deger: Record<string, unknown>,
): string {
  switch (templateId) {
    case "ogretmenler":
      // Öğretmen zaten benzersiz bir kurumsal e-postayla geliyor.
      return String(deger.eposta);
    case "ogrenciler":
      return sentetikEposta(slug, "ogrenci", String(deger.okul_no));
    case "veliler":
      return sentetikEposta(slug, "veli", String(deger.telefon));
    default:
      throw new Error(`${templateId} kullanıcı üretmez`);
  }
}

// ---------------------------------------------------------------------------
// Ana giriş noktası
// ---------------------------------------------------------------------------

export async function uygula(
  db: DbClient,
  girdi: UygulamaGirdisi,
): Promise<UygulamaSonucu> {
  const { schoolId, templateId, satirlar, yukleyenId, dosyaAdi } = girdi;

  const okul = await tek<{ slug: string }>(db, `select slug from schools where id = $1`, [
    schoolId,
  ]);
  if (!okul) throw new Error("Okul bulunamadı.");

  const uygulanacak = satirlar.filter((s) => s.islem !== "hata");
  const hataliAtlandi = satirlar.length - uygulanacak.length;

  // --- 1) Auth kullanıcıları (transaction ÖNCESİ, çünkü HTTP çağrısıdır) ---
  const authIds = new Map<string, string>();
  if (KULLANICI_URETEN.includes(templateId)) {
    const saglayici = girdi.authSaglayici;
    if (!saglayici) {
      throw new Error(`${templateId} şablonu için authSaglayici gereklidir.`);
    }

    const epostalar = [
      ...new Set(uygulanacak.map((s) => authEpostasi(templateId, okul.slug, s.deger))),
    ];

    // Önce mevcutlar: tek sorgu. Aynı dosya ikinci kez yüklendiğinde burada
    // hepsi bulunur ve hiç HTTP çağrısı yapılmaz.
    const mevcut = await saglayici.mevcutlariBul(epostalar);
    for (const [k, v] of mevcut) authIds.set(k, v);

    // Kalanlar HTTP ile oluşturulur. Tek tek beklenirse 1.248 öğrencilik bir
    // dosya dakikalarca sürer; sınırsız paralellik ise Supabase tarafında hız
    // sınırına takılır.
    const eksik = epostalar.filter((e) => !authIds.has(refKey(e)));
    const ES_ZAMANLI = 8;
    for (let i = 0; i < eksik.length; i += ES_ZAMANLI) {
      const dilim = eksik.slice(i, i + ES_ZAMANLI);
      const kimlikler = await Promise.all(dilim.map((e) => saglayici.olustur(e)));
      dilim.forEach((e, j) => authIds.set(refKey(e), kimlikler[j]));
    }
  }

  // --- 2) Transaction ---
  await db.query("begin");
  try {
    const batch = await tek<{ id: string }>(
      db,
      `insert into import_batches (school_id, sablon_tipi, dosya_adi, yukleyen, durum)
       values ($1,$2,$3,$4,'onizleme') returning id`,
      [schoolId, templateId, dosyaAdi, yukleyenId],
    );

    if (satirlar.length) {
      await db.query(
        `insert into import_rows (batch_id, satir_no, ham, islem, hatalar)
         select $1, x.no, x.ham::jsonb, x.islem::satir_islemi, x.hatalar::jsonb
         from unnest($2::int[], $3::text[], $4::text[], $5::text[])
              as x(no, ham, islem, hatalar)`,
        [
          batch.id,
          satirlar.map((s) => s.satirNo),
          satirlar.map((s) => JSON.stringify(s.ham)),
          satirlar.map((s) => s.islem),
          satirlar.map((s) => JSON.stringify(s.hatalar)),
        ],
      );
    }

    const ctx: Baglam = {
      db,
      schoolId,
      slug: okul.slug,
      seviyeler: await seviyeleriHazirla(db, schoolId),
      dersler: await haritaGetir(
        db,
        `select id, ad as anahtar from subjects where school_id = $1`,
        [schoolId],
      ),
      siniflar: await haritaGetir(
        db,
        `select id, kod as anahtar from classes where school_id = $1`,
        [schoolId],
      ),
      turler: await haritaGetir(
        db,
        `select id, ad as anahtar from etut_types where school_id = $1`,
        [schoolId],
      ),
      ogretmenler: await haritaGetir(
        db,
        `select t.user_id as id, u.eposta as anahtar from teachers t
         join users u on u.id = t.user_id
         where t.school_id = $1 and u.eposta is not null`,
        [schoolId],
      ),
      ogrenciler: await haritaGetir(
        db,
        `select user_id as id, okul_no as anahtar from students where school_id = $1`,
        [schoolId],
      ),
      authIds,
      davetler: [],
    };

    const { eklendi, guncellendi } = uygulanacak.length
      ? await ISLEYICILER[templateId](ctx, uygulanacak.map((s) => s.deger))
      : { eklendi: 0, guncellendi: 0 };

    const ozet = {
      toplam: satirlar.length,
      eklendi,
      guncellendi,
      hata: hataliAtlandi,
      davet_kodu: ctx.davetler.length,
    };

    await db.query(
      `update import_batches
          set durum = 'uygulandi', ozet = $2, uygulandi_at = now()
        where id = $1`,
      [batch.id, JSON.stringify(ozet)],
    );

    await db.query(
      `insert into audit_logs (school_id, actor_user_id, islem, entity, entity_id, sonrasi)
       values ($1,$2,'import.uygula','import_batches',$3,$4)`,
      [schoolId, yukleyenId, batch.id, JSON.stringify({ sablon: templateId, ...ozet })],
    );

    await db.query("commit");

    return {
      batchId: batch.id,
      eklendi,
      guncellendi,
      hataliAtlandi,
      davetKodlari: ctx.davetler,
    };
  } catch (err) {
    await db.query("rollback");
    throw err;
  }
}
