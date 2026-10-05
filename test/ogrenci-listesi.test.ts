/**
 * `ogrenci_etut_listesi` — öğrenci ekranının tek veri kaynağı.
 *
 * Bu testler RLS altında çalışır (`db.as`), yani öğrencinin gerçekten neyi
 * görebildiğini doğrular; fonksiyonun döndürdüğü satırlar RLS'ten geçmiş
 * satırlardır.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./db";
import { seedSchool, createEtut, gelecekHaftaTarihi, type SeededSchool } from "./seed";

let db: TestDb;
let s: SeededSchool;
let tarih: string;

interface Satir {
  id: string;
  ders: string;
  dolu: number;
  bekleyen: number;
  benim_durumum: string | null;
  benim_siram: number | null;
  rezervasyon_acik: boolean;
  cakisma: boolean;
  sinif_etudu_mu: boolean;
}

const liste = (kullanici: string, ogrenci: string) =>
  db.as(kullanici, async (q) => {
    const { rows } = await q.query<Satir>(`select * from ogrenci_etut_listesi($1)`, [ogrenci]);
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
  tarih = await gelecekHaftaTarihi(db);
}, 120000);

afterAll(async () => db?.close());

describe("görünürlük", () => {
  it("öğrenci yalnızca kendi sınıfına açık, onaylı etütleri görür", async () => {
    await createEtut(db, s, { tarih, baslangic: "09:00", bitis: "10:00", classes: [s.classAId] });
    await createEtut(db, s, {
      tarih,
      baslangic: "10:00",
      bitis: "11:00",
      classes: [s.classBId],
      roomId: s.room2Id,
    });
    await createEtut(db, s, {
      tarih,
      baslangic: "11:00",
      bitis: "12:00",
      durum: "onay_bekliyor",
      roomId: null,
    });

    // 11-A öğrencisi: yalnızca ilk etüt
    const a = await liste(s.students[0], s.students[0]);
    expect(a).toHaveLength(1);
    expect(a[0].rezervasyon_acik).toBe(true);

    // 11-B öğrencisi: yalnızca ikinci etüt
    const b = await liste(s.otherClassStudentId, s.otherClassStudentId);
    expect(b).toHaveLength(1);
  });

  it("onaylanmamış etüt listede yer almaz", async () => {
    const a = await liste(s.students[0], s.students[0]);
    expect(a.every((x) => x.rezervasyon_acik !== undefined)).toBe(true);
    // Yukarıda oluşturulan 'onay_bekliyor' etüt hiçbir öğrencide görünmemeli.
    expect(a).toHaveLength(1);
  });
});

describe("doluluk ve kendi durumu", () => {
  it("rezervasyondan sonra kendi durumunu gösterir", async () => {
    const etut = await createEtut(db, s, {
      tarih,
      baslangic: "13:00",
      bitis: "14:00",
      kontenjan: 1,
      roomId: s.room2Id,
    });

    await db.as(s.students[0], (q) =>
      q.query(`select rezervasyon_yap($1,$2)`, [etut, s.students[0]]),
    );

    const satir = (await liste(s.students[0], s.students[0])).find((x) => x.id === etut)!;
    expect(satir.benim_durumum).toBe("rezerve");
    expect(satir.dolu).toBe(1);
  });

  let doluEtut: string;

  it("kontenjan dolunca sıraya gireni ve sıra numarasını gösterir", async () => {
    doluEtut = (await liste(s.students[0], s.students[0])).find((x) => x.dolu === 1)!.id;
    const etut = doluEtut;

    await db.as(s.students[1], (q) =>
      q.query(`select rezervasyon_yap($1,$2)`, [etut, s.students[1]]),
    );

    const ikinci = (await liste(s.students[1], s.students[1])).find((x) => x.id === etut)!;
    expect(ikinci.benim_durumum).toBe("beklemede");
    expect(Number(ikinci.benim_siram)).toBe(1);
    expect(ikinci.bekleyen).toBe(1);

    // Kayıtlı öğrenci bekleyen sayısını da görür.
    const birinci = (await liste(s.students[0], s.students[0])).find((x) => x.id === etut)!;
    expect(birinci.bekleyen).toBe(1);
    expect(birinci.benim_durumum).toBe("rezerve");
  });

  it("başka bir öğrencinin durumunu sızdırmaz", async () => {
    const etut = (await liste(s.students[2], s.students[2])).find((x) => x.id === doluEtut)!;
    // students[2] hiçbir şey yapmadı: kendi durumu boş olmalı...
    expect(etut.benim_durumum).toBeNull();
    // ...ama doluluğu doğru görmeli (kontenjan çubuğu için gerekli).
    expect(etut.dolu).toBe(1);
    expect(etut.bekleyen).toBe(1);
  });
});

describe("çakışma", () => {
  it("aynı saatte kayıtlı olunan etütleri çakışma olarak işaretler", async () => {
    // students[0] 13:00–14:00'e kayıtlı. Aynı saate ikinci bir etüt açalım.
    const cakisan = await createEtut(db, s, {
      tarih,
      baslangic: "13:30",
      bitis: "14:30",
      teacherId: s.teacher2Id,
      roomId: s.roomId,
    });

    const satir = (await liste(s.students[0], s.students[0])).find((x) => x.id === cakisan)!;
    expect(satir.cakisma).toBe(true);

    // Kaydı olmayan öğrenci için çakışma yok.
    const digeri = (await liste(s.students[3], s.students[3])).find((x) => x.id === cakisan)!;
    expect(digeri.cakisma).toBe(false);
  });
});

describe("rezervasyon penceresi", () => {
  it("geçmiş etüt listede görünür ama rezervasyona kapalıdır", async () => {
    const gecmis = await db.asService(async (q) => {
      const { rows } = await q.query<{ d: string }>(
        `select to_char((now() at time zone 'Europe/Istanbul')::date - 3, 'YYYY-MM-DD') as d`,
      );
      return rows[0].d;
    });

    const etut = await createEtut(db, s, {
      tarih: gecmis,
      baslangic: "15:00",
      bitis: "16:00",
      roomId: null,
    });

    const satir = (await liste(s.students[3], s.students[3])).find((x) => x.id === etut)!;
    expect(satir.rezervasyon_acik).toBe(false);
  });
});

describe("iptal talebi", () => {
  it("sınıf etüdünde talep oluşturulur", async () => {
    const etut = await createEtut(db, s, {
      tarih,
      baslangic: "07:00",
      bitis: "08:00",
      sinifEtudu: true,
      typeId: s.typeSinifId,
      roomId: null,
    });
    await db.asService((q) => q.query(`select sinif_etudu_ogrencileri_ata($1)`, [etut]));

    await db.as(s.students[0], (q) =>
      q.query(`select iptal_talebi_olustur($1,$2,$3)`, [etut, s.students[0], "Doktor randevum var"]),
    );

    const satir = (await liste(s.students[0], s.students[0])).find((x) => x.id === etut)!;
    expect(satir.benim_durumum).toBe("atandi");
    expect((satir as unknown as { iptal_talebim: string }).iptal_talebim).toBe("bekliyor");
  });

  it("öğrenci başkası adına iptal talebi açamaz", async () => {
    const etut = (await liste(s.students[0], s.students[0])).find((x) => x.sinif_etudu_mu)!.id;
    await expect(
      db.as(s.students[1], (q) =>
        q.query(`select iptal_talebi_olustur($1,$2,null)`, [etut, s.students[0]]),
      ),
    ).rejects.toThrow(/yetkiniz yok/i);
  });

  it("giriş yapmamış ziyaretçi bu fonksiyonu çağıramaz", async () => {
    const etut = (await liste(s.students[0], s.students[0])).find((x) => x.sinif_etudu_mu)!.id;
    await expect(
      db.asAnon((q) => q.query(`select iptal_talebi_olustur($1,$2,null)`, [etut, s.students[0]])),
    ).rejects.toThrow(/permission denied|yetkiniz yok/i);
  });
});
