/**
 * Rehberin etüt açması ve bireysel atama (0029).
 *
 * BU DOSYADAKİ EN ÖNEMLİ TEST "atanan öğrenci etüdü görebiliyor mu" testi.
 * `etut_ogrenciye_acik()` yalnızca sınıf uygunluğuna bakıyordu; bireysel
 * etüde atanan öğrencinin sınıfı uygun sınıflar listesinde olmadığı için etüt
 * ona HİÇ GÖRÜNMEZDİ. Özellik hatasız kurulur, kimse hata almaz, sadece
 * çalışmazdı. Fonksiyonun ikinci dalı o yüzden var ve bu test onu koruyor.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, type TestDb } from "./db";
import { seedSchool, gelecekHaftaTarihi, type SeededSchool } from "./seed";

let db: TestDb;
let s: SeededSchool;
let okulB: SeededSchool;
let tarih: string;

const cagir = <T = Record<string, unknown>>(
  kullanici: string,
  sql: string,
  params: unknown[] = [],
) => db.as(kullanici, (q: PGlite) => q.query<T>(sql, params));

beforeAll(async () => {
  db = await createTestDb();
  s = await seedSchool(db);
  okulB = await seedSchool(db, "ikinci-okul");
  await db.asService((q) =>
    q.query(
      `update school_settings
          set gelecek_hafta_acilis_gun = 1, gelecek_hafta_acilis_saat = '00:00'
        where school_id = $1`,
      [s.schoolId],
    ),
  );
  tarih = await gelecekHaftaTarihi(db);
}, 120000);

afterAll(async () => db?.close());

/** Rehberin, öğretmen adına açtığı etüt. `etut_eligible_classes` YOK. */
async function rehberEtudu(saat: string, durum = "onaylandi") {
  const { rows } = await cagir<{ id: string }>(
    s.rehberId,
    `insert into etuts
       (school_id, teacher_id, subject_id, etut_type_id, tarih, baslangic, bitis,
        kontenjan, durum, created_by)
     values ($1,$2,$3,$4,$5,$6,$7, 3, $8::etut_durumu, $9)
     returning id`,
    [
      s.schoolId,
      s.teacherId,
      s.subjectId,
      s.typeSoruId,
      tarih,
      saat,
      `${String(Number(saat.slice(0, 2)) + 1).padStart(2, "0")}:00`,
      durum,
      s.rehberId,
    ],
  );
  return rows[0].id;
}

