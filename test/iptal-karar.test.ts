/**
 * İptal talebinin karara bağlanması (0026).
 *
 * Bu dosya bir hatanın üzerine yazıldı: karar adımı öğretmenin oturumuyla
 * `reservations` tablosuna doğrudan UPDATE atıyordu, oysa `authenticated`
 * rolünün o tabloda yalnızca SELECT yetkisi var (0005). GRANT olmadan RLS hiç
 * değerlendirilmediği için işlem üretimde sessizce başarısız oluyordu ve
 * testler bu adıma hiç gelmiyordu — talep AÇMA adımına kadar test edilmişti.
 *
 * Buradaki en önemli test bekleme listesini doğrulayan test: iptal onayı yeri
 * boşaltıyorsa sıradaki öğrenci alınmalı. Eski kod boşaltıyor ama almıyordu,
 * yani bekleyen öğrenci önündeki kişi çıkmasına rağmen bekliyordu.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, type TestDb } from "./db";
import { seedSchool, createEtut, gelecekHaftaTarihi, type SeededSchool } from "./seed";

let db: TestDb;
let s: SeededSchool;
let tarih: string;

beforeAll(async () => {
  db = await createTestDb();
  s = await seedSchool(db);
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

const cagir = <T = Record<string, unknown>>(
  kullanici: string,
  sql: string,
  params: unknown[] = [],
) => db.as(kullanici, (q: PGlite) => q.query<T>(sql, params));

/** Sınıf etüdü kurar ve 11-A öğrencilerini atar. */
async function sinifEtudu(saat: string, kontenjan = 4) {
  const etut = await createEtut(db, s, {
    tarih,
    baslangic: saat,
    bitis: `${String(Number(saat.slice(0, 2)) + 1).padStart(2, "0")}:00`,
    kontenjan,
    sinifEtudu: true,
    roomId: null,
  });
  await db.asService((q) =>
    q.query(`select sinif_etudu_ogrencileri_ata($1)`, [etut]),
  );
  return etut;
}

const talepAc = (etutId: string, ogrenciId: string) =>
  cagir(ogrenciId, `select iptal_talebi_olustur($1, $2, 'Doktor randevusu')`, [
    etutId,
    ogrenciId,
  ]);

const karar = (kullanici: string, etutId: string, ogrenciId: string, onay: boolean) =>
  cagir<{ iptal_talebi_karar: string | null }>(
    kullanici,
    `select iptal_talebi_karar($1, $2, $3)`,
    [etutId, ogrenciId, onay],
  );

const kayit = (etutId: string, ogrenciId: string) =>
  db.asService(async (q: PGlite) => {
    const { rows } = await q.query<{ durum: string; iptal_talebi: string; sira_no: number | null }>(
      `select durum::text, iptal_talebi::text, sira_no from reservations
        where etut_id = $1 and student_id = $2`,
      [etutId, ogrenciId],
    );
    return rows[0];
  });

