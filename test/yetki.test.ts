/**
 * SECURITY DEFINER fonksiyonların yetki kontrolleri.
 *
 * Bu fonksiyonlar RLS'i atlar. İçlerinde kontrol olmazsa herhangi bir öğrenci
 * başkası adına rezervasyon yapabilir veya bir sınıfın tamamını bir etüde
 * atayabilirdi. Buradaki testler tam olarak bunu engelliyor.
 *
 * Ayrıca GRANT katmanını doğrular: RLS "hangi satır", GRANT "tabloya hiç
 * dokunabilir misin" sorusunu yanıtlar ve ikisi ayrı korumalardır.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./db";
import { seedSchool, createEtut, gelecekHaftaTarihi, type SeededSchool } from "./seed";
import type { PGlite } from "@electric-sql/pglite";

let db: TestDb;
let s: SeededSchool;
let etut: string;
let tarih: string;

beforeAll(async () => {
  db = await createTestDb();
  s = await seedSchool(db);
  await db.asService((q) =>
    q.query(
      `update school_settings set gelecek_hafta_acilis_gun = 1, gelecek_hafta_acilis_saat = '00:00'
        where school_id = $1`,
      [s.schoolId],
    ),
  );
  tarih = await gelecekHaftaTarihi(db);
  etut = await createEtut(db, s, { tarih, baslangic: "16:00", bitis: "17:00", kontenjan: 5 });
}, 120000);

afterAll(async () => db?.close());

const cagir = (kullanici: string, sql: string, params: unknown[]) =>
  db.as(kullanici, (q: PGlite) => q.query(sql, params));

describe("rezervasyon_yap yetkisi", () => {
  it("öğrenci kendi adına rezervasyon yapabilir", async () => {
    const r = await cagir(s.students[0], `select * from rezervasyon_yap($1,$2)`, [
      etut,
      s.students[0],
    ]);
    expect((r.rows[0] as { durum: string }).durum).toBe("rezerve");
  });

  it("öğrenci BAŞKA bir öğrenci adına rezervasyon yapamaz", async () => {
    await expect(
      cagir(s.students[0], `select * from rezervasyon_yap($1,$2)`, [etut, s.students[1]]),
    ).rejects.toThrow(/yetkiniz yok/i);
  });

  it("etüdün öğretmeni öğrenci adına kayıt yapabilir", async () => {
    const r = await cagir(s.teacherId, `select * from rezervasyon_yap($1,$2)`, [
      etut,
      s.students[1],
    ]);
    expect((r.rows[0] as { durum: string }).durum).toBe("rezerve");
  });

  it("başka bir öğretmen o etüde öğrenci ekleyemez", async () => {
    await expect(
      cagir(s.teacher2Id, `select * from rezervasyon_yap($1,$2)`, [etut, s.students[2]]),
    ).rejects.toThrow(/yetkiniz yok/i);
  });

  it("yönetici öğrenci adına kayıt yapabilir", async () => {
    const r = await cagir(s.adminId, `select * from rezervasyon_yap($1,$2)`, [
      etut,
      s.students[2],
    ]);
    expect((r.rows[0] as { durum: string }).durum).toBe("rezerve");
  });
});

describe("rezervasyon_birak yetkisi", () => {
  it("öğrenci başkasının rezervasyonunu iptal edemez", async () => {
    await expect(
      cagir(s.students[3], `select rezervasyon_birak($1,$2)`, [etut, s.students[0]]),
    ).rejects.toThrow(/yetkiniz yok/i);
  });

  it("öğrenci kendi rezervasyonunu iptal edebilir", async () => {
    await expect(
      cagir(s.students[0], `select rezervasyon_birak($1,$2)`, [etut, s.students[0]]),
    ).resolves.toBeDefined();
  });
});

describe("sinif_etudu_ogrencileri_ata yetkisi", () => {
  it("öğrenci bir sınıfı toplu olarak etüde atayamaz", async () => {
    const sinifEtut = await createEtut(db, s, {
      tarih,
      baslangic: "08:00",
      bitis: "09:00",
      sinifEtudu: true,
      typeId: s.typeSinifId,
      roomId: null,
    });
    await expect(
      cagir(s.students[0], `select sinif_etudu_ogrencileri_ata($1)`, [sinifEtut]),
    ).rejects.toThrow(/yetkiniz yok/i);
  });

  it("etüdün öğretmeni toplu atama yapabilir", async () => {
    const sinifEtut = await createEtut(db, s, {
      tarih,
      baslangic: "09:00",
      bitis: "10:00",
      sinifEtudu: true,
      typeId: s.typeSinifId,
      roomId: null,
    });
    const r = await cagir(s.teacherId, `select sinif_etudu_ogrencileri_ata($1) as n`, [sinifEtut]);
    expect(Number((r.rows[0] as { n: number }).n)).toBe(4);
  });
});

describe("giriş yapmamış ziyaretçi (anon)", () => {
  // Bu testler gerçek bir açığı bekliyor: SECURITY DEFINER fonksiyonlara
  // Postgres varsayılan olarak PUBLIC'e EXECUTE verir ve anon'un auth.uid()'i
  // de null'dur. İkisi birleşince internetten herhangi biri, giriş yapmadan
  // /rest/v1/rpc/rezervasyon_yap çağırabiliyordu.
  it("rezervasyon fonksiyonunu çağıramaz", async () => {
    await expect(
      db.asAnon((q) => q.query(`select * from rezervasyon_yap($1,$2)`, [etut, s.students[3]])),
    ).rejects.toThrow(/permission denied|yetkiniz yok/i);
  });

  it("iptal fonksiyonunu çağıramaz", async () => {
    await expect(
      db.asAnon((q) => q.query(`select rezervasyon_birak($1,$2)`, [etut, s.students[0]])),
    ).rejects.toThrow(/permission denied|yetkiniz yok/i);
  });

  it("sınıf atama fonksiyonunu çağıramaz", async () => {
    await expect(
      db.asAnon((q) => q.query(`select sinif_etudu_ogrencileri_ata($1)`, [etut])),
    ).rejects.toThrow(/permission denied|yetkiniz yok/i);
  });

  it("öğrenci ve etüt verisini okuyamaz", async () => {
    for (const tablo of ["students", "users", "etuts", "reservations", "evaluations"]) {
      const sonuc = await db
        .asAnon((q) => q.query(`select count(*)::int as n from ${tablo}`))
        .then((r) => Number((r.rows[0] as { n: number }).n))
        .catch(() => "reddedildi" as const);
      expect(sonuc, `${tablo} anon'a açık olmamalı`).toSatisfy(
        (v: unknown) => v === "reddedildi" || v === 0,
      );
    }
  });

  it("yalnızca okul marka bilgisini görebilir (giriş sayfası için)", async () => {
    const r = await db.asAnon((q) => q.query(`select slug, ad from v_okullar_acik`));
    expect(r.rows.length).toBeGreaterThan(0);
  });

  it("hiçbir SECURITY DEFINER fonksiyonu anon'a veya PUBLIC'e açık değildir", async () => {
    const { rows } = await db.asService((q) =>
      q.query<{ proname: string }>(
        `select p.proname
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.prosecdef
           and (
             has_function_privilege('anon', p.oid, 'execute')
             or has_function_privilege('public', p.oid, 'execute')
           )`,
      ),
    );
    expect(rows.map((r) => r.proname)).toEqual([]);
  });
});

describe("tablo yetkileri (GRANT)", () => {
  it("rezervasyon tablosuna doğrudan yazılamaz — tek yol fonksiyonlardır", async () => {
    await expect(
      cagir(
        s.students[0],
        `insert into reservations (school_id, etut_id, student_id, durum)
         values ($1,$2,$3,'rezerve')`,
        [s.schoolId, etut, s.students[3]],
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("denetim kaydı hiçbir kullanıcı tarafından değiştirilemez", async () => {
    for (const kullanici of [s.adminId, s.teacherId, s.students[0]]) {
      await expect(
        cagir(kullanici, `insert into audit_logs (school_id, islem, entity) values ($1,'x','y')`, [
          s.schoolId,
        ]),
      ).rejects.toThrow(/permission denied/i);
      await expect(
        cagir(kullanici, `delete from audit_logs`, []),
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it("yönetici bile içe aktarım geçmişini elle değiştiremez", async () => {
    await expect(
      cagir(s.adminId, `update import_batches set durum = 'uygulandi'`, []),
    ).rejects.toThrow(/permission denied/i);
  });

  it("kullanıcı bildirimini okundu işaretleyebilir ama bildirim ekleyemez", async () => {
    await db.asService((q) =>
      q.query(
        `insert into notifications (school_id, user_id, tip, baslik, govde)
         values ($1,$2,'test','Başlık','Gövde')`,
        [s.schoolId, s.students[0]],
      ),
    );
    await expect(
      cagir(s.students[0], `update notifications set okundu_at = now()`, []),
    ).resolves.toBeDefined();
    await expect(
      cagir(
        s.students[0],
        `insert into notifications (school_id, user_id, tip, baslik, govde)
         values ($1,$2,'sahte','Sahte','Sahte')`,
        [s.schoolId, s.students[0]],
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe("şema güvenlik ağı", () => {
  it("public şemasındaki her tabloda RLS açıktır", async () => {
    const { rows } = await db.asService((q) =>
      q.query<{ relname: string }>(
        `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
      ),
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("RLS açık olan her tablonun en az bir politikası vardır", async () => {
    const { rows } = await db.asService((q) =>
      q.query<{ relname: string }>(
        `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
           and not exists (select 1 from pg_policy p where p.polrelid = c.oid)`,
      ),
    );
    // Politikasız + RLS açık tablo = hiç kimsenin erişemediği tablo. Muhtemelen hata.
    expect(rows.map((r) => r.relname)).toEqual([]);
  });
});

/**
 * Kiracı izolasyonunun tamamı users.school_id kolonuna dayanıyor: RLS
 * politikaları okulu auth_school_id() üzerinden, o da bu kolondan okuyor.
 * Kullanıcının bu kolonu kendisi değiştirebilmesi, tek satırlık bir UPDATE ile
 * başka okulun verisine geçmek demekti (bkz. 0012).
 */
