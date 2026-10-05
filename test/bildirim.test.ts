/**
 * Bildirim üretimi.
 *
 * Tetikleyicilerle çalıştığı için uygulama katmanı atlansa bile bildirimler
 * düşmeli. Buradaki testler doğrudan veritabanına yazıp bildirimin oluşup
 * oluşmadığına bakar — yani "uygulama çağırmayı unutursa" senaryosu.
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./db";
import { seedSchool, createEtut, gelecekHaftaTarihi, type SeededSchool } from "./seed";

let db: TestDb;
let s: SeededSchool;
/**
 * Aynı öğretmen aynı saatte iki etüt açamaz (exclusion constraint). Saatleri
 * elle ayırmak yerine her test bloğuna AYRI GÜN veriyoruz; blok içinde saat
 * çakışmasını düşünmek gerekmiyor.
 */
let gun: string[] = [];

interface Bildirim {
  user_id: string;
  tip: string;
  baslik: string;
  govde: string;
}

const bildirimler = (kullaniciId?: string) =>
  db.asService(async (q) => {
    const { rows } = await q.query<Bildirim>(
      kullaniciId
        ? `select user_id, tip, baslik, govde from notifications where user_id = $1 order by created_at`
        : `select user_id, tip, baslik, govde from notifications order by created_at`,
      kullaniciId ? [kullaniciId] : [],
    );
    return rows;
  });

const temizle = () => db.asService((q) => q.query(`delete from notifications`));

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
  gun = await Promise.all([0, 1, 2, 3, 4].map((i) => gelecekHaftaTarihi(db, i)));
}, 120000);

afterAll(async () => db?.close());
beforeEach(temizle);

describe("rezervasyon bildirimleri", () => {
  const tarih = () => gun[0];
  it("kayıt alınınca öğrenciye bildirim gider", async () => {
    const etut = await createEtut(db, s, { tarih: tarih(), baslangic: "09:00", bitis: "10:00" });
    await db.asService((q) => q.query(`select rezervasyon_yap($1,$2)`, [etut, s.students[0]]));

    const b = await bildirimler(s.students[0]);
    expect(b).toHaveLength(1);
    expect(b[0].tip).toBe("rezervasyon_alindi");
    expect(b[0].govde).toMatch(/Matematik/);
  });

  it("sıraya girince sıra numarasıyla bildirim gider", async () => {
    const etut = await createEtut(db, s, {
      tarih: tarih(),
      baslangic: "10:00",
      bitis: "11:00",
      kontenjan: 1,
      roomId: s.room2Id,
    });
    await db.asService((q) => q.query(`select rezervasyon_yap($1,$2)`, [etut, s.students[0]]));
    await db.asService((q) => q.query(`select rezervasyon_yap($1,$2)`, [etut, s.students[1]]));

    const b = await bildirimler(s.students[1]);
    expect(b[0].tip).toBe("siraya_girdi");
    expect(b[0].govde).toMatch(/Sırada 1\. kişisin/);
  });

  it("BEKLEME LİSTESİNDEN YÜKSELTME bildirimi düşer", async () => {
    // Bu, uygulama katmanının göremediği olay: yükseltme veritabanı
    // fonksiyonunun içinde olup bitiyor.
    const etut = await createEtut(db, s, {
      tarih: tarih(),
      baslangic: "11:00",
      bitis: "12:00",
      kontenjan: 1,
      roomId: null,
    });
    await db.asService((q) => q.query(`select rezervasyon_yap($1,$2)`, [etut, s.students[0]]));
    await db.asService((q) => q.query(`select rezervasyon_yap($1,$2)`, [etut, s.students[1]]));
    await temizle();

    await db.asService((q) => q.query(`select rezervasyon_birak($1,$2)`, [etut, s.students[0]]));

    const b = await bildirimler(s.students[1]);
    expect(b).toHaveLength(1);
    expect(b[0].tip).toBe("siradan_gecti");
    expect(b[0].baslik).toMatch(/Bekleme listesinden etüde alındın/);
  });

  it("yükseltme bildirimi veliye de gider", async () => {
    const etut = await createEtut(db, s, {
      tarih: tarih(),
      baslangic: "12:00",
      bitis: "13:00",
      kontenjan: 1,
      roomId: s.room2Id,
    });
    // students[0] velisi olan öğrenci
    await db.asService((q) => q.query(`select rezervasyon_yap($1,$2)`, [etut, s.students[1]]));
    await db.asService((q) => q.query(`select rezervasyon_yap($1,$2)`, [etut, s.students[0]]));
    await temizle();
    await db.asService((q) => q.query(`select rezervasyon_birak($1,$2)`, [etut, s.students[1]]));

    expect((await bildirimler(s.students[0]))[0]?.tip).toBe("siradan_gecti");
    expect((await bildirimler(s.parentId))[0]?.tip).toBe("siradan_gecti");
  });

  it("sınıf etüdüne atanma öğrenciye ve veliye bildirilir", async () => {
    const etut = await createEtut(db, s, {
      tarih: tarih(),
      baslangic: "13:00",
      bitis: "14:00",
      sinifEtudu: true,
      typeId: s.typeSinifId,
      roomId: null,
    });
    await db.asService((q) => q.query(`select sinif_etudu_ogrencileri_ata($1)`, [etut]));

    expect((await bildirimler(s.students[0]))[0]?.tip).toBe("sinif_etuduna_atandi");
    expect((await bildirimler(s.parentId))[0]?.tip).toBe("sinif_etuduna_atandi");
  });
});

