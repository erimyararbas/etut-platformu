/**
 * Okul ayarlarının doğrulama şeması.
 *
 * Bu değerler iş kurallarını doğrudan besliyor: açılış günü/saati rezervasyon
 * penceresini, kilit saati yoklama süresini belirliyor. Veritabanındaki CHECK
 * kısıtlarıyla aynı aralıkları savunduğundan emin olmak gerekiyor — aksi hâlde
 * kullanıcı anlaşılmaz bir Postgres hatası görür.
 */

import { describe, it, expect } from "vitest";
import { ayarSemasi } from "@/lib/yonetim/ayar-gorunum";

const gecerli = {
  etutOnayGerekli: true,
  // 0029: rehberin öğretmen adına açtığı etüt öğretmen onayı bekler mi?
  rehberEtutOgretmenOnayi: true,
  // 0031: giriş ekranında demo seçeneği görünsün mü?
  demoModu: false,
  acilisGun: 5,
  acilisSaat: "20:00",
  yoklamaKilitSaat: 24,
  sinavAdi: "YKS 2027",
  sinavTarihi: "2027-06-20",
  kanallar: ["inapp"],
};

const hata = (girdi: unknown): string | null => {
  const s = ayarSemasi.safeParse(girdi);
  return s.success ? null : s.error.issues[0].message;
};

describe("ayarSemasi", () => {
  it("geçerli ayarı kabul eder", () => {
    expect(hata(gecerli)).toBeNull();
  });

  it("açılış gününü 1-7 aralığına sıkıştırır", () => {
    // 0001'deki check: gelecek_hafta_acilis_gun between 1 and 7
    expect(hata({ ...gecerli, acilisGun: 0 })).toBe("Gün seçin");
    expect(hata({ ...gecerli, acilisGun: 8 })).toBe("Gün seçin");
    expect(hata({ ...gecerli, acilisGun: 1 })).toBeNull();
    expect(hata({ ...gecerli, acilisGun: 7 })).toBeNull();
  });

  it("yoklama kilidini veritabanıyla aynı aralıkta tutar", () => {
    // 0001'deki check: yoklama_kilit_saat between 1 and 720
    expect(hata({ ...gecerli, yoklamaKilitSaat: 0 })).toBe("En az 1 saat");
    expect(hata({ ...gecerli, yoklamaKilitSaat: 721 })).toBe("En fazla 720 saat (30 gün)");
    expect(hata({ ...gecerli, yoklamaKilitSaat: 1 })).toBeNull();
    expect(hata({ ...gecerli, yoklamaKilitSaat: 720 })).toBeNull();
  });

  it("saati SS:DD biçiminde ister", () => {
    expect(hata({ ...gecerli, acilisSaat: "24:00" })).toBe("Saat SS:DD biçiminde olmalı");
    expect(hata({ ...gecerli, acilisSaat: "8:00" })).toBe("Saat SS:DD biçiminde olmalı");
    expect(hata({ ...gecerli, acilisSaat: "08:00" })).toBeNull();
    expect(hata({ ...gecerli, acilisSaat: "23:59" })).toBeNull();
  });

  it("sınav adı ve tarihi ya birlikte dolu ya birlikte boş olmalı", () => {
    expect(hata({ ...gecerli, sinavTarihi: "" })).toBe(
      "Sınav adı girdiyseniz tarihini de girin.",
    );
    expect(hata({ ...gecerli, sinavAdi: "" })).toBe(
      "Sınav tarihi girdiyseniz adını da girin.",
    );
    // Geri sayım istenmiyorsa ikisi de boş bırakılabilir.
    expect(hata({ ...gecerli, sinavAdi: "", sinavTarihi: "" })).toBeNull();
  });

  it("form alanları metin geldiğinde de sayıya çevrilir", () => {
    // input[type=number] ve select değerleri string döner.
    const s = ayarSemasi.safeParse({ ...gecerli, acilisGun: "3", yoklamaKilitSaat: "48" });
    expect(s.success).toBe(true);
    if (s.success) {
      expect(s.data.acilisGun).toBe(3);
      expect(s.data.yoklamaKilitSaat).toBe(48);
    }
  });

  it("tanınmayan bildirim kanalını reddeder", () => {
    expect(hata({ ...gecerli, kanallar: ["whatsapp"] })).toBeTruthy();
  });
});