describe("users tablosunda korumalı kolonlar", () => {
  let okulB: SeededSchool;

  beforeAll(async () => {
    okulB = await seedSchool(db, "ikinci-okul");
  }, 120000);

  it("öğrenci kendini başka bir okula taşıyamaz", async () => {
    await expect(
      cagir(s.students[0], `update users set school_id = $1 where id = $2`, [
        okulB.schoolId,
        s.students[0],
      ]),
    ).rejects.toThrow(/okul değiştirilemez/i);
  });

  it("yönetici bile kullanıcıyı başka okula taşıyamaz", async () => {
    await expect(
      cagir(s.adminId, `update users set school_id = $1 where id = $2`, [
        okulB.schoolId,
        s.students[0],
      ]),
    ).rejects.toThrow(/okul değiştirilemez/i);
  });

  it("öğrenci kendi hesap durumunu değiştiremez", async () => {
    await expect(
      cagir(s.students[0], `update users set durum = 'pasif' where id = $1`, [s.students[0]]),
    ).rejects.toThrow(/yalnızca okul yöneticisi/i);
  });

  it("öğrenci kendi davet kodu özetini yazamaz", async () => {
    await expect(
      cagir(s.students[0], `update users set setup_token_hash = 'deadbeef' where id = $1`, [
        s.students[0],
      ]),
    ).rejects.toThrow(/yalnızca okul yöneticisi/i);
    // Tohumda zaten false; gerçek bir değişiklik olması için true deneniyor.
    await expect(
      cagir(s.students[0], `update users set sifre_belirlendi_mi = true where id = $1`, [
        s.students[0],
      ]),
    ).rejects.toThrow(/yalnızca okul yöneticisi/i);
  });

  it("kullanıcı kendi iletişim bilgisini güncelleyebilir", async () => {
    await cagir(s.students[0], `update users set telefon = $1 where id = $2`, [
      "+905321234567",
      s.students[0],
    ]);
    const { rows } = await db.asService((q) =>
      q.query<{ telefon: string }>(`select telefon from users where id = $1`, [s.students[0]]),
    );
    expect(rows[0].telefon).toBe("+905321234567");
  });

  it("yönetici kendi okulunda davet kodunu yenileyebilir", async () => {
    await cagir(
      s.adminId,
      `update users set setup_token_hash = 'yeni', sifre_belirlendi_mi = false where id = $1`,
      [s.students[0]],
    );
    const { rows } = await db.asService((q) =>
      q.query<{ h: string }>(`select setup_token_hash as h from users where id = $1`, [
        s.students[0],
      ]),
    );
    expect(rows[0].h).toBe("yeni");
  });

  it("yönetici başka okulun kullanıcısına dokunamaz", async () => {
    // RLS zaten satırı görünmez kılar: UPDATE hiçbir satır etkilemez.
    await cagir(s.adminId, `update users set durum = 'pasif' where id = $1`, [okulB.students[0]]);
    const { rows } = await db.asService((q) =>
      q.query<{ durum: string }>(`select durum::text from users where id = $1`, [
        okulB.students[0],
      ]),
    );
    expect(rows[0].durum).toBe("aktif");
  });
});