describe("etüt onay bildirimleri", () => {
  const tarih = () => gun[1];
  it("onaylanınca öğretmene bildirim gider", async () => {
    const etut = await createEtut(db, s, {
      tarih: tarih(),
      baslangic: "14:00",
      bitis: "15:00",
      durum: "onay_bekliyor",
      roomId: null,
    });
    await temizle();
    await db.asService((q) => q.query(`update etuts set durum='onaylandi' where id=$1`, [etut]));

    const b = await bildirimler(s.teacherId);
    expect(b[0].tip).toBe("etut_onaylandi");
  });

  it("reddedilince gerekçe bildirime girer", async () => {
    const etut = await createEtut(db, s, {
      tarih: tarih(),
      baslangic: "15:00",
      bitis: "16:00",
      durum: "onay_bekliyor",
      roomId: null,
    });
    await temizle();
    await db.asService((q) =>
      q.query(`update etuts set durum='reddedildi', red_nedeni=$2 where id=$1`, [
        etut,
        "Aynı saatte deneme sınavı var.",
      ]),
    );

    const b = await bildirimler(s.teacherId);
    expect(b[0].tip).toBe("etut_reddedildi");
    expect(b[0].govde).toMatch(/deneme sınavı/);
  });

  it("durum değişmemişse bildirim üretmez", async () => {
    const etut = await createEtut(db, s, {
      tarih: tarih(),
      baslangic: "16:00",
      bitis: "17:00",
      roomId: null,
    });
    await temizle();
    await db.asService((q) => q.query(`update etuts set aciklama='düzeltme' where id=$1`, [etut]));
    expect(await bildirimler(s.teacherId)).toHaveLength(0);
  });
});

