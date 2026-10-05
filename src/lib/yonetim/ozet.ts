/**
 * Yönetim panosu özeti.
 *
 * Sayılar tek bir veritabanı fonksiyonundan gelir (0013): beş ayrı sorgu
 * yerine tek gidiş ve tutarlı bir anlık görüntü.
 */

import "server-only";
import { supabaseSunucu } from "@/lib/supabase/server";

export interface Ozet {
  ogrenciSayisi: number;
  ogretmenSayisi: number;
  /** Davet kodu üretilmiş ama henüz şifresini belirlememiş kullanıcılar. */
  girisYapmamis: number;
  onayBekleyen: number;
  buHaftaEtut: number;
  buHaftaRezervasyon: number;
  /** Bitmiş, kayıtlı öğrencisi olan ama yoklaması alınmamış etütler. */
  yoklamasiEksik: number;
}

export async function yonetimOzeti(): Promise<Ozet> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase.rpc("yonetim_ozeti");

  if (error) throw new Error(`Pano özeti okunamadı: ${error.message}`);

  const r = (data as Record<string, unknown>[] | null)?.[0];
  const sayi = (k: string) => Number(r?.[k] ?? 0);

  return {
    ogrenciSayisi: sayi("ogrenci_sayisi"),
    ogretmenSayisi: sayi("ogretmen_sayisi"),
    girisYapmamis: sayi("giris_yapmamis"),
    onayBekleyen: sayi("onay_bekleyen"),
    buHaftaEtut: sayi("bu_hafta_etut"),
    buHaftaRezervasyon: sayi("bu_hafta_rezervasyon"),
    yoklamasiEksik: sayi("yoklamasi_eksik"),
  };
}
