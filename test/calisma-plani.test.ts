/**
 * Haftalık çalışma planı (0028).
 *
 * Korunan iki çizgi:
 *
 * 1. PLANI KİM YAZAR. Rehber ve öğrencinin MENTÖRÜ; düz öğretmen yazamaz.
 *    Bu ayrım `is_staff()` ile ifade edilemiyor (mentor onun içinde değil,
 *    düz öğretmen içinde) — yani biri "kolay olsun" diye `is_staff()`e
 *    çevirirse yetki hem genişler hem daralır. Testler her iki yönü de tutuyor.
 *
 * 2. ÖĞRENCİ YALNIZCA İŞARETLER. Kendi planının hedefini değiştirememeli;
 *    aksi hâlde "40 soru" hedefini 4'e çekip "yaptım" diyebilirdi. Bu kolon
 *    düzeyinde GRANT ile sağlanıyor, politikayla değil — politika satırı
 *    seçer, kolonu seçmez.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, type TestDb } from "./db";
import { seedSchool, type SeededSchool } from "./seed";

let db: TestDb;
let s: SeededSchool;
let okulB: SeededSchool;
let planId: string;
let ogeId: string;

const cagir = <T = Record<string, unknown>>(
  kullanici: string,
  sql: string,
  params: unknown[] = [],
) => db.as(kullanici, (q: PGlite) => q.query<T>(sql, params));

beforeAll(async () => {
  db = await createTestDb();
  s = await seedSchool(db);
  okulB = await seedSchool(db, "ikinci-okul");

  // students[0..3] mentörü teacherId; otherClassStudentId'in mentörü yok.
  const { rows } = await cagir<{ id: string }>(
    s.rehberId,
    `insert into study_plans (school_id, student_id, hafta_basi, olusturan, not_metni)
     values ($1,$2, date_trunc('week', current_date)::date, $3, 'Deneme öncesi hafta')
     returning id`,
    [s.schoolId, s.students[0], s.rehberId],
  );
  planId = rows[0].id;

  const { rows: oge } = await cagir<{ id: string }>(
    s.rehberId,
    `insert into study_plan_items
       (school_id, plan_id, student_id, gun, subject_id, hedef_soru, sira)
     values ($1,$2,$3, current_date, $4, 40, 0) returning id`,
    [s.schoolId, planId, s.students[0], s.subjectId],
  );
  ogeId = oge[0].id;
}, 120000);

afterAll(async () => db?.close());

const planSayisi = async (kullanici: string) => {
  const { rows } = await cagir<{ n: number }>(
    kullanici,
    `select count(*)::int as n from study_plans`,
  );
  return rows[0].n;
};

describe("plan görünürlüğü", () => {
  it("öğrenci, velisi ve personel görür", async () => {
    expect(await planSayisi(s.students[0])).toBe(1);
    expect(await planSayisi(s.parentId)).toBe(1);
    expect(await planSayisi(s.teacherId)).toBe(1);
    expect(await planSayisi(s.rehberId)).toBe(1);
    expect(await planSayisi(s.adminId)).toBe(1);
  });

  it("BAŞKA ÖĞRENCİ göremez", async () => {
    expect(await planSayisi(s.students[1])).toBe(0);
  });

  it("BAŞKA OKUL göremez", async () => {
    expect(await planSayisi(okulB.rehberId)).toBe(0);
  });
});

describe("planı kim yazar", () => {
  const planYaz = (kullanici: string, ogrenci: string, hafta: string) =>
    cagir(
      kullanici,
      `insert into study_plans (school_id, student_id, hafta_basi, olusturan)
       values ($1,$2,$3::date,$4)`,
      [s.schoolId, ogrenci, hafta, kullanici],
    );

  it("rehber okulun her öğrencisine yazabilir", async () => {
    await expect(
      planYaz(s.rehberId, s.students[1], "2026-10-05"),
    ).resolves.toBeDefined();
  });

  it("mentör KENDİ öğrencisine yazabilir", async () => {
    // teacherId, students[0..3]'ün mentörü (seed).
    await expect(
      planYaz(s.teacherId, s.students[2], "2026-10-05"),
    ).resolves.toBeDefined();
  });

  it("MENTÖRÜ OLMADIĞI öğrenciye yazamaz", async () => {
    // otherClassStudentId'in mentörü yok; teacherId onun mentörü değil.
    await expect(
      planYaz(s.teacherId, s.otherClassStudentId, "2026-10-05"),
    ).rejects.toThrow(/row-level security/i);
  });

  it("DÜZ ÖĞRETMEN yazamaz", async () => {
    // teacher2Id hiçbir öğrencinin mentörü değil ve rehber de değil.
    await expect(
      planYaz(s.teacher2Id, s.students[0], "2026-10-12"),
    ).rejects.toThrow(/row-level security/i);
  });

  it("ÖĞRENCİ kendine plan yazamaz", async () => {
    // Plan "başkasının koyduğu program"dır; kendi hedefleri için study_goals var.
    await expect(
      planYaz(s.students[0], s.students[0], "2026-10-19"),
    ).rejects.toThrow(/row-level security/i);
  });

  it("olusturan alanı oturumdan başkası olamaz", async () => {
    await expect(
      cagir(
        s.rehberId,
        `insert into study_plans (school_id, student_id, hafta_basi, olusturan)
         values ($1,$2,'2026-10-26',$3)`,
        [s.schoolId, s.students[0], s.teacherId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("aynı öğrenciye aynı hafta iki plan yazılamaz", async () => {
    await expect(
      cagir(
        s.rehberId,
        `insert into study_plans (school_id, student_id, hafta_basi, olusturan)
         values ($1,$2, date_trunc('week', current_date)::date, $3)`,
        [s.schoolId, s.students[0], s.rehberId],
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });
});

describe("öğrencinin işaretlemesi", () => {
  it("kendi öğesini yapıldı diye işaretleyebilir", async () => {
    await cagir(
      s.students[0],
      `update study_plan_items set durum = 'yapildi', isaretlendi_at = now() where id = $1`,
      [ogeId],
    );
    const { rows } = await cagir<{ durum: string }>(
      s.students[0],
      `select durum::text from study_plan_items where id = $1`,
      [ogeId],
    );
    expect(rows[0].durum).toBe("yapildi");
  });

  it("HEDEF SORU SAYISINI DEĞİŞTİREMEZ", async () => {
    // Kolon düzeyinde GRANT'in bütün mesele olduğu yer burası.
    await expect(
      cagir(s.students[0], `update study_plan_items set hedef_soru = 4 where id = $1`, [
        ogeId,
      ]),
    ).rejects.toThrow(/permission denied|column/i);
  });

  it("BAŞKA ÖĞRENCİNİN öğesini işaretleyemez", async () => {
    const { rows } = await cagir<{ n: number }>(
      s.students[1],
      `with g as (
         update study_plan_items set durum = 'yapildi' where id = $1 returning 1
       ) select count(*)::int as n from g`,
      [ogeId],
    );
    expect(rows[0].n).toBe(0);
  });

  it("öğrenci öğe EKLEYEMEZ", async () => {
    await expect(
      cagir(
        s.students[0],
        `insert into study_plan_items (school_id, plan_id, student_id, gun)
         values ($1,$2,$3, current_date)`,
        [s.schoolId, planId, s.students[0]],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("VELİ işaretleyemez", async () => {
    // Veli planı görür ama öğrencinin yerine "yaptı" diyemez.
    const { rows } = await cagir<{ n: number }>(
      s.parentId,
      `with g as (
         update study_plan_items set durum = 'yapilmadi' where id = $1 returning 1
       ) select count(*)::int as n from g`,
      [ogeId],
    );
    expect(rows[0].n).toBe(0);
  });
});

describe("bildirim", () => {
  it("plan yazılınca öğrenciye bildirim gider", async () => {
    const { rows } = await db.asService((q: PGlite) =>
      q.query<{ n: number; govde: string }>(
        `select count(*)::int as n, min(govde) as govde from notifications
          where user_id = $1 and tip = 'plan_atandi'`,
        [s.students[0]],
      ),
    );
    expect(rows[0].n).toBe(1);
    expect(rows[0].govde).toMatch(/plan yazdı/);
  });
});
