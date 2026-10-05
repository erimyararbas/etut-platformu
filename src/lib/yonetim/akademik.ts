/**
 * Akademik yapının okuma katmanı.
 *
 * Bu ekran SALT OKUNUR ve öyle kalmalı: sınıf, ders, konu, derslik ve etüt türü
 * verisi Excel şablonlarından gelir. İki ayrı giriş yolu olsaydı, okulun
 * dosyası ile sistemdeki veri birbirinden ayrışır ve bir sonraki yüklemede
 * hangisinin kazanacağı belirsiz olurdu.
 *
 * Ekranın değeri doğrulamada: "yüklediğim dosya doğru düştü mü?"
 */

import "server-only";
import { supabaseSunucu } from "@/lib/supabase/server";

export interface SinifSatiri {
  kod: string;
  seviye: string | null;
  ogrenciSayisi: number;
}

export interface DersSatiri {
  ad: string;
  kod: string | null;
  aktif: boolean;
  konuSayisi: number;
}

export interface KonuSatiri {
  ders: string;
  seviye: string | null;
  ad: string;
  /** topics.sira NOT NULL DEFAULT 0 — sıralanmamış konu 0 olarak gelir. */
  sira: number;
}

export interface DerslikSatiri {
  kod: string;
  bina: string | null;
  kat: string | null;
  kapasite: number;
  aktif: boolean;
}

export interface TurSatiri {
  ad: string;
  aktif: boolean;
}

export interface AkademikYapi {
  siniflar: SinifSatiri[];
  dersler: DersSatiri[];
  konular: KonuSatiri[];
  derslikler: DerslikSatiri[];
  turler: TurSatiri[];
}

export async function akademikYapi(): Promise<AkademikYapi> {
  const supabase = await supabaseSunucu();

  // Beş bağımsız sorgu; sırayla beklemenin anlamı yok.
  const [siniflar, dersler, konular, derslikler, turler, ogrenciler] = await Promise.all([
    supabase.from("classes").select("id, kod, grade_levels(ad)").order("kod"),
    supabase.from("subjects").select("id, ad, kisa_kod, aktif").order("ad"),
    supabase
      .from("topics")
      .select("ad, sira, subjects(ad), grade_levels(ad)")
      .order("sira"),
    supabase.from("rooms").select("kod, bina, kat, kapasite, aktif").order("kod"),
    supabase.from("etut_types").select("ad, aktif").order("ad"),
    supabase.from("students").select("class_id"),
  ]);

  const ilkHata = [siniflar, dersler, konular, derslikler, turler, ogrenciler].find(
    (r) => r.error,
  );
  if (ilkHata?.error) throw new Error(`Akademik yapı okunamadı: ${ilkHata.error.message}`);

  // Sınıf mevcudu: öğrenci sayısını sorgu başına saymak yerine tek geçişte.
  const mevcut = new Map<string, number>();
  for (const o of ogrenciler.data ?? []) {
    if (o.class_id) mevcut.set(o.class_id, (mevcut.get(o.class_id) ?? 0) + 1);
  }

  const konuListesi = ((konular.data ?? []) as unknown as {
    ad: string;
    sira: number;
    subjects: { ad: string } | null;
    grade_levels: { ad: string } | null;
  }[]).map((k) => ({
    ders: k.subjects?.ad ?? "—",
    seviye: k.grade_levels?.ad ?? null,
    ad: k.ad,
    sira: k.sira,
  }));

  const konuSayilari = new Map<string, number>();
  for (const k of konuListesi) {
    konuSayilari.set(k.ders, (konuSayilari.get(k.ders) ?? 0) + 1);
  }

  return {
    siniflar: ((siniflar.data ?? []) as unknown as {
      id: string;
      kod: string;
      grade_levels: { ad: string } | null;
    }[]).map((s) => ({
      kod: s.kod,
      seviye: s.grade_levels?.ad ?? null,
      ogrenciSayisi: mevcut.get(s.id) ?? 0,
    })),
    dersler: (dersler.data ?? []).map((d) => ({
      ad: d.ad,
      kod: d.kisa_kod,
      aktif: d.aktif,
      konuSayisi: konuSayilari.get(d.ad) ?? 0,
    })),
    konular: konuListesi.sort(
      (a, b) =>
        a.ders.localeCompare(b.ders, "tr") ||
        (a.seviye ?? "").localeCompare(b.seviye ?? "", "tr") ||
        a.sira - b.sira,
    ),
    derslikler: derslikler.data ?? [],
    turler: turler.data ?? [],
  };
}
