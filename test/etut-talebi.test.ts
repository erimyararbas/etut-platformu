/**
 * Öğrencinin etüt talebi (0030).
 *
 * Korunan çizgi: TALEP AÇMAK KARAR VERMEK DEĞİLDİR. Öğrenci kendi adına talep
 * açar ama karar alanlarına dokunamaz ve kendi talebini "karşılandı" yapamaz.
 * Bu, `mentor_submissions`ta (0022) kurulan kalıbın aynısı; oradaki gibi
 * insert politikasıyla sağlanıyor.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, type TestDb } from "./db";
import { seedSchool, type SeededSchool } from "./seed";

let db: TestDb;
let s: SeededSchool;
let okulB: SeededSchool;
let talepId: string;

const cagir = <T = Record<string, unknown>>(
  kullanici: string,
  sql: string,
  params: unknown[] = [],
) => db.as(kullanici, (q: PGlite) => q.query<T>(sql, params));

const talepAc = (kullanici: string, ogrenci: string) =>
  cagir<{ id: string }>(
    kullanici,
    `insert into etut_requests (school_id, student_id, subject_id, neden)
     values ($1,$2,$3,'Türev konusunu anlamadım') returning id`,
    [s.schoolId, ogrenci, s.subjectId],
  );

beforeAll(async () => {
  db = await createTestDb();
  s = await seedSchool(db);
  okulB = await seedSchool(db, "ikinci-okul");
  const { rows } = await talepAc(s.students[0], s.students[0]);
  talepId = rows[0].id;
}, 120000);

afterAll(async () => db?.close());

const talepSayisi = async (kullanici: string) => {
  const { rows } = await cagir<{ n: number }>(
    kullanici,
    `select count(*)::int as n from etut_requests`,
  );
  return rows[0].n;
};

describe("talep görünürlüğü", () => {
  it("öğrenci kendi talebini görür", async () => {
    expect(await talepSayisi(s.students[0])).toBe(1);
  });

  it("velisi görür", async () => {
    expect(await talepSayisi(s.parentId)).toBe(1);
  });

  it("rehber okulun tüm taleplerini görür", async () => {
    expect(await talepSayisi(s.rehberId)).toBe(1);
  });

  it("yönetici de görür", async () => {
    expect(await talepSayisi(s.adminId)).toBe(1);
  });

  it("BAŞKA ÖĞRENCİ göremez", async () => {
    expect(await talepSayisi(s.students[1])).toBe(0);
  });

  it("BAŞKA OKUL göremez", async () => {
    expect(await talepSayisi(okulB.rehberId)).toBe(0);
  });
});

describe("talep açma", () => {
  it("öğrenci BAŞKASI adına talep açamaz", async () => {
    await expect(talepAc(s.students[1], s.students[0])).rejects.toThrow(
      /row-level security/i,
    );
  });

  it("öğrenci KARAR ALANLARINI dolduramaz", async () => {
    // Doldurabilseydi kendi talebini "karşılandı" diye açardı.
    await expect(
      cagir(
        s.students[1],
        `insert into etut_requests (school_id, student_id, neden, durum, karar_veren)
         values ($1,$2,'test','karsilandi',$2)`,
        [s.schoolId, s.students[1]],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("öğrenci KENDİ talebini güncelleyemez", async () => {
    // Öğrencinin UPDATE politikası yok; GRANT var ama hiçbir satır eşleşmez.
    const { rows } = await cagir<{ n: number }>(
      s.students[0],
      `with g as (update etut_requests set durum = 'karsilandi' where id = $1 returning 1)
       select count(*)::int as n from g`,
      [talepId],
    );
    expect(rows[0].n).toBe(0);
  });

  it("ÖĞRETMEN talebi karara bağlayamaz", async () => {
    // Kuyruk rehberin; öğretmen kuyruğu ne görür ne de karara bağlar.
    const { rows } = await cagir<{ n: number }>(
      s.teacherId,
      `with g as (update etut_requests set durum = 'reddedildi', karar_veren = $2 where id = $1 returning 1)
       select count(*)::int as n from g`,
      [talepId, s.teacherId],
    );
    expect(rows[0].n).toBe(0);
  });
});

describe("talebin karara bağlanması", () => {
  it("rehber reddedebilir", async () => {
    const { rows } = await talepAc(s.students[2], s.students[2]);
    await cagir(
      s.rehberId,
      `update etut_requests set durum='reddedildi', karar_veren=$2, karar_notu='Bu hafta uygun öğretmen yok' where id=$1`,
      [rows[0].id, s.rehberId],
    );
    const { rows: son } = await db.asService((q: PGlite) =>
      q.query<{ durum: string }>(`select durum::text from etut_requests where id = $1`, [
        rows[0].id,
      ]),
    );
    expect(son[0].durum).toBe("reddedildi");
  });

  it("karara bağlanmış talep karar_veren olmadan kaydedilemez", async () => {
    await expect(
      db.asService((q: PGlite) =>
        q.query(
          `insert into etut_requests (school_id, student_id, neden, durum)
           values ($1,$2,'test','karsilandi')`,
          [s.schoolId, s.students[3]],
        ),
      ),
    ).rejects.toThrow(/etut_requests_karar|check constraint/i);
  });
});

describe("bildirimler", () => {
  it("talep açılınca REHBERLERE gider", async () => {
    const { rows } = await db.asService((q: PGlite) =>
      q.query<{ n: number }>(
        `select count(*)::int as n from notifications
          where user_id = $1 and tip = 'etut_talebi'`,
        [s.rehberId],
      ),
    );
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it("öğretmene GİTMEZ", async () => {
    const { rows } = await db.asService((q: PGlite) =>
      q.query<{ n: number }>(
        `select count(*)::int as n from notifications
          where user_id = $1 and tip = 'etut_talebi'`,
        [s.teacherId],
      ),
    );
    expect(rows[0].n).toBe(0);
  });

  it("karar öğrenciye bildirilir", async () => {
    const { rows } = await db.asService((q: PGlite) =>
      q.query<{ n: number; baslik: string }>(
        `select count(*)::int as n, min(baslik) as baslik from notifications
          where user_id = $1 and tip = 'etut_talebi_karari'`,
        [s.students[2]],
      ),
    );
    expect(rows[0].n).toBe(1);
    expect(rows[0].baslik).toMatch(/karşılanamadı/);
  });
});