describe("yoklama ve değerlendirme bildirimleri", () => {
  let etut: string;
  let saat = 8;

  beforeEach(async () => {
    saat += 1;
    etut = await createEtut(db, s, {
      tarih: gun[2],
      baslangic: `${String(saat).padStart(2, "0")}:00`,
      bitis: `${String(saat + 1).padStart(2, "0")}:00`,
      roomId: null,
    });
    await db.asService((q) => q.query(`select rezervasyon_yap($1,$2)`, [etut, s.students[0]]));
    await temizle();
  });

  it("devamsızlık öğrenciye ve veliye bildirilir", async () => {
    await db.asService((q) =>
      q.query(
        `insert into attendance (school_id, etut_id, student_id, durum, marked_by)
         values ($1,$2,$3,'devamsiz',$4)`,
        [s.schoolId, etut, s.students[0], s.teacherId],
      ),
    );

    expect((await bildirimler(s.students[0]))[0]?.tip).toBe("devamsizlik");
    const veli = await bildirimler(s.parentId);
    expect(veli[0]?.tip).toBe("devamsizlik");
    // Veliye giden metinde öğrencinin adı geçmeli.
    expect(veli[0].govde).toMatch(/Öğrenci1/);
  });

  it("katılım için bildirim üretilmez (gürültü olurdu)", async () => {
    await db.asService((q) =>
      q.query(
        `insert into attendance (school_id, etut_id, student_id, durum, marked_by)
         values ($1,$2,$3,'katildi',$4)`,
        [s.schoolId, etut, s.students[0], s.teacherId],
      ),
    );
    expect(await bildirimler()).toHaveLength(0);
  });

  it("aynı devamsızlık tekrar kaydedilirse ikinci bildirim gitmez", async () => {
    const yaz = (durum: string) =>
      db.asService((q) =>
        q.query(
          `insert into attendance (school_id, etut_id, student_id, durum, marked_by)
           values ($1,$2,$3,$5,$4)
           on conflict (etut_id, student_id) do update set durum = excluded.durum`,
          [s.schoolId, etut, s.students[0], s.teacherId, durum],
        ),
      );
    await yaz("devamsiz");
    const ilk = (await bildirimler(s.students[0])).length;
    await yaz("devamsiz");
    expect((await bildirimler(s.students[0])).length).toBe(ilk);
  });

  it("değerlendirme öğrenciye ve veliye bildirilir", async () => {
    await db.asService((q) =>
      q.query(
        `insert into evaluations (school_id, etut_id, student_id, teacher_id, yildiz)
         values ($1,$2,$3,$4,5)`,
        [s.schoolId, etut, s.students[0], s.teacherId],
      ),
    );

    const ogr = await bildirimler(s.students[0]);
    expect(ogr[0].tip).toBe("degerlendirme");
    expect(ogr[0].baslik).toMatch(/Ahmet Yılmaz/);
    expect(ogr[0].govde).toMatch(/5 yıldız/);
    expect((await bildirimler(s.parentId))[0]?.tip).toBe("degerlendirme");
  });
});

describe("kanal kuyruğu", () => {
  const tarih = () => gun[3];
  it("varsayılanda yalnızca uygulama içi bildirim vardır, outbox boş kalır", async () => {
    const etut = await createEtut(db, s, {
      tarih: tarih(),
      baslangic: "18:00",
      bitis: "19:00",
      roomId: null,
    });
    await db.asService((q) => q.query(`select rezervasyon_yap($1,$2)`, [etut, s.students[0]]));

    const { rows } = await db.asService((q) =>
      q.query<{ n: number }>(`select count(*)::int as n from notification_outbox`),
    );
    expect(Number(rows[0].n)).toBe(0);
    expect((await bildirimler(s.students[0])).length).toBe(1);
  });

  it("SMS açılınca telefonu olanlar için kuyruğa satır düşer", async () => {
    await db.asService((q) =>
      q.query(
        `update school_settings set aktif_bildirim_kanallari = '{inapp,sms}' where school_id = $1`,
        [s.schoolId],
      ),
    );
    // students[0]'ın telefonu yok, velisinin var → yalnızca veli için satır.
    const etut = await createEtut(db, s, {
      tarih: tarih(),
      baslangic: "19:00",
      bitis: "20:00",
      roomId: null,
    });
    await db.asService((q) => q.query(`select rezervasyon_yap($1,$2)`, [etut, s.students[0]]));
    await db.asService((q) =>
      q.query(
        `insert into evaluations (school_id, etut_id, student_id, teacher_id, yildiz)
         values ($1,$2,$3,$4,4)`,
        [s.schoolId, etut, s.students[0], s.teacherId],
      ),
    );

    const { rows } = await db.asService((q) =>
      q.query<{ kanal: string; hedef: string; durum: string }>(
        `select kanal, hedef, durum from notification_outbox`,
      ),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.kanal === "sms")).toBe(true);
    expect(rows.every((r) => r.durum === "bekliyor")).toBe(true);
    expect(rows.every((r) => r.hedef.startsWith("+90"))).toBe(true);

    await db.asService((q) =>
      q.query(
        `update school_settings set aktif_bildirim_kanallari = '{inapp}' where school_id = $1`,
        [s.schoolId],
      ),
    );
  });
});

