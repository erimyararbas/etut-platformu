/**
 * RLS testleri: iki ayrı okul tohumlanır ve rollerin sınırları zorlanır.
 *
 * Bu testler `set role authenticated` ile çalışır — yani tablo sahibi değildirler
 * ve politikalar gerçekten devrededir.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./db";
import { seedSchool, createEtut, gelecekHaftaTarihi, type SeededSchool } from "./seed";

let db: TestDb;
let okulA: SeededSchool;
let okulB: SeededSchool;
let etutA: string;
let tarih: string;

beforeAll(async () => {
  db = await createTestDb();
  okulA = await seedSchool(db, "okul-a");
  okulB = await seedSchool(db, "okul-b");

  for (const s of [okulA, okulB]) {
    await db.asService((q) =>
      q.query(
        `update school_settings set gelecek_hafta_acilis_gun = 1, gelecek_hafta_acilis_saat = '00:00'
          where school_id = $1`,
        [s.schoolId],
      ),
    );
  }

  tarih = await gelecekHaftaTarihi(db);
  etutA = await createEtut(db, okulA, { tarih, baslangic: "16:00", bitis: "17:00", kontenjan: 5 });
  await db.asService((q) => q.query(`select rezervasyon_yap($1,$2)`, [etutA, okulA.students[0]]));
}, 120000);

afterAll(async () => db?.close());

const count = async (userId: string, sql: string, params: unknown[] = []) => {
  const { rows } = await db.as(userId, (q) =>
    q.query<{ n: number }>(`select count(*)::int as n from (${sql}) t`, params),
  );
  return Number(rows[0].n);
};

describe("okullar arası izolasyon", () => {
  it("B okulunun öğrencisi A okulunun etütlerini göremez", async () => {
    expect(await count(okulB.students[0], `select * from etuts`)).toBe(0);
  });

  it("B okulunun yöneticisi A okulunun öğrencilerini göremez", async () => {
    const gorunen = await count(okulB.adminId, `select * from students`);
    const aOgrenci = await count(okulA.adminId, `select * from students`);
    expect(aOgrenci).toBe(5); // 4 x 11-A + 1 x 11-B
    expect(gorunen).toBe(5); // yalnızca kendi okulundakiler
    const { rows } = await db.as(okulB.adminId, (q) =>
      q.query<{ school_id: string }>(`select distinct school_id from students`),
    );
    expect(rows.map((r) => r.school_id)).toEqual([okulB.schoolId]);
  });

  it("B okulunun yöneticisi A okulunun kullanıcılarını göremez", async () => {
    const { rows } = await db.as(okulB.adminId, (q) =>
      q.query<{ school_id: string }>(`select distinct school_id from users`),
    );
    expect(rows.map((r) => r.school_id)).toEqual([okulB.schoolId]);
  });

  it("B okulunun öğrencisi A okulunun etüdüne rezervasyon yapamaz", async () => {
    await expect(
      db.asService((q) => q.query(`select rezervasyon_yap($1,$2)`, [etutA, okulB.students[0]])),
    ).rejects.toThrow(/bu okula ait değil/i);
  });
});

describe("öğrenci sınırları", () => {
  it("öğrenci yalnızca kendi kullanıcı kaydını görür", async () => {
    const { rows } = await db.as(okulA.students[0], (q) =>
      q.query<{ id: string }>(`select id from users`),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(okulA.students[0]);
  });

  it("öğrenci başka öğrencinin kaydını göremez", async () => {
    const { rows } = await db.as(okulA.students[0], (q) =>
      q.query<{ user_id: string }>(`select user_id from students`),
    );
    expect(rows.map((r) => r.user_id)).toEqual([okulA.students[0]]);
  });

  it("öğrenci sınıfına açık olmayan etüdü göremez", async () => {
    expect(await count(okulA.otherClassStudentId, `select * from etuts`)).toBe(0);
    expect(await count(okulA.students[0], `select * from etuts`)).toBe(1);
  });

  it("öğrenci onaylanmamış etüdü göremez", async () => {
    const bekleyen = await createEtut(db, okulA, {
      tarih,
      baslangic: "18:00",
      bitis: "19:00",
      durum: "onay_bekliyor",
      roomId: null,
    });
    expect(await count(okulA.students[0], `select * from etuts where id = $1`, [bekleyen])).toBe(0);
    expect(await count(okulA.teacherId, `select * from etuts where id = $1`, [bekleyen])).toBe(1);
  });

  it("öğrenci denetim kaydı ve içe aktarım geçmişini göremez", async () => {
    expect(await count(okulA.students[0], `select * from audit_logs`)).toBe(0);
    expect(await count(okulA.students[0], `select * from import_batches`)).toBe(0);
  });

  it("öğrenci dizini öğrenciye kapalı, personele açıktır", async () => {
    expect(await count(okulA.students[0], `select * from v_ogrenci_dizini`)).toBe(0);
    expect(await count(okulA.teacherId, `select * from v_ogrenci_dizini`)).toBe(5);
  });
});

describe("veli sınırları", () => {
  it("veli yalnızca bağlı olduğu öğrenciyi görür", async () => {
    const { rows } = await db.as(okulA.parentId, (q) =>
      q.query<{ user_id: string }>(`select user_id from students`),
    );
    expect(rows.map((r) => r.user_id)).toEqual([okulA.students[0]]);
  });

  it("veli yalnızca kendi öğrencisinin rezervasyonlarını görür", async () => {
    const etut2 = await createEtut(db, okulA, {
      tarih,
      baslangic: "19:00",
      bitis: "20:00",
      roomId: okulA.room2Id,
      teacherId: okulA.teacher2Id,
    });
    await db.asService((q) => q.query(`select rezervasyon_yap($1,$2)`, [etut2, okulA.students[1]]));

    const { rows } = await db.as(okulA.parentId, (q) =>
      q.query<{ student_id: string }>(`select student_id from reservations`),
    );
    expect(new Set(rows.map((r) => r.student_id))).toEqual(new Set([okulA.students[0]]));
  });

  it("veli çocuğunun kayıtlı olduğu etüdü görebilir", async () => {
    expect(await count(okulA.parentId, `select * from etuts where id = $1`, [etutA])).toBe(1);
  });
});

describe("öğretmen sınırları", () => {
  it("öğretmen kendi etüdündeki rezervasyonları görür", async () => {
    expect(await count(okulA.teacherId, `select * from reservations where etut_id = $1`, [etutA])).toBe(1);
  });

  it("öğretmen başka bir öğretmenin adına etüt açamaz", async () => {
    await expect(
      db.as(okulA.teacher2Id, (q) =>
        q.query(
          `insert into etuts (school_id, teacher_id, subject_id, etut_type_id,
             tarih, baslangic, bitis, kontenjan, created_by)
           values ($1,$2,$3,$4,$5,'07:00','08:00',10,$2)`,
          [okulA.schoolId, okulA.teacherId, okulA.subjectId, okulA.typeSoruId, tarih],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("öğretmen denetim kaydını göremez, yönetici görebilir", async () => {
    await db.asService((q) =>
      q.query(
        `insert into audit_logs (school_id, actor_user_id, islem, entity)
         values ($1,$2,'etut.onayla','etuts')`,
        [okulA.schoolId, okulA.adminId],
      ),
    );
    expect(await count(okulA.teacherId, `select * from audit_logs`)).toBe(0);
    expect(await count(okulA.adminId, `select * from audit_logs`)).toBe(1);
    expect(await count(okulB.adminId, `select * from audit_logs`)).toBe(0);
  });
});

describe("bildirimler", () => {
  it("herkes yalnızca kendi bildirimini görür", async () => {
    await db.asService((q) =>
      q.query(
        `insert into notifications (school_id, user_id, tip, baslik, govde)
         values ($1,$2,'test','Başlık','Gövde'), ($1,$3,'test','Başlık','Gövde')`,
        [okulA.schoolId, okulA.students[0], okulA.students[1]],
      ),
    );
    // Yalnızca bu testin yazdığı satırlar sayılır: tetikleyiciler (0009) başka
    // testlerin rezervasyonları için de bildirim üretiyor ve toplam sayı
    // testler arası sıraya bağlı hale gelirdi.
    const testBildirimi = `select * from notifications where tip = 'test'`;
    expect(await count(okulA.students[0], testBildirimi)).toBe(1);
    expect(await count(okulA.students[1], testBildirimi)).toBe(1);
    expect(await count(okulA.adminId, testBildirimi)).toBe(0);
    expect(await count(okulB.students[0], testBildirimi)).toBe(0);
  });
});
