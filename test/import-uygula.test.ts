/**
 * İçe aktarımın veritabanına yazma katmanı.
 *
 * Testler gerçek .xlsx baytları üretir, ayrıştırıcıdan geçirir ve gömülü
 * Postgres'e yazar — yani okulun yaşayacağı yolun tamamı çalışır.
 *
 * Auth kullanıcıları için sahte bir sağlayıcı kullanılır: üretimde
 * `supabase.auth.admin` olan kısım testte doğrudan auth.users'a yazar.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import ExcelJS from "exceljs";
import crypto from "node:crypto";
import { createTestDb, type TestDb } from "./db";
import { parseTemplate, refKey } from "@/lib/import/parse";
import { TEMPLATES_BY_ID, type TemplateId } from "@/lib/import/templates";
import {
  uygula,
  lookupsGetir,
  sentetikEposta,
  type AuthSaglayici,
  type DbClient,
} from "@/lib/import/apply";
import { davetKoduDogrula, davetKoduOzeti, davetKoduUret } from "@/lib/import/davet";

let db: TestDb;
let schoolId: string;
let adminId: string;

/** Üretimde supabase.auth.admin olan kısmın test karşılığı. */
function sahteAuth(client: DbClient): AuthSaglayici {
  return {
    async mevcutlariBul(epostalar: string[]) {
      const { rows } = await client.query<{ id: string; email: string }>(
        `select id, email from auth.users where lower(email) = any($1::text[])`,
        [epostalar.map((e) => e.toLowerCase())],
      );
      return new Map(rows.map((r) => [refKey(r.email), r.id]));
    },
    async olustur(eposta: string) {
      const id = crypto.randomUUID();
      await client.query(`insert into auth.users (id, email) values ($1,$2)`, [id, eposta]);
      return id;
    },
  };
}