describe("bildirim gizliliği", () => {
  const tarih = () => gun[4];
  it("kullanıcı yalnızca kendi bildirimini okur", async () => {
    const etut = await createEtut(db, s, {
      tarih: tarih(),
      baslangic: "20:00",
      bitis: "21:00",
      roomId: null,
    });
    await db.asService((q) => q.query(`select rezervasyon_yap($1,$2)`, [etut, s.students[0]]));

    const { rows: benim } = await db.as(s.students[0], (q) =>
      q.query(`select id from notifications`),
    );
    expect(benim).toHaveLength(1);

    const { rows: baskasi } = await db.as(s.students[1], (q) =>
      q.query(`select id from notifications`),
    );
    expect(baskasi).toHaveLength(0);

    // Yönetici bile başkasının bildirimini göremez.
    const { rows: yonetici } = await db.as(s.adminId, (q) =>
      q.query(`select id from notifications`),
    );
    expect(yonetici).toHaveLength(0);
  });
});

/**
 * Etüt iptali (0014): red ile iptal farklı şeylerdir. Redde kimse kayıtlı
 * değildir; iptalde kayıtlı öğrenci, sırada bekleyen ve veliler vardır ve
 * hepsinin haberi olması gerekir.
 */
describe("etüt iptal bildirimi", () => {
  it("kayıtlı öğrenciye, sıradakine ve veliye gider", async () => {
    const tarih = await gelecekHaftaTarihi(db, 4);
    const etut = await createEtut(db, s, {
      tarih,
      baslangic: "13:00",
      bitis: "14:00",
      kontenjan: 1,
    });

    await db.as(s.students[0], (q) =>
      q.query(`select rezervasyon_yap($1,$2)`, [etut, s.students[0]]),
    );
    // Kontenjan 1 olduğundan ikinci öğrenci bekleme listesine düşer.
    await db.as(s.students[1], (q) =>
      q.query(`select rezervasyon_yap($1,$2)`, [etut, s.students[1]]),
    );

    await db.asService((q) =>
      q.query(`update etuts set durum = 'iptal', red_nedeni = 'Öğretmen rapor aldı' where id = $1`, [
        etut,
      ]),
    );

    const alicilar = await db.asService(async (q) => {
      const { rows } = await q.query<{ user_id: string }>(
        `select distinct user_id from notifications where tip = 'etut_iptal'
           and data->>'etut_id' = $1`,
        [etut],
      );
      return rows.map((r) => r.user_id);
    });

    expect(alicilar).toContain(s.students[0]);
    expect(alicilar).toContain(s.students[1]); // bekleme listesindeki
    expect(alicilar).toContain(s.parentId); // students[0]'ın velisi
    expect(alicilar).toContain(s.teacherId);
    // Etütle ilgisi olmayan öğrenciye gitmemeli.
    expect(alicilar).not.toContain(s.students[2]);
  });

  it("gerekçeyi bildirim gövdesine yazar", async () => {
    const tarih = await gelecekHaftaTarihi(db, 5);
    const etut = await createEtut(db, s, {
      tarih,
      baslangic: "13:00",
      bitis: "14:00",
    });
    await db.as(s.students[0], (q) =>
      q.query(`select rezervasyon_yap($1,$2)`, [etut, s.students[0]]),
    );

    await db.asService((q) =>
      q.query(`update etuts set durum = 'iptal', red_nedeni = 'Salon tadilatta' where id = $1`, [
        etut,
      ]),
    );

    const govde = await db.asService(async (q) => {
      const { rows } = await q.query<{ govde: string }>(
        `select govde from notifications
          where tip = 'etut_iptal' and user_id = $1 and data->>'etut_id' = $2`,
        [s.students[0], etut],
      );
      return rows[0]?.govde ?? "";
    });

    expect(govde).toContain("Salon tadilatta");
  });
});
