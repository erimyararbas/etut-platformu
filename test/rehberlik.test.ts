/**
 * Rehberlik servisi — erişim kuralları.
 *
 * Bu dosyadaki en önemli test YÖNETİCİNİN GÖREMEDİĞİNİ doğrulayan test.
 * Uygulamanın geri kalanında yönetici kendi okulunun her şeyini görür;
 * rehberlik verisinde görmez. Bu bilinçli bir istisna ve sessizce bozulması
 * çok kolay — bir gün biri "admin her şeyi görsün" diye politika eklerse
 * reşit olmayan öğrencilerin görüşme notları okul yönetimine açılır.
 *
 * Prototipin kendi sözü: "Rehberlik notları gizlidir · yalnız rehberlik
 * servisi görür."
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./db";
import { seedSchool, type SeededSchool } from "./seed";
import type { PGlite } from "@electric-sql/pglite";

let db: TestDb;
let s: SeededSchool;
let okulB: SeededSchool;
let vakaId: string;

const cagir = <T = Record<string, unknown>>(
  kullanici: string,
  sql: string,
  params: unknown[] = [],
) => db.as(kullanici, (q: PGlite) => q.query<T>(sql, params));

beforeAll(async () => {
  db = await createTestDb();
  s = await seedSchool(db);
  okulB = await seedSchool(db, "ikinci-okul");

  const { rows } = await cagir<{ id: string }>(
    s.rehberId,
    `insert into counseling_cases (school_id, student_id, acan, baslik, oncelik)
     values ($1,$2,$3,'Sınav kaygısı','yuksek') returning id`,
    [s.schoolId, s.students[0], s.rehberId],
  );
  vakaId = rows[0].id;
}, 120000);

afterAll(async () => db?.close());

const vakaSayisi = async (kullanici: string) => {
  const { rows } = await cagir<{ n: number }>(
    kullanici,
    `select count(*)::int as n from counseling_cases`,
  );
  return rows[0].n;
};

describe("vaka görünürlüğü", () => {
  it("rehber kendi okulunun vakalarını görür", async () => {
    expect(await vakaSayisi(s.rehberId)).toBe(1);
    expect(await vakaSayisi(s.rehber2Id)).toBe(1);
  });

  it("YÖNETİCİ vakaları GÖREMEZ", async () => {
    // Bilinçli istisna: rehberlik verisi okul yönetimine kapalı.
    expect(await vakaSayisi(s.adminId)).toBe(0);
  });

  it("öğretmen ve mentör göremez", async () => {
    expect(await vakaSayisi(s.teacherId)).toBe(0);
    expect(await vakaSayisi(s.teacher2Id)).toBe(0);
  });

  it("öğrencinin kendisi ve velisi göremez", async () => {
    expect(await vakaSayisi(s.students[0])).toBe(0);
    expect(await vakaSayisi(s.parentId)).toBe(0);
  });

  it("başka okulun rehberi göremez", async () => {
    expect(await vakaSayisi(okulB.rehberId)).toBe(0);
  });

  it("yönetici vaka açamaz", async () => {
    await expect(
      cagir(
        s.adminId,
        `insert into counseling_cases (school_id, student_id, acan, baslik)
         values ($1,$2,$3,'Yönetici vakası')`,
        [s.schoolId, s.students[1], s.adminId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe("görüşme notları", () => {
  it("varsayılan görünürlük yalnızca rehberliktir", async () => {
    await cagir(
      s.rehberId,
      `insert into case_notes (school_id, case_id, yazan, metin)
       values ($1,$2,$3,'İlk görüşme yapıldı.')`,
      [s.schoolId, vakaId, s.rehberId],
    );

    const say = async (k: string) => {
      const { rows } = await cagir<{ n: number }>(
        k,
        `select count(*)::int as n from case_notes`,
      );
      return rows[0].n;
    };

    expect(await say(s.rehberId)).toBe(1);
    expect(await say(s.adminId)).toBe(0);
    expect(await say(s.teacherId)).toBe(0);
    expect(await say(s.parentId)).toBe(0);
  });

  it("'yalnızca yazan' not diğer rehbere de kapalıdır", async () => {
    await cagir(
      s.rehberId,
      `insert into case_notes (school_id, case_id, yazan, metin, yalnizca_yazan)
       values ($1,$2,$3,'Kişisel değerlendirmem', true)`,
      [s.schoolId, vakaId, s.rehberId],
    );

    const { rows: yazan } = await cagir<{ n: number }>(
      s.rehberId,
      `select count(*)::int as n from case_notes where yalnizca_yazan`,
    );
    const { rows: oteki } = await cagir<{ n: number }>(
      s.rehber2Id,
      `select count(*)::int as n from case_notes where yalnizca_yazan`,
    );

    expect(yazan[0].n).toBe(1);
    expect(oteki[0].n).toBe(0);
  });

  it("görünürlüğü genişletilen not ilgili role açılır", async () => {
    await cagir(
      s.rehberId,
      `insert into case_notes (school_id, case_id, yazan, metin, gorunurluk)
       values ($1,$2,$3,'Derste öne oturtulması iyi olur.', '{rehber,mentor}')`,
      [s.schoolId, vakaId, s.rehberId],
    );

    const { rows: mentor } = await cagir<{ n: number }>(
      // s.teacherId hem ogretmen hem mentor rolünde (tohum).
      s.teacherId,
      `select count(*)::int as n from case_notes where 'mentor' = any (gorunurluk)`,
    );
    expect(mentor[0].n).toBe(1);

    // Paylaşılmayan notlar hâlâ kapalı.
    const { rows: hepsi } = await cagir<{ n: number }>(
      s.teacherId,
      `select count(*)::int as n from case_notes`,
    );
    expect(hepsi[0].n).toBe(1);
  });

  it("başka okulun mentörü paylaşılan notu göremez", async () => {
    const { rows } = await cagir<{ n: number }>(
      okulB.teacherId,
      `select count(*)::int as n from case_notes`,
    );
    expect(rows[0].n).toBe(0);
  });

  it("görünürlükten 'rehber' çıkarılamaz", async () => {
    await expect(
      cagir(
        s.rehberId,
        `insert into case_notes (school_id, case_id, yazan, metin, gorunurluk)
         values ($1,$2,$3,'Yalnızca veliye', '{veli}')`,
        [s.schoolId, vakaId, s.rehberId],
      ),
    ).rejects.toThrow(/case_notes_rehber_kalmali/i);
  });

  it("not başkasının adına yazılamaz", async () => {
    await expect(
      cagir(
        s.rehberId,
        `insert into case_notes (school_id, case_id, yazan, metin)
         values ($1,$2,$3,'Başkasının adına')`,
        [s.schoolId, vakaId, s.rehber2Id],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("not DEĞİŞTİRİLEMEZ ve SİLİNEMEZ", async () => {
    // Sonradan değiştirilebilen görüşme kaydı, kayıt olmaktan çıkar.
    await expect(
      cagir(s.rehberId, `update case_notes set metin = 'değişti'`),
    ).rejects.toThrow(/permission denied/i);
    await expect(cagir(s.rehberId, `delete from case_notes`)).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe("randevular", () => {
  it("veli talep açabilir", async () => {
    await expect(
      cagir(
        s.parentId,
        `insert into appointments (school_id, student_id, talep_eden, talep_notu)
         values ($1,$2,$3,'Sınav kaygısı için görüşmek istiyoruz.')`,
        [s.schoolId, s.students[0], s.parentId],
      ),
    ).resolves.toBeDefined();
  });

  it("veli doğrudan planlanmış randevu oluşturamaz", async () => {
    await expect(
      cagir(
        s.parentId,
        `insert into appointments
           (school_id, student_id, talep_eden, durum, tarih, baslangic)
         values ($1,$2,$3,'onaylandi','2026-09-20','15:00')`,
        [s.schoolId, s.students[0], s.parentId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("veli bağlı olmadığı öğrenci için talep açamaz", async () => {
    await expect(
      cagir(
        s.parentId,
        `insert into appointments (school_id, student_id, talep_eden, talep_notu)
         values ($1,$2,$3,'Başkasının çocuğu')`,
        [s.schoolId, s.students[2], s.parentId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("öğrenci ve velisi randevuyu görür, yönetici görmez", async () => {
    const say = async (k: string) => {
      const { rows } = await cagir<{ n: number }>(
        k,
        `select count(*)::int as n from appointments where student_id = $1`,
        [s.students[0]],
      );
      return rows[0].n;
    };

    expect(await say(s.students[0])).toBeGreaterThan(0);
    expect(await say(s.parentId)).toBeGreaterThan(0);
    expect(await say(s.rehberId)).toBeGreaterThan(0);
    // Randevunun varlığı bile hassas: "çocuğumun rehberlik randevusu var".
    expect(await say(s.adminId)).toBe(0);
    expect(await say(s.teacherId)).toBe(0);
  });

  it("rehber talebi planlanmış randevuya çevirir", async () => {
    const { rows } = await cagir<{ id: string }>(
      s.rehberId,
      `select id from appointments where durum = 'talep' limit 1`,
    );
    await expect(
      cagir(
        s.rehberId,
        `update appointments
            set durum = 'planlandi', tarih = '2026-09-20', baslangic = '15:00',
                rehber_id = $1
          where id = $2`,
        [s.rehberId, rows[0].id],
      ),
    ).resolves.toBeDefined();
  });

  it("planlanmış randevunun zamanı olmak zorunda", async () => {
    const { rows } = await cagir<{ id: string }>(
      s.rehberId,
      `select id from appointments limit 1`,
    );
    await expect(
      cagir(
        s.rehberId,
        `update appointments set durum = 'onaylandi', tarih = null, baslangic = null
          where id = $1`,
        [rows[0].id],
      ),
    ).rejects.toThrow(/appointments_zaman/i);
  });
});

describe("risk kuyruğu", () => {
  it("yalnızca rehberlik servisi çağırabilir", async () => {
    await expect(
      cagir(s.adminId, `select * from risk_kuyrugu()`),
    ).rejects.toThrow(/yalnızca rehberlik servisi/i);
    await expect(
      cagir(s.teacherId, `select * from risk_kuyrugu()`),
    ).rejects.toThrow(/yalnızca rehberlik servisi/i);
    await expect(
      cagir(s.students[0], `select * from risk_kuyrugu()`),
    ).rejects.toThrow(/yalnızca rehberlik servisi/i);
  });

  it("açık vakası olan öğrenci kuyrukta gerekçesiyle görünür", async () => {
    const { rows } = await cagir<{
      ogrenci_id: string;
      skor: number;
      gerekceler: string[];
    }>(s.rehberId, `select * from risk_kuyrugu()`);

    const kayit = rows.find((r) => r.ogrenci_id === s.students[0]);
    expect(kayit).toBeDefined();
    expect(kayit!.skor).toBeGreaterThan(0);
    expect(kayit!.gerekceler.join(" ")).toMatch(/açık vaka/);
  });

  it("hiçbir sinyali olmayan öğrenci kuyruğa girmez", async () => {
    // Kuyruk herkesi listelerse önceliklendirme aracı olmaktan çıkar.
    const { rows } = await cagir<{ ogrenci_id: string }>(
      s.rehberId,
      `select * from risk_kuyrugu()`,
    );
    expect(rows.find((r) => r.ogrenci_id === s.students[3])).toBeUndefined();
  });

  it("başka okulun öğrencisi kuyrukta çıkmaz", async () => {
    const { rows } = await cagir<{ ogrenci_id: string }>(
      s.rehberId,
      `select * from risk_kuyrugu()`,
    );
    for (const b of okulB.students) {
      expect(rows.find((r) => r.ogrenci_id === b)).toBeUndefined();
    }
  });
});