async function xlsx(templateId: TemplateId, satirlar: (string | number | null)[][]) {
  const def = TEMPLATES_BY_ID[templateId];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(def.sheetName);
  ws.addRow(def.columns.map((c) => c.header));
  for (const r of satirlar) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Bir şablonu ayrıştırıp uygular — okulun yaptığı işin tamamı. */
async function yukle(templateId: TemplateId, satirlar: (string | number | null)[][]) {
  const buf = await xlsx(templateId, satirlar);
  const lookups = await lookupsGetir(db, schoolId, templateId);
  const sonuc = await parseTemplate(buf, templateId, lookups);
  expect(sonuc.dosyaHatalari, `${templateId} dosya hatası`).toEqual([]);
  return {
    ayristirma: sonuc,
    uygulama: await uygula(db, {
      schoolId,
      templateId,
      satirlar: sonuc.satirlar,
      yukleyenId: adminId,
      dosyaAdi: TEMPLATES_BY_ID[templateId].fileName,
      authSaglayici: sahteAuth(db),
    }),
  };
}

const say = async (sql: string, params: unknown[] = []) => {
  const { rows } = await db.query<{ n: number }>(
    `select count(*)::int as n from (${sql}) t`,
    params,
  );
  return Number(rows[0].n);
};

// Veritabanı bir kez kurulur, her test öncesi yalnızca veri temizlenir.
beforeAll(async () => {
  db = await createTestDb();
}, 120000);

afterAll(async () => db?.close());

beforeEach(async () => {
  await db.temizle();
  const { rows } = await db.query<{ id: string }>(
    `insert into schools (slug, ad) values ('ornek-okul','Örnek Koleji') returning id`,
  );
  schoolId = rows[0].id;
  await db.query(`insert into school_settings (school_id) values ($1)`, [schoolId]);

  // Yükleme işlemini yapan yönetici
  adminId = crypto.randomUUID();
  await db.query(`insert into auth.users (id, email) values ($1,'admin@test.local')`, [adminId]);
  await db.query(
    `insert into users (id, school_id, ad, soyad, eposta) values ($1,$2,'Ayşe','Yönetici','admin@test.local')`,
    [adminId, schoolId],
  );
  await db.query(`insert into user_roles (user_id, school_id, role) values ($1,$2,'admin')`, [
    adminId,
    schoolId,
  ]);
});

describe("referans şablonları", () => {
  it("sınıfları yazar ve sınıf seviyelerini kendisi oluşturur", async () => {
    const { uygulama } = await yukle("siniflar", [
      ["11-A", "11. Sınıf", "A", "Sayısal"],
      ["11-B", "11. Sınıf", "B", ""],
      ["12-A", "12. Sınıf", "", ""],
    ]);
    expect(uygulama).toMatchObject({ eklendi: 3, guncellendi: 0, hataliAtlandi: 0 });
    expect(await say(`select 1 from classes where school_id = $1`, [schoolId])).toBe(3);
    // Seviyeler Excel'de ayrı bir sayfa değil; şablondaki "Seviye" sütunundan türer.
    expect(await say(`select 1 from grade_levels where school_id = $1`, [schoolId])).toBe(5);
  });

  it("şube boş bırakılırsa sınıf kodundan çıkarır", async () => {
    await yukle("siniflar", [["11-A", "11. Sınıf", "", ""]]);
    const { rows } = await db.query<{ sube: string }>(
      `select sube from classes where kod = '11-A'`,
    );
    expect(rows[0].sube).toBe("A");
  });

  it("dersleri ve konuları bağlı şekilde yazar", async () => {
    await yukle("dersler", [
      ["Matematik", "MAT", "E"],
      ["Fizik", "FZK", "E"],
    ]);
    const { uygulama } = await yukle("konular", [
      ["Matematik", "11. Sınıf", "Türev", 1],
      ["Matematik", "11. Sınıf", "İntegral", 2],
      ["Fizik", "11. Sınıf", "Optik", 1],
    ]);
    expect(uygulama.eklendi).toBe(3);

    const { rows } = await db.query<{ ders: string; seviye: string; konu: string }>(
      `select s.ad as ders, g.ad as seviye, t.ad as konu
       from topics t
       join subjects s on s.id = t.subject_id
       join grade_levels g on g.id = t.grade_level_id
       order by s.ad, t.sira`,
    );
    expect(rows).toEqual([
      { ders: "Fizik", seviye: "11. Sınıf", konu: "Optik" },
      { ders: "Matematik", seviye: "11. Sınıf", konu: "Türev" },
      { ders: "Matematik", seviye: "11. Sınıf", konu: "İntegral" },
    ]);
  });

  it("aynı dosya ikinci kez yüklendiğinde günceller, çift kayıt üretmez", async () => {
    await yukle("derslikler", [
      ["B-204", "B Blok", "2", 24, "E"],
      ["C-110", "C Blok", "1", 20, "E"],
    ]);
    const ikinci = await yukle("derslikler", [
      ["B-204", "B Blok", "2", 30, "E"], // kapasite değişti
      ["C-110", "C Blok", "1", 20, "E"],
      ["D-001", "D Blok", "0", 15, "E"], // yeni
    ]);

    expect(ikinci.uygulama).toMatchObject({ eklendi: 1, guncellendi: 2 });
    expect(await say(`select 1 from rooms where school_id = $1`, [schoolId])).toBe(3);
    const { rows } = await db.query<{ kapasite: number }>(
      `select kapasite from rooms where kod = 'B-204'`,
    );
    expect(Number(rows[0].kapasite)).toBe(30);
  });

  it("dosyada olmayan kayıtları SİLMEZ", async () => {
    await yukle("derslikler", [
      ["B-204", "", "", 24, "E"],
      ["C-110", "", "", 20, "E"],
    ]);
    await yukle("derslikler", [["B-204", "", "", 24, "E"]]);
    expect(await say(`select 1 from rooms where school_id = $1`, [schoolId])).toBe(2);
  });
});

describe("kişi şablonları", () => {
  beforeEach(async () => {
    await yukle("siniflar", [
      ["11-A", "11. Sınıf", "A", ""],
      ["11-B", "11. Sınıf", "B", ""],
    ]);
    await yukle("dersler", [
      ["Matematik", "MAT", "E"],
      ["Kimya", "KIM", "E"],
    ]);
    await yukle("etut_turleri", [
      ["Soru Çözümü", "E"],
      ["Birebir", "E"],
    ]);
  });

  it("öğretmeni, branşını ve verebileceği türleri yazar", async () => {
    const { uygulama } = await yukle("ogretmenler", [
      [
        "Ahmet",
        "Yılmaz",
        "ahmet@okul.k12.tr",
        "0532 111 22 33",
        "Matematik",
        "Soru Çözümü, Birebir",
        "E",
        "H",
        "Aktif",
      ],
    ]);
    expect(uygulama.eklendi).toBe(1);

    const { rows } = await db.query<{
      ad: string;
      telefon: string;
      brans: string;
      mentor_mu: boolean;
      tur_sayisi: number;
    }>(
      `select u.ad, u.telefon, s.ad as brans, t.mentor_mu,
              array_length(t.verebilecegi_tur_ids, 1) as tur_sayisi
       from teachers t
       join users u on u.id = t.user_id
       join subjects s on s.id = t.brans_subject_id`,
    );
    expect(rows[0]).toMatchObject({
      ad: "Ahmet",
      telefon: "+905321112233", // Excel'de "0532 111 22 33" yazıyordu
      brans: "Matematik",
      mentor_mu: true,
    });
    expect(Number(rows[0].tur_sayisi)).toBe(2);
  });

  it("mentör ve rehber sütunlarına göre ek rol verir", async () => {
    /**
     * "Rehber mi?" sütunu okulun rehber öğretmenini tanımlayan tek otomatik
     * yol; olmadığında bu rol yalnızca elle veritabanına yazılarak
     * verilebiliyordu. Rehber rolü, okul yönetiminin bile göremediği görüşme
     * kayıtlarını açar (0023) — yanlış satıra "E" yazılması ucuz bir hata
     * değil, o yüzden sütunun DOĞRU satıra rol verdiği kayıt altında olmalı.
     *
     * Boş bırakılan hücre "H" ile aynı: sütun zorunlu değil.
     */
    await yukle("ogretmenler", [
      ["Ahmet", "Yılmaz", "ahmet@okul.k12.tr", "", "Matematik", "", "E", "H", "Aktif"],
      ["Selin", "Kaya", "selin@okul.k12.tr", "", "Kimya", "", "H", "E", "Aktif"],
      ["Nalan", "Ay", "nalan@okul.k12.tr", "", "Kimya", "", "H", "", "Aktif"],
    ]);
    const { rows } = await db.query<{ eposta: string; roller: string[] }>(
      `select u.eposta, array_agg(r.role::text order by r.role::text) as roller
       from users u join user_roles r on r.user_id = u.id
       where u.eposta like '%okul.k12.tr' group by u.eposta order by u.eposta`,
    );
    expect(rows).toEqual([
      { eposta: "ahmet@okul.k12.tr", roller: ["mentor", "ogretmen"] },
      { eposta: "nalan@okul.k12.tr", roller: ["ogretmen"] },
      { eposta: "selin@okul.k12.tr", roller: ["ogretmen", "rehber"] },
    ]);
  });

  it("rehber sütununu H'ye çevirmek yetkiyi GERİ ALMAZ", async () => {
    /**
     * Aktarım rol ekler, silmez (`on conflict do nothing`). Bu davranış bütün
     * içe aktarımda geçerli ve bilinçli — ama rehber yetkisinde sonucu ağır
     * olduğu için kayıt altında olması gerekiyor: yöneticinin şablonu düzeltip
     * yeniden yüklemesi yetmez, Kullanıcılar ekranından alması gerekir.
     * Şablonun notunda da böyle yazıyor.
     */
    await yukle("ogretmenler", [
      ["Selin", "Kaya", "selin@okul.k12.tr", "", "Kimya", "", "H", "E", "Aktif"],
    ]);
    await yukle("ogretmenler", [
      ["Selin", "Kaya", "selin@okul.k12.tr", "", "Kimya", "", "H", "H", "Aktif"],
    ]);
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from user_roles r
       join users u on u.id = r.user_id
       where u.eposta = 'selin@okul.k12.tr' and r.role = 'rehber'`,
    );
    expect(rows[0].n).toBe(1);
  });

  it("öğrenciyi sınıfına ve mentörüne bağlar", async () => {
    await yukle("ogretmenler", [
      ["Ahmet", "Yılmaz", "ahmet@okul.k12.tr", "", "Matematik", "", "E", "", "Aktif"],
    ]);
    const { uygulama } = await yukle("ogrenciler", [
      ["248", "Elif", "Demir", "11-A", "0535 222 33 44", "", "ahmet@okul.k12.tr", "Aktif"],
      ["251", "Kaan", "Yıldız", "11-B", "", "", "", "Aktif"],
    ]);
    expect(uygulama.eklendi).toBe(2);

    const { rows } = await db.query<{
      okul_no: string;
      sinif: string;
      mentor: string | null;
    }>(
      `select st.okul_no, c.kod as sinif, m.ad as mentor
       from students st
       join classes c on c.id = st.class_id
       left join users m on m.id = st.mentor_teacher_id
       order by st.okul_no`,
    );
    expect(rows).toEqual([
      { okul_no: "248", sinif: "11-A", mentor: "Ahmet" },
      { okul_no: "251", sinif: "11-B", mentor: null },
    ]);
  });

  it("öğrencinin sınıfı değiştiğinde yeni yüklemede taşır, kopya oluşturmaz", async () => {
    await yukle("ogrenciler", [["248", "Elif", "Demir", "11-A", "", "", "", "Aktif"]]);
    const ikinci = await yukle("ogrenciler", [
      ["248", "Elif", "Demir", "11-B", "", "", "", "Aktif"],
    ]);
    expect(ikinci.uygulama).toMatchObject({ eklendi: 0, guncellendi: 1 });
    expect(await say(`select 1 from students`)).toBe(1);
    const { rows } = await db.query<{ kod: string }>(
      `select c.kod from students st join classes c on c.id = st.class_id`,
    );
    expect(rows[0].kod).toBe("11-B");
  });

  it("aynı veliyi iki öğrenciye tek kullanıcı olarak bağlar", async () => {
    await yukle("ogrenciler", [
      ["248", "Elif", "Demir", "11-A", "", "", "", "Aktif"],
      ["402", "Ege", "Demir", "11-B", "", "", "", "Aktif"],
    ]);
    const { uygulama } = await yukle("veliler", [
      ["Hakan", "Demir", "0532 777 88 99", "", "248", "Baba"],
      ["Hakan", "Demir", "0532 777 88 99", "", "402", "Baba"],
      ["Ayşe", "Demir", "0533 111 00 22", "", "248", "Anne"],
    ]);
    expect(uygulama.eklendi).toBe(3); // 3 bağ

    expect(await say(`select 1 from parent_students`)).toBe(3);
    // Hakan iki satırda geçti ama TEK kullanıcıdır.
    expect(await say(`select 1 from users where telefon = '+905327778899'`)).toBe(1);
  });

  it("pasif öğrenciyi pasif olarak yazar", async () => {
    await yukle("ogrenciler", [
      ["248", "Elif", "Demir", "11-A", "", "", "", "Aktif"],
      ["300", "Ayrılmış", "Öğrenci", "11-A", "", "", "", "Pasif"],
    ]);
    const { rows } = await db.query<{ okul_no: string; durum: string }>(
      `select st.okul_no, u.durum from students st join users u on u.id = st.user_id
       order by st.okul_no`,
    );
    expect(rows).toEqual([
      { okul_no: "248", durum: "aktif" },
      { okul_no: "300", durum: "pasif" },
    ]);
  });

  it("öğrenci ve veli için sabit sentetik auth e-postası üretir", async () => {
    await yukle("ogrenciler", [["248", "Elif", "Demir", "11-A", "", "", "", "Aktif"]]);
    await yukle("veliler", [["Hakan", "Demir", "0532 777 88 99", "", "248", "Baba"]]);

    const { rows } = await db.query<{ email: string }>(
      `select email from auth.users where email like '%etut.local' order by email`,
    );
    expect(rows.map((r) => r.email)).toEqual([
      sentetikEposta("ornek-okul", "ogrenci", "248"),
      sentetikEposta("ornek-okul", "veli", "+905327778899"),
    ]);
  });
});

describe("davet kodları", () => {
  beforeEach(async () => {
    await yukle("siniflar", [["11-A", "11. Sınıf", "A", ""]]);
  });

  it("her yeni kullanıcı için tek kullanımlık kod üretir", async () => {
    const { uygulama } = await yukle("ogrenciler", [
      ["248", "Elif", "Demir", "11-A", "", "", "", "Aktif"],
      ["251", "Kaan", "Yıldız", "11-A", "", "", "", "Aktif"],
    ]);
    expect(uygulama.davetKodlari).toHaveLength(2);
    expect(uygulama.davetKodlari[0]).toMatchObject({ kimlik: "248", rol: "Öğrenci" });
    expect(uygulama.davetKodlari[0].kod).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it("kodun kendisini değil, yalnızca özetini saklar", async () => {
    const { uygulama } = await yukle("ogrenciler", [
      ["248", "Elif", "Demir", "11-A", "", "", "", "Aktif"],
    ]);
    const kod = uygulama.davetKodlari[0].kod;

    const { rows } = await db.query<{ setup_token_hash: string }>(
      `select setup_token_hash from users u join students s on s.user_id = u.id
       where s.okul_no = '248'`,
    );
    expect(rows[0].setup_token_hash).not.toContain(kod);
    expect(rows[0].setup_token_hash).toBe(davetKoduOzeti(kod));
    expect(davetKoduDogrula(kod, rows[0].setup_token_hash)).toBe(true);
    expect(davetKoduDogrula(davetKoduUret(), rows[0].setup_token_hash)).toBe(false);
  });

  it("kod tire olmadan veya küçük harfle girilse de doğrulanır", async () => {
    const { uygulama } = await yukle("ogrenciler", [
      ["248", "Elif", "Demir", "11-A", "", "", "", "Aktif"],
    ]);
    const kod = uygulama.davetKodlari[0].kod;
    const ozet = davetKoduOzeti(kod);
    expect(davetKoduDogrula(kod.replace("-", ""), ozet)).toBe(true);
    expect(davetKoduDogrula(kod.toLowerCase(), ozet)).toBe(true);
    expect(davetKoduDogrula(` ${kod} `, ozet)).toBe(true);
  });

  it("şifresini belirlemiş kullanıcıya yeniden kod üretmez", async () => {
    await yukle("ogrenciler", [["248", "Elif", "Demir", "11-A", "", "", "", "Aktif"]]);
    await db.query(
      `update users set sifre_belirlendi_mi = true, setup_token_hash = null
       where id = (select user_id from students where okul_no = '248')`,
    );

    const ikinci = await yukle("ogrenciler", [
      ["248", "Elif", "Demir", "11-A", "", "", "", "Aktif"],
      ["251", "Kaan", "Yıldız", "11-A", "", "", "", "Aktif"],
    ]);
    // Yalnızca yeni öğrenci için kod üretilmeli; Elif'in şifresi bozulmamalı.
    expect(ikinci.uygulama.davetKodlari.map((d) => d.kimlik)).toEqual(["251"]);
  });
});

describe("denetim ve geri alma", () => {
  it("yükleme geçmişini ve denetim kaydını yazar", async () => {
    const { uygulama } = await yukle("siniflar", [
      ["11-A", "11. Sınıf", "A", ""],
      ["11-B", "11. Sınıf", "B", ""],
    ]);

    const { rows: batch } = await db.query<{
      sablon_tipi: string;
      durum: string;
      ozet: { eklendi: number; toplam: number };
    }>(`select sablon_tipi, durum, ozet from import_batches where id = $1`, [uygulama.batchId]);
    expect(batch[0]).toMatchObject({ sablon_tipi: "siniflar", durum: "uygulandi" });
    expect(batch[0].ozet).toMatchObject({ eklendi: 2, toplam: 2 });

    expect(await say(`select 1 from import_rows where batch_id = $1`, [uygulama.batchId])).toBe(2);
    expect(
      await say(`select 1 from audit_logs where islem = 'import.uygula' and school_id = $1`, [
        schoolId,
      ]),
    ).toBe(1);
  });

  it("hatalı satırları kaydeder ama uygulamaz", async () => {
    const { ayristirma, uygulama } = await yukle("siniflar", [
      ["11-A", "11. Sınıf", "A", ""],
      ["11-B", "Yanlış Seviye", "B", ""],
    ]);
    expect(ayristirma.ozet.hata).toBe(1);
    expect(uygulama).toMatchObject({ eklendi: 1, hataliAtlandi: 1 });
    expect(await say(`select 1 from classes`)).toBe(1);

    const { rows } = await db.query<{ islem: string; hatalar: unknown[] }>(
      `select islem, hatalar from import_rows where batch_id = $1 and islem = 'hata'`,
      [uygulama.batchId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].hatalar.length).toBeGreaterThan(0);
  });

  it("yazma sırasında hata olursa hiçbir satır uygulanmaz", async () => {
    await yukle("siniflar", [["11-A", "11. Sınıf", "A", ""]]);

    const buf = await xlsx("ogrenciler", [
      ["248", "Elif", "Demir", "11-A", "", "", "", "Aktif"],
      ["251", "Kaan", "Yıldız", "11-A", "", "", "", "Aktif"],
    ]);
    const lookups = await lookupsGetir(db, schoolId, "ogrenciler");
    const sonuc = await parseTemplate(buf, "ogrenciler", lookups);

    // İkinci öğrenciyi yazarken patlayan bir auth sağlayıcı.
    let sayac = 0;
    const bozukAuth: AuthSaglayici = {
      mevcutlariBul: (e) => sahteAuth(db).mevcutlariBul(e),
      async olustur(eposta) {
        if (++sayac === 2) throw new Error("auth servisi ulaşılamadı");
        return sahteAuth(db).olustur(eposta);
      },
    };

    await expect(
      uygula(db, {
        schoolId,
        templateId: "ogrenciler",
        satirlar: sonuc.satirlar,
        yukleyenId: adminId,
        dosyaAdi: "07_ogrenciler.xlsx",
        authSaglayici: bozukAuth,
      }),
    ).rejects.toThrow(/auth servisi/);

    // Hiç öğrenci yazılmamış olmalı — yarım yükleme yok.
    expect(await say(`select 1 from students`)).toBe(0);
    // Bu şablon için hiç yükleme kaydı açılmamış olmalı (sınıf yüklemesi hariç).
    expect(
      await say(`select 1 from import_batches where sablon_tipi = 'ogrenciler'`),
    ).toBe(0);
  });
});

describe("lookupsGetir", () => {
  it("ikinci yüklemede mevcut kayıtları 'guncelle' olarak işaretlenmesini sağlar", async () => {
    await yukle("dersler", [["Matematik", "MAT", "E"]]);
    const lookups = await lookupsGetir(db, schoolId, "dersler");
    expect(lookups.mevcut.has("matematik")).toBe(true);
  });

  it("çapraz referans kümelerini de getirir", async () => {
    await yukle("siniflar", [["11-A", "11. Sınıf", "A", ""]]);
    const lookups = await lookupsGetir(db, schoolId, "ogrenciler");
    expect(lookups.referanslar.siniflar?.has("11-a")).toBe(true);
    expect(lookups.referanslar.ogretmenler?.size).toBe(0);
  });

  it("başka okulun kayıtlarını karıştırmaz", async () => {
    await yukle("dersler", [["Matematik", "MAT", "E"]]);
    const { rows } = await db.query<{ id: string }>(
      `insert into schools (slug, ad) values ('baska-okul','Başka Okul') returning id`,
    );
    const digerLookups = await lookupsGetir(db, rows[0].id, "dersler");
    expect(digerLookups.mevcut.size).toBe(0);
  });
});