describe("rehber etüt açar", () => {
  it("öğretmen adına etüt açabilir", async () => {
    const id = await rehberEtudu("09:00");
    expect(id).toBeTruthy();
  });

  it("created_by'ı BAŞKASI gösteremez", async () => {
    // Aksi hâlde rehber, etüdü öğretmen açmış gibi kaydedebilirdi.
    await expect(
      cagir(
        s.rehberId,
        `insert into etuts
           (school_id, teacher_id, subject_id, etut_type_id, tarih, baslangic, bitis,
            kontenjan, durum, created_by)
         values ($1,$2,$3,$4,$5,'10:00','11:00',3,'onaylandi',$6)`,
        [s.schoolId, s.teacherId, s.subjectId, s.typeSoruId, tarih, s.teacherId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("BAŞKA OKULUN rehberi bu okulda etüt açamaz", async () => {
    await expect(
      cagir(
        okulB.rehberId,
        `insert into etuts
           (school_id, teacher_id, subject_id, etut_type_id, tarih, baslangic, bitis,
            kontenjan, durum, created_by)
         values ($1,$2,$3,$4,$5,'11:00','12:00',3,'onaylandi',$6)`,
        [s.schoolId, s.teacherId, s.subjectId, s.typeSoruId, tarih, okulB.rehberId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("ÖĞRENCİ etüt açamaz", async () => {
    await expect(
      cagir(
        s.students[0],
        `insert into etuts
           (school_id, teacher_id, subject_id, etut_type_id, tarih, baslangic, bitis,
            kontenjan, durum, created_by)
         values ($1,$2,$3,$4,$5,'12:00','13:00',3,'onaylandi',$6)`,
        [s.schoolId, s.teacherId, s.subjectId, s.typeSoruId, tarih, s.students[0]],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("rehber KENDİ açmadığı etüdü güncelleyemez", async () => {
    // Öğretmenin kendi açtığı etüt.
    const { rows } = await db.asService((q: PGlite) =>
      q.query<{ id: string }>(
        `insert into etuts
           (school_id, teacher_id, subject_id, etut_type_id, tarih, baslangic, bitis,
            kontenjan, durum, created_by)
         values ($1,$2,$3,$4,$5,'13:00','14:00',5,'onaylandi',$2) returning id`,
        [s.schoolId, s.teacherId, s.subjectId, s.typeSoruId, tarih],
      ),
    );
    const { rows: etki } = await cagir<{ n: number }>(
      s.rehberId,
      `with g as (update etuts set kontenjan = 99 where id = $1 returning 1)
       select count(*)::int as n from g`,
      [rows[0].id],
    );
    expect(etki[0].n).toBe(0);
  });
});

describe("bireysel atama", () => {
  it("atanan öğrenci ETÜDÜ GÖREBİLİR", async () => {
    // Bu testin varlık sebebi dosya başlığında.
    const etut = await rehberEtudu("14:00");
    await cagir(s.rehberId, `select etude_ogrenci_ata($1, $2::uuid[])`, [
      etut,
      [s.students[0], s.otherClassStudentId],
    ]);

    const { rows } = await cagir<{ n: number }>(
      s.students[0],
      `select count(*)::int as n from etuts where id = $1`,
      [etut],
    );
    expect(rows[0].n).toBe(1);

    // Başka SINIFTAN atanan öğrenci de görebilmeli — asıl kazanım bu.
    const { rows: digeri } = await cagir<{ n: number }>(
      s.otherClassStudentId,
      `select count(*)::int as n from etuts where id = $1`,
      [etut],
    );
    expect(digeri[0].n).toBe(1);
  });

  it("ATANMAYAN öğrenci göremez", async () => {
    const etut = await rehberEtudu("15:00");
    await cagir(s.rehberId, `select etude_ogrenci_ata($1, $2::uuid[])`, [
      etut,
      [s.students[0]],
    ]);
    const { rows } = await cagir<{ n: number }>(
      s.students[1],
      `select count(*)::int as n from etuts where id = $1`,
      [etut],
    );
    expect(rows[0].n).toBe(0);
  });

  it("atanan öğrenci KENDİ ÇIKAMAZ, iptal talebi açar", async () => {
    const etut = await rehberEtudu("16:00");
    await cagir(s.rehberId, `select etude_ogrenci_ata($1, $2::uuid[])`, [
      etut,
      [s.students[2]],
    ]);

    await expect(
      cagir(s.students[2], `select rezervasyon_birak($1, $2)`, [etut, s.students[2]]),
    ).rejects.toThrow(/kendiniz çıkamazsınız/);

    // İptal talebi yolu açık ve rehber (etüdü açan) karara bağlayabiliyor.
    await cagir(s.students[2], `select iptal_talebi_olustur($1, $2, 'Çakışma var')`, [
      etut,
      s.students[2],
    ]);
    await cagir(s.rehberId, `select iptal_talebi_karar($1, $2, true)`, [
      etut,
      s.students[2],
    ]);

    const { rows } = await db.asService((q: PGlite) =>
      q.query<{ durum: string }>(
        `select durum::text from reservations where etut_id = $1 and student_id = $2`,
        [etut, s.students[2]],
      ),
    );
    expect(rows[0].durum).toBe("iptal");
  });

  it("BAŞKA OKULUN öğrencisi atanamaz", async () => {
    const etut = await rehberEtudu("17:00");
    const { rows } = await cagir<{ etude_ogrenci_ata: number }>(
      s.rehberId,
      `select etude_ogrenci_ata($1, $2::uuid[])`,
      [etut, [okulB.students[0]]],
    );
    expect(rows[0].etude_ogrenci_ata).toBe(0);
  });

  it("YETKİSİZ kişi atama yapamaz", async () => {
    const etut = await rehberEtudu("18:00");
    await expect(
      cagir(s.teacher2Id, `select etude_ogrenci_ata($1, $2::uuid[])`, [
        etut,
        [s.students[0]],
      ]),
    ).rejects.toThrow(/yetkiniz yok/);
  });
});

describe("öğretmen onayı", () => {
  it("onay bekleyen etüt öğrenciye GÖRÜNMEZ", async () => {
    const etut = await rehberEtudu("19:00", "onay_bekliyor");
    await cagir(s.rehberId, `select etude_ogrenci_ata($1, $2::uuid[])`, [
      etut,
      [s.students[3]],
    ]);
    const { rows } = await cagir<{ n: number }>(
      s.students[3],
      `select count(*)::int as n from etuts where id = $1`,
      [etut],
    );
    expect(rows[0].n).toBe(0);
  });

  it("öğretmene bildirim gider", async () => {
    const { rows } = await db.asService((q: PGlite) =>
      q.query<{ n: number }>(
        `select count(*)::int as n from notifications
          where user_id = $1 and tip in ('etut_onayin_bekleniyor','etut_sizin_adiniza')`,
        [s.teacherId],
      ),
    );
    expect(rows[0].n).toBeGreaterThan(0);
  });
});

describe("etut_recurrences daraltıldı", () => {
  it("rehber haftalık tekrar kaydı yazamaz", async () => {
    // 0004'teki politika `is_staff()` kullanıyordu ve rehberi de kapsıyordu;
    // tabloyu yalnızca öğretmenin etüt akışı yazıyor.
    await expect(
      cagir(
        s.rehberId,
        `insert into etut_recurrences (school_id, kural, created_by) values ($1,'{}'::jsonb,$2)`,
        [s.schoolId, s.rehberId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("öğretmen yazabilir", async () => {
    await expect(
      cagir(
        s.teacherId,
        `insert into etut_recurrences (school_id, kural, created_by) values ($1,'{}'::jsonb,$2)`,
        [s.schoolId, s.teacherId],
      ),
    ).resolves.toBeDefined();
  });
});
