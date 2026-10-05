/**
 * Faz 2 çalışma takibi — RLS ve veri bütünlüğü.
 *
 * Buradaki testlerin çoğu tek bir soruyu savunuyor: "öğrencinin çalışma verisi
 * onun beyanıdır". Öğretmen veya veli bu sayıları değiştirebilseydi, veri
 * öğrencinin kaydı olmaktan çıkardı. Okuma geniş, yazma dar.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./db";
import { seedSchool, createEtut, gelecekHaftaTarihi, type SeededSchool } from "./seed";
import type { PGlite } from "@electric-sql/pglite";

let db: TestDb;
let s: SeededSchool;
let okulB: SeededSchool;

beforeAll(async () => {
  db = await createTestDb();
  s = await seedSchool(db);
  okulB = await seedSchool(db, "ikinci-okul");
}, 120000);

afterAll(async () => db?.close());

const cagir = <T = Record<string, unknown>>(
  kullanici: string,
  sql: string,
  params: unknown[] = [],
) => db.as(kullanici, (q: PGlite) => q.query<T>(sql, params));

const GUN = "2026-09-17";

async function oturumEkle(
  kullanici: string,
  ogrenci: string,
  schoolId: string,
  alanlar: Partial<{ dogru: number; yanlis: number; bos: number; gun: string }> = {},
) {
  return cagir(
    kullanici,
    `insert into study_sessions
       (school_id, student_id, dogru, yanlis, bos, calisma_gunu, bitti_at)
     values ($1,$2,$3,$4,$5,$6, now())`,
    [
      schoolId,
      ogrenci,
      alanlar.dogru ?? 0,
      alanlar.yanlis ?? 0,
      alanlar.bos ?? 0,
      alanlar.gun ?? GUN,
    ],
  );
}

describe("net_hesapla", () => {
  const net = async (d: number, y: number) => {
    const { rows } = await db.asService((q) =>
      q.query<{ n: string }>(`select net_hesapla($1,$2) as n`, [d, y]),
    );
    return Number(rows[0].n);
  };

  it("prototipteki formülü uygular: D − Y/4", async () => {
    expect(await net(9, 2)).toBe(8.5);
    expect(await net(12, 0)).toBe(12);
    expect(await net(0, 4)).toBe(-1);
  });

  it("hiç soru çözülmemişse sıfır", async () => {
    expect(await net(0, 0)).toBe(0);
  });

  it("çeyrek netleri kaybetmez", async () => {
    expect(await net(10, 1)).toBe(9.75);
    expect(await net(10, 3)).toBe(9.25);
  });
});

describe("çalışma oturumu yazma yetkisi", () => {
  it("öğrenci kendi kaydını girer", async () => {
    await oturumEkle(s.students[0], s.students[0], s.schoolId, { dogru: 9, yanlis: 2 });
    const { rows } = await cagir(
      s.students[0],
      `select count(*)::int as n from study_sessions where student_id = $1`,
      [s.students[0]],
    );
    expect(rows[0].n).toBe(1);
  });

  it("öğrenci BAŞKASI adına kayıt giremez", async () => {
    await expect(
      oturumEkle(s.students[0], s.students[1], s.schoolId),
    ).rejects.toThrow(/row-level security/i);
  });

  it("öğretmen öğrencinin çalışma kaydını giremez", async () => {
    await expect(
      oturumEkle(s.teacherId, s.students[0], s.schoolId),
    ).rejects.toThrow(/row-level security/i);
  });

  it("öğretmen öğrencinin çözdüğü soru sayısını değiştiremez", async () => {
    const { rows } = await cagir(
      s.teacherId,
      `update study_sessions set dogru = 99 where student_id = $1 returning id`,
      [s.students[0]],
    );
    expect(rows).toHaveLength(0);
  });

  it("veli de değiştiremez", async () => {
    const { rows } = await cagir(
      s.parentId,
      `update study_sessions set dogru = 99 where student_id = $1 returning id`,
      [s.students[0]],
    );
    expect(rows).toHaveLength(0);
  });
});

describe("çalışma oturumu okuma yetkisi", () => {
  it("öğrencinin kendisi, velisi ve okulun personeli görür", async () => {
    const say = async (k: string) => {
      const { rows } = await cagir(
        k,
        `select count(*)::int as n from study_sessions where student_id = $1`,
        [s.students[0]],
      );
      return rows[0].n;
    };
    expect(await say(s.students[0])).toBeGreaterThan(0);
    expect(await say(s.parentId)).toBeGreaterThan(0);
    expect(await say(s.teacherId)).toBeGreaterThan(0);
    expect(await say(s.adminId)).toBeGreaterThan(0);
  });

  it("başka bir öğrenci göremez", async () => {
    const { rows } = await cagir(
      s.students[2],
      `select count(*)::int as n from study_sessions where student_id = $1`,
      [s.students[0]],
    );
    expect(rows[0].n).toBe(0);
  });

  it("başka okulun yöneticisi göremez", async () => {
    const { rows } = await cagir(
      okulB.adminId,
      `select count(*)::int as n from study_sessions`,
    );
    expect(rows[0].n).toBe(0);
  });
});

describe("aynı anda tek açık sayaç", () => {
  it("ikinci sayaç başlatılamaz", async () => {
    const baslat = () =>
      cagir(
        s.students[3],
        `insert into study_sessions (school_id, student_id, calisma_gunu) values ($1,$2,$3)`,
        [s.schoolId, s.students[3], GUN],
      );

    await baslat();
    // Açık sayaç varken ikincisi veritabanında reddedilir.
    await expect(baslat()).rejects.toThrow(/study_sessions_tek_acik_idx|duplicate key/i);
  });

  it("sayaç kapatılınca yenisi başlatılabilir", async () => {
    await cagir(
      s.students[3],
      `update study_sessions set bitti_at = now(), sure_saniye = 600
        where student_id = $1 and bitti_at is null`,
      [s.students[3]],
    );
    await expect(
      cagir(
        s.students[3],
        `insert into study_sessions (school_id, student_id, calisma_gunu) values ($1,$2,$3)`,
        [s.schoolId, s.students[3], GUN],
      ),
    ).resolves.toBeDefined();
  });
});

describe("hedefler", () => {
  it("öğrenci kendine hedef koyabilir", async () => {
    await expect(
      cagir(
        s.students[0],
        `insert into study_goals (school_id, student_id, baslik, hedef_soru)
         values ($1,$2,'Türev 30 soru',30)`,
        [s.schoolId, s.students[0]],
      ),
    ).resolves.toBeDefined();
  });

  it("öğrenci hedefi öğretmen atamış gibi gösteremez", async () => {
    await expect(
      cagir(
        s.students[0],
        `insert into study_goals (school_id, student_id, assigned_by, baslik, hedef_soru)
         values ($1,$2,$3,'Sahte atama',10)`,
        [s.schoolId, s.students[0], s.teacherId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("öğretmen hedef atar ve atayan kendisi olarak yazılır", async () => {
    await expect(
      cagir(
        s.teacherId,
        `insert into study_goals (school_id, student_id, assigned_by, baslik, hedef_soru)
         values ($1,$2,$3,'Zincir kuralı 30 soru',30)`,
        [s.schoolId, s.students[1], s.teacherId],
      ),
    ).resolves.toBeDefined();
  });

  it("öğretmen başka bir öğretmenin adına hedef atayamaz", async () => {
    await expect(
      cagir(
        s.teacherId,
        `insert into study_goals (school_id, student_id, assigned_by, baslik, hedef_soru)
         values ($1,$2,$3,'Başkasının adına',10)`,
        [s.schoolId, s.students[1], s.teacher2Id],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("öğrenci öğretmenin atadığı hedefi silemez veya değiştiremez", async () => {
    const { rows } = await cagir(
      s.students[1],
      `update study_goals set hedef_soru = 1 where assigned_by is not null returning id`,
    );
    expect(rows).toHaveLength(0);
  });

  it("öğretmen başka okulun öğrencisine hedef atayamaz", async () => {
    await expect(
      cagir(
        s.teacherId,
        `insert into study_goals (school_id, student_id, assigned_by, baslik, hedef_soru)
         values ($1,$2,$3,'Çapraz okul',10)`,
        [okulB.schoolId, okulB.students[0], s.teacherId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe("çözemediği sorular", () => {
  it("öğrenci soru açar, okulun öğretmeni görür", async () => {
    await cagir(
      s.students[0],
      `insert into unsolved_questions (school_id, student_id, metin)
       values ($1,$2,'Bu soruyu çözemedim')`,
      [s.schoolId, s.students[0]],
    );

    const { rows } = await cagir(
      s.teacherId,
      `select count(*)::int as n from unsolved_questions`,
    );
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it("başka okulun öğretmeni göremez", async () => {
    const { rows } = await cagir(
      okulB.teacherId,
      `select count(*)::int as n from unsolved_questions`,
    );
    expect(rows[0].n).toBe(0);
  });

  it("öğretmen kendi adına yanıt yazar, başkasının adına yazamaz", async () => {
    const { rows: soru } = await cagir(
      s.students[0],
      `select id from unsolved_questions where student_id = $1 limit 1`,
      [s.students[0]],
    );
    const soruId = (soru[0] as { id: string }).id;

    await expect(
      cagir(
        s.teacherId,
        `insert into question_answers (school_id, question_id, teacher_id, metin)
         values ($1,$2,$3,'Zincir kuralını uygula')`,
        [s.schoolId, soruId, s.teacherId],
      ),
    ).resolves.toBeDefined();

    await expect(
      cagir(
        s.teacherId,
        `insert into question_answers (school_id, question_id, teacher_id, metin)
         values ($1,$2,$3,'Başkasının adına')`,
        [s.schoolId, soruId, s.teacher2Id],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("öğrenci yanıtı görür ama yanıt yazamaz", async () => {
    const { rows } = await cagir(
      s.students[0],
      `select count(*)::int as n from question_answers`,
    );
    expect(rows[0].n).toBeGreaterThan(0);

    const { rows: soru } = await cagir(
      s.students[0],
      `select id from unsolved_questions where student_id = $1 limit 1`,
      [s.students[0]],
    );
    await expect(
      cagir(
        s.students[0],
        `insert into question_answers (school_id, question_id, teacher_id, metin)
         values ($1,$2,$3,'Kendi kendime yanıt')`,
        [s.schoolId, (soru[0] as { id: string }).id, s.students[0]],
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe("puan defteri", () => {
  it("hiçbir kullanıcı puan yazamaz", async () => {
    for (const k of [s.students[0], s.teacherId, s.adminId]) {
      await expect(
        cagir(
          k,
          `insert into point_ledger (school_id, user_id, tur, miktar, kaynak)
           values ($1,$2,'yildiz',100,'elle')`,
          [s.schoolId, s.students[0]],
        ),
      ).rejects.toThrow(/permission denied|row-level security/i);
    }
  });

  it("öğrenci kendi puanını, velisi de görür; başkası görmez", async () => {
    await db.asService((q) =>
      q.query(
        `insert into point_ledger (school_id, user_id, tur, miktar, kaynak)
         values ($1,$2,'yildiz',5,'degerlendirme')`,
        [s.schoolId, s.students[0]],
      ),
    );

    const say = async (k: string) => {
      const { rows } = await cagir(
        k,
        `select count(*)::int as n from point_ledger where user_id = $1`,
        [s.students[0]],
      );
      return rows[0].n;
    };

    expect(await say(s.students[0])).toBe(1);
    expect(await say(s.parentId)).toBe(1);
    expect(await say(s.adminId)).toBe(1);
    expect(await say(s.students[2])).toBe(0);
    expect(await say(okulB.adminId)).toBe(0);
  });
});

/**
 * Puan defteri değerlendirmeden besleniyor (0019).
 *
 * Kritik nokta: öğretmen yıldızı düzeltebiliyor. Puan İKİNCİ KEZ yazılırsa
 * öğrencinin toplamı sessizce şişer ve kimse fark etmez.
 */
