/**
 * Öğrenci gelişim raporu — hesap ve erişim.
 *
 * İki ayrı iddia korunuyor:
 *
 * 1. YÜZDE TEK BİR KURALDIR. Aynı öğrencinin katılım yüzdesi veli panelinde,
 *    yönetici Excel raporunda ve bu raporda AYNI çıkmak zorunda: payda
 *    katıldı + devamsız, mazeretli hiçbirine girmez. Üç yerde üç farklı sayı
 *    çıkarsa hangisinin doğru olduğu sorulamaz hâle gelir ve rapor veliye
 *    gidiyor — yanlış sayıyı savunmak zorunda kalan öğretmen olur.
 *
 * 2. RAPOR BAŞKA ÖĞRENCİYE AÇILMAZ. Rapor tek adreste beş rol tarafından
 *    açılıyor ve adreste öğrenci kimliği var; "başka bir kimlik yazsam ne
 *    olur" sorusunun cevabı kayıtlı olmalı. Özellikle: bir velinin kendi
 *    çocuğu dışındaki öğrenciyi açamaması.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, type TestDb } from "./db";
import { seedSchool, type SeededSchool } from "./seed";
import {
  aralikEtutleri,
  dersBazindaCalisma,
  dersBazindaKatilim,
  ozetHesapla,
  sureMetni,
  yorumlar,
  type CalismaSatiri,
  type EtutGecmisi,
} from "@/lib/rapor/gelisim-gorunum";

// ---------------------------------------------------------------------------
// Saf hesaplar
// ---------------------------------------------------------------------------

let no = 0;
function etut(kismi: Partial<EtutGecmisi> = {}): EtutGecmisi {
  no++;
  return {
    etutId: `e${no}`,
    tarih: "2026-09-10",
    baslangic: "16:00",
    bitis: "17:00",
    ders: "Matematik",
    konu: null,
    tur: "Soru Çözümü",
    derslik: "A1",
    ogretmen: "Ayşe Yılmaz",
    kayitDurumu: "rezerve",
    yoklama: "katildi",
    yildiz: null,
    hazirYorumlar: [],
    yorum: null,
    ...kismi,
  };
}

const calismaSatiri = (k: Partial<CalismaSatiri> = {}): CalismaSatiri => ({
  gun: "2026-09-10",
  ders: "Matematik",
  dogru: 0,
  yanlis: 0,
  bos: 0,
  sureSaniye: 0,
  ...k,
});

describe("özet hesabı", () => {
  it("mazeretli devamsızlığı paydaya KATMAZ", () => {
    const ozet = ozetHesapla(
      [
        etut({ yoklama: "katildi" }),
        etut({ yoklama: "devamsiz" }),
        etut({ yoklama: "mazeretli" }),
        etut({ yoklama: "mazeretli" }),
      ],
      [],
    );

    // Payda 2 (katıldı + devamsız) → %50. Mazeretliler paydaya girseydi %25
    // çıkar, veli öğrenciyi olduğundan kötü görürdü.
    expect(ozet.katilimYuzdesi).toBe(50);
    expect(ozet.mazeretli).toBe(2);
    expect(ozet.yoklananEtut).toBe(4);
  });

  it("yalnızca mazeretli kaydı varsa yüzde hesaplamaz", () => {
    // %0 yazmak "hiç gelmedi" demek olurdu; oysa devamsızlığı yok.
    const ozet = ozetHesapla([etut({ yoklama: "mazeretli" })], []);
    expect(ozet.katilimYuzdesi).toBeNull();
  });

  it("yoklaması alınmamış etüdü yüzdeye katmaz ama ayrıca sayar", () => {
    const ozet = ozetHesapla(
      [etut({ yoklama: "katildi" }), etut({ yoklama: null }), etut({ yoklama: null })],
      [],
    );
    expect(ozet.katilimYuzdesi).toBe(100);
    expect(ozet.yoklanmayanEtut).toBe(2);
  });

  it("yıldız ortalamasını yalnızca değerlendirilmiş etütlerden alır", () => {
    const ozet = ozetHesapla(
      [etut({ yildiz: 5 }), etut({ yildiz: 4 }), etut({ yildiz: null })],
      [],
    );
    expect(ozet.ortalamaYildiz).toBe(4.5);
    expect(ozet.degerlendirmeSayisi).toBe(2);
  });

  it("çalışma toplamını ve net'i döker", () => {
    const ozet = ozetHesapla(
      [],
      [
        calismaSatiri({ dogru: 20, yanlis: 4, bos: 1, sureSaniye: 3600 }),
        calismaSatiri({ ders: "Fizik", dogru: 10, yanlis: 0, bos: 0, sureSaniye: 1800 }),
      ],
    );
    expect(ozet.soru).toBe(35);
    expect(ozet.net).toBe(29); // (20−1) + 10
    expect(ozet.sureSaniye).toBe(5400);
  });

  it("çalışılan günü SAYMAZ değil, TEKİLLEŞTİRİR", () => {
    // Aynı gün iki ders çalışıldıysa bu bir gündür. Satır saymak "30 günde
    // 60 gün çalıştı" gibi imkânsız bir sayı üretirdi.
    const ozet = ozetHesapla(
      [],
      [
        calismaSatiri({ gun: "2026-09-10", ders: "Matematik" }),
        calismaSatiri({ gun: "2026-09-10", ders: "Fizik" }),
        calismaSatiri({ gun: "2026-09-11", ders: "Fizik" }),
      ],
    );
    expect(ozet.calisilanGun).toBe(2);
  });
});

describe("aralık süzgeci", () => {
  it("iki ucu da içine alır", () => {
    const g = [
      etut({ tarih: "2026-08-31" }),
      etut({ tarih: "2026-09-01" }),
      etut({ tarih: "2026-09-30" }),
      etut({ tarih: "2026-10-01" }),
    ];
    const icerde = aralikEtutleri(g, "2026-09-01", "2026-09-30");
    expect(icerde.map((e) => e.tarih)).toEqual(["2026-09-01", "2026-09-30"]);
  });
});

describe("ders kırılımı", () => {
  it("yoklaması alınmamış etüdü ders tablosuna KOYMAZ", () => {
    // Aksi hâlde "4 etütte 2 devamsız" yazıp kalan 2'sinin yoklamasının hiç
    // alınmadığını gizlerdik.
    const satirlar = dersBazindaKatilim([
      etut({ ders: "Matematik", yoklama: "katildi" }),
      etut({ ders: "Matematik", yoklama: "devamsiz" }),
      etut({ ders: "Matematik", yoklama: null }),
    ]);
    expect(satirlar).toHaveLength(1);
    expect(satirlar[0].toplam).toBe(2);
    expect(satirlar[0].katilimYuzdesi).toBe(50);
  });

  it("dersleri etüt sayısına göre sıralar", () => {
    const satirlar = dersBazindaKatilim([
      etut({ ders: "Fizik" }),
      etut({ ders: "Matematik" }),
      etut({ ders: "Matematik" }),
    ]);
    expect(satirlar.map((s) => s.ders)).toEqual(["Matematik", "Fizik"]);
  });

  it("çalışmayı ders bazında toplar ve net'i dersin kendi doğru/yanlışından hesaplar", () => {
    const satirlar = dersBazindaCalisma([
      calismaSatiri({ ders: "Matematik", dogru: 10, yanlis: 4, bos: 2, sureSaniye: 600 }),
      calismaSatiri({
        gun: "2026-09-11",
        ders: "Matematik",
        dogru: 5,
        yanlis: 0,
        bos: 0,
        sureSaniye: 300,
      }),
      calismaSatiri({ ders: "Fizik", dogru: 8, yanlis: 8, bos: 0, sureSaniye: 900 }),
    ]);

    expect(satirlar[0]).toEqual({
      ders: "Matematik",
      soru: 21,
      net: 14, // 15 − 4/4
      sureSaniye: 900,
    });
    expect(satirlar[1].net).toBe(6); // 8 − 8/4
  });
});

describe("yorum listesi", () => {
  it("yalnızca yorumu veya hazır yorumu olan etütleri alır", () => {
    const liste = yorumlar([
      etut({ yorum: "Derse hazırlıklı geldi." }),
      etut({ hazirYorumlar: ["Aktif katıldı"] }),
      etut({ yorum: "   " }),
      etut({ yildiz: 5 }),
    ]);
    expect(liste).toHaveLength(2);
  });

  it("yeniden eskiye sıralar", () => {
    const liste = yorumlar([
      etut({ tarih: "2026-09-01", yorum: "eski" }),
      etut({ tarih: "2026-09-20", yorum: "yeni" }),
    ]);
    expect(liste.map((y) => y.yorum)).toEqual(["yeni", "eski"]);
  });
});

describe("süre metni", () => {
  it("saat ve dakikayı okunur yazar", () => {
    expect(sureMetni(0)).toBe("—");
    expect(sureMetni(720)).toBe("12dk");
    expect(sureMetni(3600)).toBe("1s");
    expect(sureMetni(15120)).toBe("4s 12dk");
  });
});

// ---------------------------------------------------------------------------
// Erişim — gerçek şema, gerçek RLS
// ---------------------------------------------------------------------------

let db: TestDb;
let s: SeededSchool;
let okulB: SeededSchool;

const cagir = <T = Record<string, unknown>>(
  kullanici: string,
  sql: string,
  params: unknown[] = [],
) => db.as(kullanici, (q: PGlite) => q.query<T>(sql, params));

beforeAll(async () => {
  db = await createTestDb();
  s = await seedSchool(db);
  okulB = await seedSchool(db, "ikinci-okul");

  // Öğrenci kendi çalışmasını girer (0017: yazma hakkı yalnızca öğrencide).
  await cagir(
    s.students[0],
    `insert into study_sessions
       (school_id, student_id, subject_id, dogru, yanlis, bos,
        bitti_at, sure_saniye, calisma_gunu)
     values ($1,$2,$3,20,4,1, now(), 3600, current_date)`,
    [s.schoolId, s.students[0], s.subjectId],
  );

  await cagir(
    s.students[0],
    `insert into study_goals (school_id, student_id, baslik, hedef_soru)
     values ($1,$2,'Türev 100 soru',100)`,
    [s.schoolId, s.students[0]],
  );
}, 120000);

afterAll(async () => db?.close());

const kimlik = (kullanici: string, ogrenci: string) =>
  cagir<{ ad: string; okul_no: string; mentor: string | null }>(
    kullanici,
    `select * from ogrenci_kimlik_karti($1)`,
    [ogrenci],
  );

describe("kimlik kartı erişimi", () => {
  it("öğrenci kendi kimliğini okur", async () => {
    const { rows } = await kimlik(s.students[0], s.students[0]);
    expect(rows[0].okul_no).toBe("200");
    expect(rows[0].mentor).toBe("Ahmet Yılmaz");
  });

  it("veli KENDİ çocuğunu okur", async () => {
    const { rows } = await kimlik(s.parentId, s.students[0]);
    expect(rows[0].okul_no).toBe("200");
  });

  it("VELİ BAŞKA ÖĞRENCİYİ OKUYAMAZ", async () => {
    // Raporun adresinde öğrenci kimliği var; veli oraya başka bir kimlik
    // yazarsa duvara çarpmalı.
    await expect(kimlik(s.parentId, s.students[1])).rejects.toThrow(/yetkiniz yok/);
  });

  it("öğrenci BAŞKA ÖĞRENCİNİN raporunu açamaz", async () => {
    await expect(kimlik(s.students[0], s.students[1])).rejects.toThrow(/yetkiniz yok/);
  });

  it("okul personeli kendi okulunun öğrencisini okur", async () => {
    for (const personel of [s.adminId, s.teacherId, s.rehberId]) {
      const { rows } = await kimlik(personel, s.students[2]);
      expect(rows[0].okul_no).toBe("202");
    }
  });

  it("BAŞKA OKULUN YÖNETİCİSİ okuyamaz", async () => {
    await expect(kimlik(okulB.adminId, s.students[0])).rejects.toThrow(/yetkiniz yok/);
  });
});

describe("çalışma dökümü erişimi", () => {
  const dokum = (kullanici: string, ogrenci: string) =>
    cagir<{ ders: string; dogru: number; sure_saniye: number }>(
      kullanici,
      `select * from ogrenci_calisma_dokumu($1, current_date - 30, current_date)`,
      [ogrenci],
    );

  it("veli çocuğunun çalışmasını ders kırılımında görür", async () => {
    const { rows } = await dokum(s.parentId, s.students[0]);
    expect(rows).toHaveLength(1);
    expect(rows[0].ders).toBe("Matematik");
    expect(Number(rows[0].dogru)).toBe(20);
  });

  it("aralığın dışındaki günü getirmez", async () => {
    const { rows } = await cagir(
      s.parentId,
      `select * from ogrenci_calisma_dokumu($1, current_date - 30, current_date - 1)`,
      [s.students[0]],
    );
    expect(rows).toHaveLength(0);
  });

  it("AÇIK SAYACI toplama katmaz", async () => {
    // Süresi belli olmayan oturum toplamı yanıltır: "bugün 0 saniye çalıştı".
    await cagir(
      s.students[1],
      `insert into study_sessions
         (school_id, student_id, subject_id, dogru, calisma_gunu)
       values ($1,$2,$3,7, current_date)`,
      [s.schoolId, s.students[1], s.subjectId],
    );
    const { rows } = await dokum(s.teacherId, s.students[1]);
    expect(rows).toHaveLength(0);
  });

  it("VELİ BAŞKA ÖĞRENCİNİN çalışmasını çekemez", async () => {
    await expect(dokum(s.parentId, s.students[1])).rejects.toThrow(/yetkiniz yok/);
  });
});

describe("hedef özeti erişimi", () => {
  const ozet = (kullanici: string, ogrenci: string) =>
    cagir<{ aktif: number; tamamlandi: number; ogretmenden: number }>(
      kullanici,
      `select * from ogrenci_hedef_ozeti($1)`,
      [ogrenci],
    );

  it("veli çocuğunun hedef sayısını görür", async () => {
    const { rows } = await ozet(s.parentId, s.students[0]);
    expect(Number(rows[0].aktif)).toBe(1);
    expect(Number(rows[0].ogretmenden)).toBe(0);
  });

  it("yetkisiz çağıran SIFIR görür, başkasının sayısını değil", async () => {
    // Bu fonksiyon SECURITY INVOKER: study_goals RLS'i satırları süzer.
    // Hata fırlatmaz ama sayı da sızdırmaz.
    const { rows } = await ozet(okulB.adminId, s.students[0]);
    expect(Number(rows[0].aktif)).toBe(0);
  });
});

describe("fonksiyon yetkileri", () => {
  it("anon hiçbirini çağıramaz", async () => {
    // 0010'daki olay tetikleyicisi PUBLIC/anon EXECUTE'unu otomatik kaldırır;
    // bu test onun yeni fonksiyonlarda da çalıştığını doğruluyor.
    const { rows } = await db.asService((q: PGlite) =>
      q.query<{ proname: string; anon: boolean }>(
        `select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('ogrenci_kimlik_karti','ogrenci_calisma_dokumu','ogrenci_hedef_ozeti')`,
      ),
    );

    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r.anon).toBe(false);
  });
});
