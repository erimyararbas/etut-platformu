/**
 * Bildirim görünüm katmanı — saf fonksiyonlar, veritabanı yok.
 */

import { describe, it, expect } from "vitest";
import {
  gecenSure,
  hedefYol,
  rozetMetni,
  ton,
  TON_SINIFI,
  type Bildirim,
} from "@/lib/bildirim/gorunum";

const SIMDI = new Date("2026-09-17T12:00:00Z");
const once = (saniye: number) => new Date(SIMDI.getTime() - saniye * 1000).toISOString();

describe("gecenSure", () => {
  it("dakikanın altını 'az önce' sayar", () => {
    expect(gecenSure(once(5), SIMDI)).toBe("az önce");
    expect(gecenSure(once(59), SIMDI)).toBe("az önce");
  });

  it("dakika, saat ve gün eşiklerini geçer", () => {
    expect(gecenSure(once(60), SIMDI)).toBe("1 dk önce");
    expect(gecenSure(once(3599), SIMDI)).toBe("59 dk önce");
    expect(gecenSure(once(3600), SIMDI)).toBe("1 saat önce");
    expect(gecenSure(once(86_399), SIMDI)).toBe("23 saat önce");
    expect(gecenSure(once(86_400), SIMDI)).toBe("dün");
    expect(gecenSure(once(172_800), SIMDI)).toBe("2 gün önce");
  });

  it("bir haftadan eskisini tarihe çevirir", () => {
    expect(gecenSure("2026-09-01T09:00:00Z", SIMDI)).toBe("01.09.2026");
  });
});

describe("rozetMetni", () => {
  it("sıfır ve altında rozet göstermez", () => {
    expect(rozetMetni(0)).toBe("");
    expect(rozetMetni(-1)).toBe("");
  });

  it("iki haneden fazlasını kısaltır", () => {
    expect(rozetMetni(1)).toBe("1");
    expect(rozetMetni(99)).toBe("99");
    expect(rozetMetni(100)).toBe("99+");
  });
});

describe("ton", () => {
  it("0009'daki her bildirim türünün bir tonu vardır", () => {
    // Bu liste migration'daki bildirim_gonder çağrılarıyla eşleşmeli; yeni bir
    // tür eklenip burası güncellenmezse bildirim nötr görünür.
    const turler = [
      "rezervasyon_alindi",
      "siraya_girdi",
      "siradan_gecti",
      "sinif_etuduna_atandi",
      "iptal_onaylandi",
      "iptal_reddedildi",
      "etut_onaylandi",
      "etut_reddedildi",
      "devamsizlik",
      "degerlendirme",
      "etut_iptal",
      "hedef_atandi",
      "soru_soruldu",
      "soru_yanitlandi",
    ];
    for (const t of turler) {
      expect(TON_SINIFI[ton(t)], `${t} için ton sınıfı`).toBeTruthy();
    }
  });

  it("devamsızlık olumsuz, sıradan geçiş olumlu", () => {
    expect(ton("devamsizlik")).toBe("olumsuz");
    expect(ton("siradan_gecti")).toBe("olumlu");
  });

  it("iptal edilen etüt olumsuz görünür", () => {
    // Öğrencinin planı bozuluyor; nötr göstermek olayı küçültürdü.
    expect(ton("etut_iptal")).toBe("olumsuz");
  });

  it("bilinmeyen tür nötr görünür, hata vermez", () => {
    expect(ton("gelecekte_eklenecek_tur")).toBe("notr");
  });
});

describe("hedefYol", () => {
  const b = (data: Record<string, unknown>): Bildirim => ({
    id: "1",
    tip: "rezervasyon_alindi",
    baslik: "x",
    govde: "y",
    data,
    okunduMu: false,
    createdAt: once(60),
  });

  it("etüt kimliği olmayan bildirim tıklanabilir değildir", () => {
    expect(hedefYol("okul", "ogrenci", b({}))).toBeNull();
    expect(hedefYol("okul", "ogrenci", b({ etut_id: 42 }))).toBeNull();
  });

  it("rolün kendi paneline götürür", () => {
    const d = { etut_id: "abc" };
    expect(hedefYol("okul", "ogrenci", b(d))).toBe("/okul/ogrenci");
    expect(hedefYol("okul", "ogretmen", b(d))).toBe("/okul/ogretmen");
    expect(hedefYol("okul", "veli", b(d))).toBe("/okul/veli");
  });

  it("yöneticinin bildirimi bir öğrenci ekranına götürmez", () => {
    expect(hedefYol("okul", "admin", b({ etut_id: "abc" }))).toBeNull();
  });

  it("soru bildirimi her iki rolü de sorular ekranına götürür", () => {
    expect(hedefYol("okul", "ogrenci", b({ soru_id: "abc" }))).toBe("/okul/sorular");
    expect(hedefYol("okul", "ogretmen", b({ soru_id: "abc" }))).toBe("/okul/sorular");
  });

  it("hedef bildirimi yalnızca öğrenciyi çalışma ekranına götürür", () => {
    expect(hedefYol("okul", "ogrenci", b({ hedef_id: "abc" }))).toBe("/okul/ogrenci/calisma");
    // Öğretmenin böyle bir ekranı yok; boşa tıklatmamalı.
    expect(hedefYol("okul", "ogretmen", b({ hedef_id: "abc" }))).toBeNull();
  });
});