describe("değerlendirme puanı", () => {
  let etutId: string;

  beforeAll(async () => {
    const tarih = await gelecekHaftaTarihi(db, 6);
    etutId = await createEtut(db, s, { tarih, baslangic: "11:00", bitis: "12:00" });
  }, 60000);

  const puan = async (ogrenci: string) => {
    const { rows } = await db.asService((q) =>
      q.query<{ t: string | null }>(
        `select sum(miktar) as t from point_ledger
          where user_id = $1 and tur = 'yildiz'`,
        [ogrenci],
      ),
    );
    return Number(rows[0].t ?? 0);
  };

  it("değerlendirme yazılınca puan defterine düşer", async () => {
    const once = await puan(s.students[0]);
    await db.asService((q) =>
      q.query(
        `insert into evaluations (school_id, etut_id, student_id, teacher_id, yildiz)
         values ($1,$2,$3,$4,4)`,
        [s.schoolId, etutId, s.students[0], s.teacherId],
      ),
    );
    expect(await puan(s.students[0])).toBe(once + 4);
  });

  it("yıldız düzeltilince toplam şişmez, güncellenir", async () => {
    const once = await puan(s.students[0]);
    await db.asService((q) =>
      q.query(`update evaluations set yildiz = 5 where etut_id = $1 and student_id = $2`, [
        etutId,
        s.students[0],
      ]),
    );
    // 4'ten 5'e çıktı: toplam 1 artmalı, 5 değil.
    expect(await puan(s.students[0])).toBe(once + 1);
  });

  it("aynı etüt için tek satır tutar", async () => {
    const { rows } = await db.asService((q) =>
      q.query<{ n: number }>(
        `select count(*)::int as n from point_ledger
          where user_id = $1 and kaynak = 'degerlendirme' and kaynak_id = $2`,
        [s.students[0], etutId],
      ),
    );
    expect(rows[0].n).toBe(1);
  });

  it("özet fonksiyonu toplamı ve ortalamayı verir", async () => {
    const { rows } = await db.as(s.students[0], (q: PGlite) =>
      q.query<{ toplam_yildiz: string; ortalama_yildiz: string | null }>(
        `select * from ogrenci_puan_ozeti($1)`,
        [s.students[0]],
      ),
    );
    expect(Number(rows[0].toplam_yildiz)).toBeGreaterThan(0);
    expect(Number(rows[0].ortalama_yildiz)).toBeGreaterThan(0);
  });
});

