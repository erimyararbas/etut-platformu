/**
 * Deneme sınavı sonuçları (0027).
 *
 * İki ayrı iddia korunuyor:
 *
 * 1. GÖRÜNÜRLÜK REHBERLİK VERİSİNDEN FARKLIDIR. Deneme neti akademik bir
 *    ölçüdür; öğrenci, velisi ve okul personeli görür. 0023'ün "yönetici bile
 *    göremez" kuralı buraya UZANMAZ ve uzanmamalı — ama biri bir gün
 *    "rehberlik verisi gibi kapatalım" derse veli çocuğunun denemesini
 *    göremez hâle gelir. Yöneticinin GÖREBİLDİĞİNİ doğrulayan test bu yüzden
 *    var.
 *
 * 2. YAZMA TEK ELDEN. Öğretmen deneme giremez: aynı sınav iki kez, farklı
 *    adlarla açılırsa karşılaştırma imkânsız hâle gelir.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, type TestDb } from "./db";
import { seedSchool, type SeededSchool } from "./seed";

let db: TestDb;
let s: SeededSchool;
let okulB: SeededSchool;
let sinavId: string;

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
    `insert into mock_exams (school_id, ad, tarih, tur, olusturan)
     values ($1, 'TYT Deneme 1', current_date - 7, 'TYT', $2) returning id`,
    [s.schoolId, s.rehberId],
  );
  sinavId = rows[0].id;

  // students[0] için sonuç: Matematik 20 doğru 4 yanlış → net 19
  const { rows: sonuc } = await cagir<{ id: string }>(
    s.rehberId,
    `insert into mock_exam_results (school_id, exam_id, student_id, puan, siralama)
     values ($1,$2,$3, 412.5, 1240) returning id`,
    [s.schoolId, sinavId, s.students[0]],
  );
  await cagir(
    s.rehberId,
    `insert into mock_exam_subject_results
       (school_id, result_id, student_id, subject_id, dogru, yanlis, bos)
     values ($1,$2,$3,$4, 20, 4, 1)`,
    [s.schoolId, sonuc[0].id, s.students[0], s.subjectId],
  );
}, 120000);

afterAll(async () => db?.close());

const sonucSayisi = async (kullanici: string) => {
  const { rows } = await cagir<{ n: number }>(
    kullanici,
    `select count(*)::int as n from mock_exam_results`,
  );
  return rows[0].n;
};

describe("deneme sonucu görünürlüğü", () => {
  it("öğrenci kendi sonucunu görür", async () => {
    expect(await sonucSayisi(s.students[0])).toBe(1);
  });

  it("velisi görür", async () => {
    expect(await sonucSayisi(s.parentId)).toBe(1);
  });

  it("öğretmen ve rehber görür", async () => {
    expect(await sonucSayisi(s.teacherId)).toBe(1);
    expect(await sonucSayisi(s.rehberId)).toBe(1);
  });

  it("YÖNETİCİ DE GÖRÜR — bu rehberlik verisi değil", async () => {
    // 0023'ün gizlilik kuralı denemeye uzanmaz. Bu test o ayrımı kayıt altına
    // alıyor: biri denemeyi de kapatırsa buradan haberdar oluruz.
    expect(await sonucSayisi(s.adminId)).toBe(1);
  });

  it("BAŞKA ÖĞRENCİ göremez", async () => {
    expect(await sonucSayisi(s.students[1])).toBe(0);
  });

  it("BAŞKA OKUL göremez", async () => {
    expect(await sonucSayisi(okulB.rehberId)).toBe(0);
    expect(await sonucSayisi(okulB.adminId)).toBe(0);
  });

  it("sınav listesi okulun tamamına açık, başka okula kapalı", async () => {
    const sayi = async (k: string) => {
      const { rows } = await cagir<{ n: number }>(
        k,
        `select count(*)::int as n from mock_exams`,
      );
      return rows[0].n;
    };
    expect(await sayi(s.students[1])).toBe(1); // sonucu olmayan öğrenci de sınavı görür
    expect(await sayi(okulB.rehberId)).toBe(0);
  });
});

describe("deneme yazma yetkisi", () => {
  it("rehber ve yönetici yazabilir", async () => {
    await expect(
      cagir(
        s.adminId,
        `insert into mock_exams (school_id, ad, tarih, olusturan) values ($1,'AYT Deneme 1', current_date, $2)`,
        [s.schoolId, s.adminId],
      ),
    ).resolves.toBeDefined();
  });

  it("ÖĞRETMEN deneme açamaz", async () => {
    // Tek elden giriş kuralı: aynı sınav iki kez açılırsa karşılaştırma biter.
    await expect(
      cagir(
        s.teacherId,
        `insert into mock_exams (school_id, ad, tarih, olusturan) values ($1,'Kaçak Deneme', current_date, $2)`,
        [s.schoolId, s.teacherId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("ÖĞRENCİ kendi sonucunu yazamaz", async () => {
    await expect(
      cagir(
        s.students[1],
        `insert into mock_exam_results (school_id, exam_id, student_id) values ($1,$2,$3)`,
        [s.schoolId, sinavId, s.students[1]],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("BAŞKA OKULUN rehberi bu okula sonuç yazamaz", async () => {
    await expect(
      cagir(
        okulB.rehberId,
        `insert into mock_exam_results (school_id, exam_id, student_id) values ($1,$2,$3)`,
        [s.schoolId, sinavId, s.students[1]],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("aynı sınava aynı öğrenci iki kez yazılamaz", async () => {
    await expect(
      cagir(
        s.rehberId,
        `insert into mock_exam_results (school_id, exam_id, student_id) values ($1,$2,$3)`,
        [s.schoolId, sinavId, s.students[0]],
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });
});

describe("net hesabı", () => {
  it("çalışma takibiyle AYNI formülü kullanır", async () => {
    // net_hesapla tek tanım (0016). Deneme kendi formülünü yazsaydı, aynı
    // öğrencinin çalışma neti ile deneme neti farklı kurallarla hesaplanırdı.
    const { rows } = await cagir<{ net: string; ders: string }>(
      s.students[0],
      `select ders, net from ogrenci_deneme_gecmisi($1)`,
      [s.students[0]],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].net)).toBe(19); // 20 − 4/4
  });

  it("deneme_sonuclari toplam neti verir", async () => {
    const { rows } = await cagir<{ toplam_net: string; okul_no: string }>(
      s.rehberId,
      `select okul_no, toplam_net from deneme_sonuclari($1)`,
      [sinavId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].okul_no).toBe("200");
    expect(Number(rows[0].toplam_net)).toBe(19);
  });

  it("geçmiş fonksiyonu BAŞKA öğrenci için boş döner", async () => {
    // SECURITY INVOKER: fonksiyon yetki kontrolü yapmıyor, RLS süzüyor.
    const { rows } = await cagir(
      s.students[1],
      `select * from ogrenci_deneme_gecmisi($1)`,
      [s.students[0]],
    );
    expect(rows).toHaveLength(0);
  });
});
