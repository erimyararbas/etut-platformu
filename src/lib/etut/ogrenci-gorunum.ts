/**
 * Öğrenci etüt kartının SAF görünüm mantığı.
 *
 * Bu dosyada `server-only` YOKTUR ve olmamalıdır: istemci bileşeni buradan
 * import eder. Veritabanına dokunan kısım `ogrenci.ts` içindedir ve o dosya
 * istemciye hiç gitmez.
 *
 * Ayrım şart: istemci bileşeni tip veya yardımcı fonksiyon için sunucu
 * modülünden import ederse, Next derlemeyi `server-only` ile durdurur —
 * aksi hâlde servis anahtarına giden bir zincir tarayıcıya sızabilirdi.
 */

export type RezervasyonDurumu = "rezerve" | "beklemede" | "atandi" | null;

export interface OgrenciEtut {
  id: string;
  tarih: string;
  baslangic: string;
  bitis: string;
  kontenjan: number;
  aciklama: string | null;
  sinifEtuduMu: boolean;
  ders: string;
  konu: string | null;
  tur: string;
  derslik: string | null;
  ogretmen: string;
  dolu: number;
  bekleyen: number;
  benimDurumum: RezervasyonDurumu;
  benimSiram: number | null;
  iptalTalebim: "yok" | "bekliyor" | "onaylandi" | "reddedildi";
  rezervasyonAcik: boolean;
  cakisma: boolean;
}

/** Düğmenin ne yapacağını ve ne yazacağını belirleyen tek karar noktası. */
export type EylemTuru =
  | "rezerve_et"
  | "siraya_gir"
  | "birak"
  | "siradan_cik"
  | "iptal_talebi"
  | "talep_beklemede"
  | "kapali"
  | "cakisma";

export interface Eylem {
  tur: EylemTuru;
  etiket: string;
  not?: string;
}

export function eylemBelirle(e: OgrenciEtut): Eylem {
  /**
   * 'atandi' iki yoldan gelir: SINIF ETÜDÜ (öğretmen sınıfı toptan atar) veya
   * rehberin bireysel/grup etüdüne tek tek atadığı öğrenci (0029). İkisinde de
   * öğrenci kendi kendini çıkaramaz ama metin ayrışmalı — bireysel bir etüde
   * atanan öğrenciye "sınıf etüdüne atandın" demek onu yanlış yere yönlendirir
   * ve sınıfça gidilen bir şey sanır.
   */
  if (e.benimDurumum === "atandi") {
    if (e.iptalTalebim === "bekliyor") {
      return {
        tur: "talep_beklemede",
        etiket: "İptal talebi gönderildi",
        not: "Öğretmeninin onayını bekliyor.",
      };
    }
    return {
      tur: "iptal_talebi",
      etiket: "İptal talebi gönder",
      not: e.sinifEtuduMu
        ? "Sınıf etüdüne atandın; çıkmak için öğretmen onayı gerekir."
        : "Bu etüde senin için kayıt açıldı; çıkmak için onay gerekir.",
    };
  }

  if (e.benimDurumum === "rezerve") {
    return e.rezervasyonAcik
      ? { tur: "birak", etiket: "Kaydımı iptal et", not: "Yerin açılınca sıradaki öğrenci alınır." }
      : { tur: "kapali", etiket: "Kayıtlısın", not: "Rezervasyon dönemi kapandı." };
  }

  if (e.benimDurumum === "beklemede") {
    return e.rezervasyonAcik
      ? { tur: "siradan_cik", etiket: "Sıradan çık", not: `Sırada ${e.benimSiram}. kişisin.` }
      : { tur: "kapali", etiket: `Sırada ${e.benimSiram}.`, not: "Rezervasyon dönemi kapandı." };
  }

  if (!e.rezervasyonAcik) {
    return {
      tur: "kapali",
      etiket: "Rezervasyona kapalı",
      not: "Bu etüdün dönemi geçti veya henüz açılmadı.",
    };
  }

  if (e.cakisma) {
    return {
      tur: "cakisma",
      etiket: "Saat çakışması",
      not: "Aynı saatte başka bir etüde kayıtlısın.",
    };
  }

  return e.dolu >= e.kontenjan
    ? { tur: "siraya_gir", etiket: "Sıraya gir", not: `Dolu · ${e.bekleyen} kişi sırada.` }
    : { tur: "rezerve_et", etiket: "Etüde katıl" };
}
