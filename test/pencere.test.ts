/**
 * Rezervasyon penceresi kuralı.
 *
 * Sabit bir takvim üzerinde çalışılır: 2026-07-01 Çarşamba.
 *   bu haftanın pazartesisi  = 2026-06-29
 *   gelecek haftanın pazartesisi = 2026-07-06
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./db";
import { seedSchool, type SeededSchool } from "./seed";

let db: TestDb;
let s: SeededSchool;

const CARSAMBA_10_00 = "2026-07-01 10:00:00";

beforeAll(async () => {
  db = await createTestDb();
  s = await seedSchool(db);
}, 120000);

afterAll(async () => db?.close());

async function acik(tarih: string, saat: string, simdi = CARSAMBA_10_00): Promise<boolean> {
  const { rows } = await db.asService((q) =>
    q.query<{ acik: boolean }>(
      `select rezervasyon_penceresi_acik($1, $2::date, $3::time, $4::timestamp) as acik`,
      [s.schoolId, tarih, saat, simdi],
    ),
  );
  return rows[0].acik;
}

async function acilisAyarla(gun: number, saat: string) {
  await db.asService((q) =>
    q.query(
      `update school_settings
          set gelecek_hafta_acilis_gun = $2, gelecek_hafta_acilis_saat = $3
        where school_id = $1`,
      [s.schoolId, gun, saat],
    ),
  );
}

describe("rezervasyon penceresi", () => {
  beforeAll(() => acilisAyarla(5, "20:00")); // Cuma 20:00

  it("geçmiş tarihli etüt kapalıdır", async () => {
    expect(await acik("2026-06-30", "16:00")).toBe(false);
  });

  it("bugün ama saati geçmiş etüt kapalıdır", async () => {
    expect(await acik("2026-07-01", "09:00")).toBe(false);
  });

  it("bugün ve saati gelmemiş etüt açıktır", async () => {
    expect(await acik("2026-07-01", "16:00")).toBe(true);
  });

  it("bu haftanın ilerideki günleri açıktır", async () => {
    expect(await acik("2026-07-03", "16:00")).toBe(true); // Cuma
    expect(await acik("2026-07-05", "16:00")).toBe(true); // Pazar
  });

  it("gelecek hafta, açılış anı gelmeden kapalıdır", async () => {
    // Şimdi Çarşamba 10:00; açılış Cuma 20:00 — henüz olmadı.
    expect(await acik("2026-07-07", "16:00")).toBe(false);
  });

  it("gelecek hafta, açılış anı geçtikten sonra açılır", async () => {
    // Şimdi Cuma 20:01 — açılış geçti.
    expect(await acik("2026-07-07", "16:00", "2026-07-03 20:01:00")).toBe(true);
  });

  it("açılış anının tam üzerinde açıktır", async () => {
    expect(await acik("2026-07-07", "16:00", "2026-07-03 20:00:00")).toBe(true);
  });

  it("açılıştan bir dakika önce hâlâ kapalıdır", async () => {
    expect(await acik("2026-07-07", "16:00", "2026-07-03 19:59:00")).toBe(false);
  });

  it("iki hafta sonrası her hâlükârda kapalıdır", async () => {
    expect(await acik("2026-07-14", "16:00", "2026-07-03 20:01:00")).toBe(false);
  });

  it("okul açılış gününü değiştirince kural da değişir", async () => {
    await acilisAyarla(3, "08:00"); // Çarşamba 08:00
    // Şimdi Çarşamba 10:00 — açılış bu sabah oldu, gelecek hafta artık açık.
    expect(await acik("2026-07-07", "16:00")).toBe(true);
    await acilisAyarla(5, "20:00");
  });
});
