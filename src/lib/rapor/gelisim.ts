/**
 * Gelişim raporunun okuma katmanı.
 *
 * Üç RPC de yetkiyi KENDİ İÇİNDE kontrol ediyor (0025, 0008). Burada rol
 * kontrolü tekrarlanmıyor: yetkisiz çağıran `insufficient_privilege` alır,
 * sayfa da bunu 403'e çevirir. Kural veritabanında, uygulamada değil.
 */

import "server-only";
import { supabaseSunucu } from "@/lib/supabase/server";
import { etutGecmisi } from "@/lib/veli/sorgular";
import { ogrencininDenemeleri } from "@/lib/deneme/sorgular";
import type { CalismaSatiri, HedefOzeti, Kimlik } from "./gelisim-gorunum";

export type * from "./gelisim-gorunum";
export {
  YOKLAMA_ADI,
  aralikDenemeleri,
  aralikEtutleri,
  dersBazindaCalisma,
  dersBazindaKatilim,
  ozetHesapla,
  sureMetni,
  tarihKisa,
  tarihUzun,
  yorumlar,
} from "./gelisim-gorunum";

/** Yetkisizlik ile gerçek arıza ayırt edilebilsin diye kendi hata türü. */
export class RaporYetkiHatasi extends Error {}

function yetkiMi(mesaj: string): boolean {
  return /yetkiniz yok|insufficient_privilege/i.test(mesaj);
}

export async function kimlik(ogrenciId: string): Promise<Kimlik | null> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase.rpc("ogrenci_kimlik_karti", {
    p_student_id: ogrenciId,
  });

  if (error) {
    if (yetkiMi(error.message)) throw new RaporYetkiHatasi(error.message);
    throw new Error(`Öğrenci bilgisi okunamadı: ${error.message}`);
  }

  const r = (data ?? [])[0] as Record<string, unknown> | undefined;
  if (!r) return null;

  return {
    ad: r.ad as string,
    soyad: r.soyad as string,
    okulNo: r.okul_no as string,
    sinif: (r.sinif as string | null) ?? null,
    mentor: (r.mentor as string | null) ?? null,
    okulAdi: r.okul_adi as string,
  };
}

export async function calismaDokumu(
  ogrenciId: string,
  baslangic: string,
  bitis: string,
): Promise<CalismaSatiri[]> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase.rpc("ogrenci_calisma_dokumu", {
    p_student_id: ogrenciId,
    p_baslangic: baslangic,
    p_bitis: bitis,
  });

  if (error) {
    if (yetkiMi(error.message)) throw new RaporYetkiHatasi(error.message);
    throw new Error(`Çalışma dökümü okunamadı: ${error.message}`);
  }

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    gun: r.calisma_gunu as string,
    ders: r.ders as string,
    dogru: Number(r.dogru ?? 0),
    yanlis: Number(r.yanlis ?? 0),
    bos: Number(r.bos ?? 0),
    sureSaniye: Number(r.sure_saniye ?? 0),
  }));
}

export async function hedefOzeti(ogrenciId: string): Promise<HedefOzeti> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase.rpc("ogrenci_hedef_ozeti", {
    p_student_id: ogrenciId,
  });

  if (error) throw new Error(`Hedef özeti okunamadı: ${error.message}`);

  const r = (data ?? [])[0] as Record<string, unknown> | undefined;
  return {
    aktif: Number(r?.aktif ?? 0),
    tamamlandi: Number(r?.tamamlandi ?? 0),
    ogretmenden: Number(r?.ogretmenden ?? 0),
  };
}

/**
 * Raporun bütün verisi tek çağrıda.
 *
 * Dördü paralel: hiçbiri diğerinin sonucuna bağlı değil ve sırayla beklemek
 * raporu dört gidiş-dönüş boyu geciktirirdi.
 *
 * Paralel olmalarının bir bedeli var: yetkisiz bir istekte hangisinin önce
 * hata vereceği belli değil ve `etutGecmisi` kendi hatasını kendi metniyle
 * sarıyor. Bu yüzden yetki reddi burada tek türe indiriliyor — çağıran
 * "403 mü, arıza mı" sorusunu mesaj ayıklayarak cevaplamak zorunda kalmasın.
 */
export async function raporVerisi(
  ogrenciId: string,
  baslangic: string,
  bitis: string,
) {
  try {
    const [k, gecmis, calisma, hedef, denemeler] = await Promise.all([
      kimlik(ogrenciId),
      etutGecmisi(ogrenciId),
      calismaDokumu(ogrenciId, baslangic, bitis),
      hedefOzeti(ogrenciId),
      // Deneme sonuçları RLS ile süzülür; yetkisi olmayan boş liste alır,
      // hata almaz — bu yüzden yukarıdaki yetki normalizasyonunu etkilemez.
      ogrencininDenemeleri(ogrenciId),
    ]);

    return { kimlik: k, gecmis, calisma, hedef, denemeler };
  } catch (hata) {
    const mesaj = hata instanceof Error ? hata.message : String(hata);
    if (hata instanceof RaporYetkiHatasi || yetkiMi(mesaj)) {
      throw new RaporYetkiHatasi(mesaj);
    }
    throw hata;
  }
}
