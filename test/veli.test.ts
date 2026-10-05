/**
 * Veli görünümü — en hassas sınır.
 *
 * Bir veli kendi çocuğunun her şeyini görmeli, BAŞKA hiçbir öğrencininkini
 * görmemeli. Buradaki testler tam olarak bunu zorluyor.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./db";
import { seedSchool, createEtut, gelecekHaftaTarihi, type SeededSchool } from "./seed";

let db: TestDb;
let s: SeededSchool;
let gecmisEtut: string;

interface GecmisSatiri {
  etut_id: string;
  ders: string;
  ogretmen_ad: string;
  kayit_durumu: string;
  yoklama: string | null;
  yildiz: number | null;
  yorum: string | null;
}

const gecmis = (kullanici: string, ogrenci: string) =>
  db.as(kullanici, async (q) => {
    const { rows } = await q.query<GecmisSatiri>(
      `select * from ogrenci_etut_gecmisi($1)`,
      [ogrenci],
    );
    return rows;
  });

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

  const tarih = await gelecekHaftaTarihi(db);
  gecmisEtut = await createEtut(db, s, { tarih, baslangic: "16:00", bitis: "17:00" });

  // students[0] (velisi olan öğrenci) ve students[1] kayıt olsun
  await db.asService((q) => q.query(`select rezervasyon_yap($1,$2)`, [gecmisEtut, s.students[0]]));
  await db.asService((q) => q.query(`select rezervasyon_yap($1,$2)`, [gecmisEtut, s.students[1]]));

  // Öğretmen yoklama alsın ve değerlendirsin (servis: zaman kilidinden muaf)
  await db.asService((q) =>
    q.query(
      `insert into attendance (school_id, etut_id, student_id, durum, marked_by)
       values ($1,$2,$3,'katildi',$4), ($1,$2,$5,'devamsiz',$4)`,
      [s.schoolId, gecmisEtut, s.students[0], s.teacherId, s.students[1]],
    ),
  );
  await db.asService((q) =>
    q.query(
      `insert into evaluations (school_id, etut_id, student_id, teacher_id, yildiz, hazir_yorumlar, yorum)
       values ($1,$2,$3,$4,5,'{"Çok başarılı."}','Zincir kuralını iyi kavradı.')`,
      [s.schoolId, gecmisEtut, s.students[0], s.teacherId],
    ),
  );
}, 120000);

afterAll(async () => db?.close());

describe("velinin öğrenci listesi", () => {
  it("veli yalnızca kendi çocuğunu görür", async () => {
    const { rows } = await db.as(s.parentId, (q) =>
      q.query<{ ogrenci_id: string; ad: string; yakinlik: string }>(
        `select ogrenci_id, ad, yakinlik from v_velinin_ogrencileri`,
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].ogrenci_id).toBe(s.students[0]);
    expect(rows[0].yakinlik).toBe("baba");
  });

  it("görünüm iletişim bilgisi içermez", async () => {
    const { rows } = await db.asService((q) =>
      q.query<{ column_name: string }>(
        `select column_name from information_schema.columns
         where table_name = 'v_velinin_ogrencileri'`,
      ),
    );
    const sutunlar = rows.map((r) => r.column_name);
    expect(sutunlar).not.toContain("telefon");
    expect(sutunlar).not.toContain("eposta");
  });

  it("velisi olmayan bir öğretmen bu görünümde satır görmez", async () => {
    const { rows } = await db.as(s.teacherId, (q) =>
      q.query(`select * from v_velinin_ogrencileri`),
    );
    expect(rows).toHaveLength(0);
  });
});

describe("etüt geçmişi", () => {
  it("veli çocuğunun katılımını ve değerlendirmesini görür", async () => {
    const satirlar = await gecmis(s.parentId, s.students[0]);
    expect(satirlar).toHaveLength(1);
    expect(satirlar[0]).toMatchObject({
      ders: "Matematik",
      ogretmen_ad: "Ahmet Yılmaz",
      yoklama: "katildi",
      yildiz: 5,
      yorum: "Zincir kuralını iyi kavradı.",
    });
  });

  it("veli BAŞKA bir öğrencinin geçmişini isteyemez", async () => {
    await expect(gecmis(s.parentId, s.students[1])).rejects.toThrow(/yetkiniz yok/i);
  });

  it("öğrenci kendi geçmişini görebilir", async () => {
    const satirlar = await gecmis(s.students[0], s.students[0]);
    expect(satirlar).toHaveLength(1);
    expect(satirlar[0].yildiz).toBe(5);
  });

  it("öğrenci başkasının geçmişini isteyemez", async () => {
    await expect(gecmis(s.students[0], s.students[1])).rejects.toThrow(/yetkiniz yok/i);
  });

  it("okul personeli öğrencinin geçmişini görebilir", async () => {
    const satirlar = await gecmis(s.teacherId, s.students[1]);
    expect(satirlar).toHaveLength(1);
    expect(satirlar[0].yoklama).toBe("devamsiz");
  });

  it("giriş yapmamış ziyaretçi çağıramaz", async () => {
    await expect(
      db.asAnon((q) => q.query(`select * from ogrenci_etut_gecmisi($1)`, [s.students[0]])),
    ).rejects.toThrow(/permission denied|yetkiniz yok/i);
  });

  it("başka okulun yöneticisi de göremez", async () => {
    const digerOkul = await seedSchool(db, "baska-okul");
    await expect(gecmis(digerOkul.adminId, s.students[0])).rejects.toThrow(/yetkiniz yok/i);
  });
});