/**
 * Faz 2 bildirimleri (0021).
 *
 * En önemli test alıcı seçimi: soru bildirimi okulun tüm öğretmenlerine
 * giderse gürültü olur, gürültü olan bildirim okunmaz hale gelir ve o noktada
 * bildirim sistemi işlevini kaybeder.
 */
describe("çalışma bildirimleri", () => {
  const bildirimler = async (kullanici: string, tip: string) => {
    const { rows } = await db.asService((q) =>
      q.query<{ n: number }>(
        `select count(*)::int as n from notifications where user_id = $1 and tip = $2`,
        [kullanici, tip],
      ),
    );
    return rows[0].n;
  };

  it("öğretmen hedef atayınca öğrenciye bildirim gider", async () => {
    const once = await bildirimler(s.students[2], "hedef_atandi");
    await cagir(
      s.teacherId,
      `insert into study_goals (school_id, student_id, assigned_by, baslik, hedef_soru)
       values ($1,$2,$3,'Limit 40 soru',40)`,
      [s.schoolId, s.students[2], s.teacherId],
    );
    expect(await bildirimler(s.students[2], "hedef_atandi")).toBe(once + 1);
  });

  it("öğrencinin kendine koyduğu hedef bildirim üretmez", async () => {
    const once = await bildirimler(s.students[2], "hedef_atandi");
    await cagir(
      s.students[2],
      `insert into study_goals (school_id, student_id, baslik, hedef_soru)
       values ($1,$2,'Kendi hedefim',10)`,
      [s.schoolId, s.students[2]],
    );
    expect(await bildirimler(s.students[2], "hedef_atandi")).toBe(once);
  });

  it("soru yalnızca dersin branş öğretmenine gider", async () => {
    // s.teacherId'nin branşı Matematik (subjectId), s.teacher2Id'ninki Kimya.
    await cagir(
      s.students[0],
      `insert into unsolved_questions (school_id, student_id, subject_id, metin)
       values ($1,$2,$3,'Matematikte takıldım')`,
      [s.schoolId, s.students[0], s.subjectId],
    );

    expect(await bildirimler(s.teacherId, "soru_soruldu")).toBeGreaterThan(0);
    // Başka branşın öğretmeni bu gürültüyü almamalı.
    expect(await bildirimler(s.teacher2Id, "soru_soruldu")).toBe(0);
  });

  it("belirli bir öğretmen hedef gösterilirse yalnızca o alır", async () => {
    const once2 = await bildirimler(s.teacher2Id, "soru_soruldu");
    await cagir(
      s.students[0],
      `insert into unsolved_questions
         (school_id, student_id, subject_id, hedef_ogretmen_id, metin)
       values ($1,$2,$3,$4,'Size sormak istiyorum')`,
      [s.schoolId, s.students[0], s.subjectId, s.teacher2Id],
    );
    // Branşı Matematik olmasa da hedef gösterildiği için o alır.
    expect(await bildirimler(s.teacher2Id, "soru_soruldu")).toBe(once2 + 1);
  });

  it("öğretmen yanıtlayınca öğrenciye bildirim gider", async () => {
    const { rows } = await cagir<{ id: string }>(
      s.students[0],
      `select id from unsolved_questions where student_id = $1 order by created_at desc limit 1`,
      [s.students[0]],
    );
    const soruId = rows[0].id;

    const once = await bildirimler(s.students[0], "soru_yanitlandi");
    await cagir(
      s.teacherId,
      `insert into question_answers (school_id, question_id, teacher_id, metin)
       values ($1,$2,$3,'Şöyle çöz')`,
      [s.schoolId, soruId, s.teacherId],
    );
    expect(await bildirimler(s.students[0], "soru_yanitlandi")).toBe(once + 1);
  });

  it("yanıt bildirimi veliye GİTMEZ", async () => {
    // Öğrencinin nerede takıldığı onunla öğretmeni arasında.
    expect(await bildirimler(s.parentId, "soru_yanitlandi")).toBe(0);
  });
});

