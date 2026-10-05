import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./db";
import { seedSchool, createEtut, gelecekHaftaTarihi, type SeededSchool } from "./seed";

let db: TestDb;
let s: SeededSchool;
let tarih: string;

beforeAll(async () => {
  db = await createTestDb();
  s = await seedSchool(db);
  // Gelecek hafta her zaman tamamen ileride; testleri "geçmiş etüt" sınırından
  // bağımsız kılmak için açılış anını haftanın başına çekiyoruz.
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

const rezerve = (etutId: string, studentId: string) =>
  db.asService((q) =>
    q.query<{ durum: string; sira_no: number | null }>(
      `select * from rezervasyon_yap($1, $2)`,
      [etutId, studentId],
    ),
  );

const birak = (etutId: string, studentId: string) =>
  db.asService((q) =>
    q.query<{ rezervasyon_birak: string | null }>(`select rezervasyon_birak($1, $2)`, [
      etutId,
      studentId,
    ]),
  );

describe("kontenjan ve bekleme listesi", () => {
  it("kontenjan dolana kadar rezerve, sonrasında sıraya alır", async () => {
    const etut = await createEtut(db, s, { tarih, kontenjan: 2, baslangic: "10:00", bitis: "11:00" });

    const r1 = await rezerve(etut, s.students[0]);
    const r2 = await rezerve(etut, s.students[1]);
    const r3 = await rezerve(etut, s.students[2]);
    const r4 = await rezerve(etut, s.students[3]);

    expect(r1.rows[0].durum).toBe("rezerve");
    expect(r2.rows[0].durum).toBe("rezerve");
    expect(r3.rows[0].durum).toBe("beklemede");
    expect(r3.rows[0].sira_no).toBe(1);
    expect(r4.rows[0].durum).toBe("beklemede");
    expect(r4.rows[0].sira_no).toBe(2);
  });

  it("bir kişi ayrılınca sıradaki ilk öğrenci otomatik yükselir", async () => {
    const etut = await createEtut(db, s, { tarih, kontenjan: 1, baslangic: "11:00", bitis: "12:00" });

    await rezerve(etut, s.students[0]);
    await rezerve(etut, s.students[1]); // sıra 1
    await rezerve(etut, s.students[2]); // sıra 2

    const sonuc = await birak(etut, s.students[0]);
    expect(sonuc.rows[0].rezervasyon_birak).toBe(s.students[1]);

    const { rows } = await db.asService((q) =>
      q.query<{ student_id: string; durum: string; sira_no: number | null }>(
        `select student_id, durum, sira_no from reservations where etut_id = $1 order by created_at`,
        [etut],
      ),
    );
    const byId = Object.fromEntries(rows.map((r) => [r.student_id, r]));
    expect(byId[s.students[0]].durum).toBe("iptal");
    expect(byId[s.students[1]].durum).toBe("rezerve");
    expect(byId[s.students[2]].durum).toBe("beklemede");
  });

  it("aynı etüde iki kez kayıt olunamaz", async () => {
    const etut = await createEtut(db, s, { tarih, kontenjan: 5, baslangic: "12:00", bitis: "13:00" });
    await rezerve(etut, s.students[0]);
    await expect(rezerve(etut, s.students[0])).rejects.toThrow(/zaten kayıtlısınız/i);
  });

  it("iptalden sonra tekrar kayıt olunabilir", async () => {
    const etut = await createEtut(db, s, { tarih, kontenjan: 5, baslangic: "13:00", bitis: "14:00" });
    await rezerve(etut, s.students[0]);
    await birak(etut, s.students[0]);
    const tekrar = await rezerve(etut, s.students[0]);
    expect(tekrar.rows[0].durum).toBe("rezerve");
  });

  it("eşzamanlı isteklerde kontenjan aşılmaz", async () => {
    const etut = await createEtut(db, s, { tarih, kontenjan: 1, baslangic: "14:00", bitis: "15:00" });

    // Aynı anda dört öğrenci dener; yalnızca biri yer almalı.
    const sonuclar = await Promise.allSettled(s.students.map((st) => rezerve(etut, st)));
    const kabul = sonuclar.filter((r) => r.status === "fulfilled").length;
    expect(kabul).toBe(4); // hepsi kabul edilir, ama yalnızca biri 'rezerve' olur

    const { rows } = await db.asService((q) =>
      q.query<{ durum: string; n: number }>(
        `select durum, count(*)::int as n from reservations where etut_id = $1 group by durum`,
        [etut],
      ),
    );
    const sayim = Object.fromEntries(rows.map((r) => [r.durum, Number(r.n)]));
    expect(sayim.rezerve).toBe(1);
    expect(sayim.beklemede).toBe(3);
  });
});

describe("çakışma ve uygunluk", () => {
  it("öğrenci aynı saatte ikinci etüde kayıt olamaz", async () => {
    const a = await createEtut(db, s, { tarih, baslangic: "15:00", bitis: "16:00", roomId: s.roomId });
    const b = await createEtut(db, s, {
      tarih,
      baslangic: "15:30",
      bitis: "16:30",
      teacherId: s.teacher2Id,
      roomId: s.room2Id,
    });

    await rezerve(a, s.students[0]);
    await expect(rezerve(b, s.students[0])).rejects.toThrow(/başka bir etüde kayıtlısınız/i);
  });

  it("sınıfına açık olmayan etüde kayıt olunamaz", async () => {
    const etut = await createEtut(db, s, {
      tarih,
      baslangic: "17:00",
      bitis: "18:00",
      classes: [s.classAId],
    });
    await expect(rezerve(etut, s.otherClassStudentId)).rejects.toThrow(/sınıfınıza açık değil/i);
  });

  it("onaylanmamış etüde kayıt olunamaz", async () => {
    const etut = await createEtut(db, s, {
      tarih,
      baslangic: "18:00",
      bitis: "19:00",
      durum: "onay_bekliyor",
      roomId: null,
    });
    await expect(rezerve(etut, s.students[0])).rejects.toThrow(/rezervasyona kapalı/i);
  });

  it("aynı öğretmen aynı saatte iki etüt açamaz", async () => {
    await createEtut(db, s, { tarih, baslangic: "19:00", bitis: "20:00", roomId: s.roomId });
    await expect(
      createEtut(db, s, { tarih, baslangic: "19:30", bitis: "20:30", roomId: s.room2Id }),
    ).rejects.toThrow(/etuts_ogretmen_cakismasi/);
  });

  it("aynı derslik aynı saatte iki etüde verilemez", async () => {
    await createEtut(db, s, { tarih, baslangic: "20:00", bitis: "21:00", roomId: s.roomId });
    await expect(
      createEtut(db, s, {
        tarih,
        baslangic: "20:30",
        bitis: "21:30",
        teacherId: s.teacher2Id,
        roomId: s.roomId,
      }),
    ).rejects.toThrow(/etuts_derslik_cakismasi/);
  });

  it("kontenjan derslik kapasitesini aşamaz", async () => {
    await expect(
      createEtut(db, s, {
        tarih,
        baslangic: "21:00",
        bitis: "22:00",
        kontenjan: 99,
        roomId: s.roomId,
      }),
    ).rejects.toThrow(/derslik kapasitesini/i);
  });
});

describe("sınıf etüdü", () => {
  it("sınıfın tüm öğrencilerini atar ve kontenjanı mevcuda eşitler", async () => {
    const etut = await createEtut(db, s, {
      tarih,
      baslangic: "08:00",
      bitis: "09:00",
      kontenjan: 1,
      sinifEtudu: true,
      typeId: s.typeSinifId,
      roomId: null,
      classes: [s.classAId],
    });

    const { rows } = await db.asService((q) =>
      q.query<{ sinif_etudu_ogrencileri_ata: number }>(
        `select sinif_etudu_ogrencileri_ata($1)`,
        [etut],
      ),
    );
    expect(Number(rows[0].sinif_etudu_ogrencileri_ata)).toBe(4);

    const etutRow = await db.asService((q) =>
      q.query<{ kontenjan: number }>(`select kontenjan from etuts where id = $1`, [etut]),
    );
    expect(Number(etutRow.rows[0].kontenjan)).toBe(4);
  });

  it("öğrenci sınıf etüdünden kendisi çıkamaz", async () => {
    const etut = await createEtut(db, s, {
      tarih,
      baslangic: "09:00",
      bitis: "10:00",
      sinifEtudu: true,
      typeId: s.typeSinifId,
      roomId: null,
    });
    await db.asService((q) => q.query(`select sinif_etudu_ogrencileri_ata($1)`, [etut]));
    await expect(birak(etut, s.students[0])).rejects.toThrow(/kendiniz çıkamazsınız/i);
  });
});

describe("yoklama zaman kilidi", () => {
  /**
   * Arayüz kilitli etütte düğmeyi gizliyor, ama asıl koruma veritabanındaki
   * `attendance_kilit` tetikleyicisi. Arayüz atlanırsa da yazma reddedilmeli.
   */
  const gecmisTarih = async (gunOnce: number) =>
    db.asService(async (q) => {
      const { rows } = await q.query<{ d: string }>(
        `select to_char((now() at time zone 'Europe/Istanbul')::date - $1::int, 'YYYY-MM-DD') as d`,
        [gunOnce],
      );
      return rows[0].d;
    });

  const yoklamaYaz = (ogretmen: string, etut: string, ogrenci: string) =>
    db.as(ogretmen, (q) =>
      q.query(
        `insert into attendance (school_id, etut_id, student_id, durum, marked_by)
         values ($1,$2,$3,'katildi',$4)`,
        [s.schoolId, etut, ogrenci, ogretmen],
      ),
    );

  it("etüt başlamadan yoklama alınamaz", async () => {
    const etut = await createEtut(db, s, {
      tarih,
      baslangic: "06:00",
      bitis: "06:45",
      roomId: null,
    });
    await expect(yoklamaYaz(s.teacherId, etut, s.students[0])).rejects.toThrow(
      /Yoklama süresi doldu/i,
    );
  });

  it("etüt bittikten sonra 24 saat içinde alınabilir", async () => {
    const etut = await createEtut(db, s, {
      tarih: await gecmisTarih(0),
      baslangic: "00:05",
      bitis: "00:10",
      roomId: null,
    });
    await expect(yoklamaYaz(s.teacherId, etut, s.students[0])).resolves.toBeDefined();
  });

  it("24 saat geçtikten sonra öğretmen yazamaz", async () => {
    const etut = await createEtut(db, s, {
      tarih: await gecmisTarih(3),
      baslangic: "10:00",
      bitis: "11:00",
      roomId: null,
    });
    await expect(yoklamaYaz(s.teacherId, etut, s.students[1])).rejects.toThrow(
      /Yoklama süresi doldu/i,
    );
  });

  it("yönetici kilitten sonra da düzeltebilir", async () => {
    const etut = await createEtut(db, s, {
      tarih: await gecmisTarih(3),
      baslangic: "12:00",
      bitis: "13:00",
      roomId: null,
    });
    await expect(
      db.as(s.adminId, (q) =>
        q.query(
          `insert into attendance (school_id, etut_id, student_id, durum, marked_by)
           values ($1,$2,$3,'devamsiz',$4)`,
          [s.schoolId, etut, s.students[2], s.adminId],
        ),
      ),
    ).resolves.toBeDefined();
  });
});