describe("iptal talebi kararı", () => {
  it("öğretmen onaylayınca kayıt düşer", async () => {
    const etut = await sinifEtudu("09:00");
    await talepAc(etut, s.students[0]);

    const sonuc = await karar(s.teacherId, etut, s.students[0], true);
    expect(sonuc.rows[0].iptal_talebi_karar).toBeNull(); // sırada kimse yok

    const k = await kayit(etut, s.students[0]);
    expect(k.durum).toBe("iptal");
    expect(k.iptal_talebi).toBe("onaylandi");
  });

  it("reddedince kayıt yerinde kalır", async () => {
    const etut = await sinifEtudu("10:00");
    await talepAc(etut, s.students[1]);

    await karar(s.teacherId, etut, s.students[1], false);

    const k = await kayit(etut, s.students[1]);
    expect(k.durum).toBe("atandi");
    expect(k.iptal_talebi).toBe("reddedildi");
  });

  it("ONAY BEKLEME LİSTESİNİ İLERLETİR", async () => {
    // Asıl kazanım bu: eski kod yeri boşaltıyor ama sıradakini almıyordu.
    const etut = await createEtut(db, s, {
      tarih,
      baslangic: "11:00",
      bitis: "12:00",
      kontenjan: 1,
      sinifEtudu: true,
      roomId: null,
    });
    // Tek kişilik sınıf etüdü kurmak yerine elle atıyoruz: 'atandi' olan
    // öğrenci ile 'beklemede' olan öğrenciyi aynı etütte istiyoruz.
    await db.asService((q) =>
      q.query(
        `insert into reservations (school_id, etut_id, student_id, durum)
         values ($1,$2,$3,'atandi')`,
        [s.schoolId, etut, s.students[0]],
      ),
    );
    await db.asService((q) =>
      q.query(
        `insert into reservations (school_id, etut_id, student_id, durum, sira_no)
         values ($1,$2,$3,'beklemede',1)`,
        [s.schoolId, etut, s.students[1]],
      ),
    );

    await talepAc(etut, s.students[0]);
    const sonuc = await karar(s.teacherId, etut, s.students[0], true);

    expect(sonuc.rows[0].iptal_talebi_karar).toBe(s.students[1]);
    expect((await kayit(etut, s.students[1])).durum).toBe("rezerve");
    expect((await kayit(etut, s.students[1])).sira_no).toBeNull();
  });

  it("yükseltilen öğrenciye bildirim gider", async () => {
    // Bekleme listesi bildirimsiz işlevsizdir: öğrenci alındığını bilmezse
    // etüde gelmez. Yükseltme trigger'ının bu yoldan da tetiklendiğini
    // doğruluyoruz.
    const { rows } = await db.asService((q: PGlite) =>
      q.query<{ n: number }>(
        `select count(*)::int as n from notifications
          where user_id = $1 and tip = 'siradan_gecti'`,
        [s.students[1]],
      ),
    );
    expect(rows[0].n).toBeGreaterThan(0);
  });
});

describe("iptal talebi kararı — yetki", () => {
  it("başka bir öğretmen karara bağlayamaz", async () => {
    const etut = await sinifEtudu("13:00");
    await talepAc(etut, s.students[2]);

    await expect(karar(s.teacher2Id, etut, s.students[2], true)).rejects.toThrow(
      /yetkiniz yok/,
    );
  });

  it("ÖĞRENCİ KENDİ TALEBİNİ ONAYLAYAMAZ", async () => {
    // Aksi hâlde iptal talebi mekanizmasının tamamı anlamsız olurdu:
    // öğrenci talebi açıp kendisi onaylayarak sınıf etüdünden çıkardı.
    const etut = await sinifEtudu("14:00");
    await talepAc(etut, s.students[2]);

    await expect(karar(s.students[2], etut, s.students[2], true)).rejects.toThrow(
      /yetkiniz yok/,
    );
  });

  it("okulun yöneticisi karara bağlayabilir", async () => {
    const etut = await sinifEtudu("15:00");
    await talepAc(etut, s.students[3]);

    await karar(s.adminId, etut, s.students[3], true);
    expect((await kayit(etut, s.students[3])).durum).toBe("iptal");
  });

  it("aynı talep iki kez karara bağlanamaz", async () => {
    const etut = await sinifEtudu("16:00");
    await talepAc(etut, s.students[0]);

    await karar(s.teacherId, etut, s.students[0], false);
    await expect(karar(s.teacherId, etut, s.students[0], true)).rejects.toThrow(
      /zaten karara bağlanmış/,
    );
  });
});

describe("reservations yazma yolu", () => {
  it("authenticated rolü tabloya DOĞRUDAN yazamaz", async () => {
    // Bu testin varlık sebebi: bir gün biri "kolay olsun" diye
    // `grant update on reservations to authenticated` yazarsa, kontenjan ve
    // bekleme listesi mantığını atlayan bir yazma yolu açılır. 0004'ün kuralı
    // bu: yazma yalnızca SECURITY DEFINER fonksiyonlarıyla.
    const etut = await sinifEtudu("17:00");
    await expect(
      cagir(
        s.teacherId,
        `update reservations set durum = 'iptal' where etut_id = $1`,
        [etut],
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