/**
 * Mentör onay kuyruğu (0022).
 *
 * Buradaki asıl kural: öğrenci kendi gönderisini onaylayamaz. Onaylayabilseydi
 * kuyruk bir doğrulama halkası olmaktan çıkar, süs olurdu.
 */
describe("mentör gönderileri", () => {
  const YOL = "11111111-1111-4111-8111-111111111111/x/a.jpg";

  const gonder = (kullanici: string, ogrenci: string, aciklama = "20 soru çözdüm") =>
    cagir(
      kullanici,
      `insert into mentor_submissions (school_id, student_id, aciklama, gorsel_yolu)
       values ($1,$2,$3,$4) returning id`,
      [s.schoolId, ogrenci, aciklama, YOL],
    );

  it("öğrenci kendi çalışmasını gönderir", async () => {
    const { rows } = await gonder(s.students[0], s.students[0]);
    expect(rows).toHaveLength(1);
  });

  it("öğrenci başkasının adına gönderemez", async () => {
    await expect(gonder(s.students[0], s.students[1])).rejects.toThrow(
      /row-level security/i,
    );
  });

  it("öğrenci gönderisini onaylanmış olarak açamaz", async () => {
    await expect(
      cagir(
        s.students[0],
        `insert into mentor_submissions
           (school_id, student_id, aciklama, gorsel_yolu, durum, karar_veren, karar_at)
         values ($1,$2,'Sahte onay',$3,'onaylandi',$2, now())`,
        [s.schoolId, s.students[0], YOL],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("öğrenci kendi gönderisini sonradan da onaylayamaz", async () => {
    const { rows } = await cagir<{ id: string }>(
      s.students[0],
      `select id from mentor_submissions where student_id = $1 limit 1`,
      [s.students[0]],
    );
    const { rows: etkilenen } = await cagir(
      s.students[0],
      `update mentor_submissions set durum = 'onaylandi', karar_veren = $1, karar_at = now()
        where id = $2 returning id`,
      [s.students[0], rows[0].id],
    );
    expect(etkilenen).toHaveLength(0);
  });

  it("öğretmen karar verir ve kararı kendi adına yazılır", async () => {
    const { rows } = await cagir<{ id: string }>(
      s.teacherId,
      `select id from mentor_submissions where student_id = $1 limit 1`,
      [s.students[0]],
    );
    await expect(
      cagir(
        s.teacherId,
        `update mentor_submissions
            set durum = 'onaylandi', karar_veren = $1, karar_at = now()
          where id = $2`,
        [s.teacherId, rows[0].id],
      ),
    ).resolves.toBeDefined();
  });

  it("öğretmen kararı başkasının adına yazamaz", async () => {
    const { rows } = await gonder(s.students[1], s.students[1], "İkinci gönderi");
    const id = (rows[0] as { id: string }).id;
    await expect(
      cagir(
        s.teacherId,
        `update mentor_submissions
            set durum = 'reddedildi', karar_veren = $1, karar_at = now()
          where id = $2`,
        [s.teacher2Id, id],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("karar verilince öğrenciye bildirim gider", async () => {
    const say = async () => {
      const { rows } = await db.asService((q) =>
        q.query<{ n: number }>(
          `select count(*)::int as n from notifications
            where user_id = $1 and tip in ('gonderi_onaylandi','gonderi_reddedildi')`,
          [s.students[0]],
        ),
      );
      return rows[0].n;
    };
    expect(await say()).toBeGreaterThan(0);
  });

  it("veli çocuğunun gönderisini görür, başkasınınkini görmez", async () => {
    const { rows: kendi } = await cagir<{ n: number }>(
      s.parentId,
      `select count(*)::int as n from mentor_submissions where student_id = $1`,
      [s.students[0]],
    );
    const { rows: baskasi } = await cagir<{ n: number }>(
      s.parentId,
      `select count(*)::int as n from mentor_submissions where student_id = $1`,
      [s.students[1]],
    );
    expect(kendi[0].n).toBeGreaterThan(0);
    expect(baskasi[0].n).toBe(0);
  });
});
