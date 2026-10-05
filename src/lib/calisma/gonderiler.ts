/**
 * Mentör onay kuyruğunun okuma katmanı.
 *
 * `/sorular` ile aynı kalıp: tek fonksiyon iki rolü de besliyor, kimin neyi
 * göreceğine RLS karar veriyor (0022). Rol ayrımı yalnızca hangi satırların
 * istendiğinde; erişim kuralı değil.
 */

import "server-only";
import { supabaseSunucu } from "@/lib/supabase/server";
import { KOVA } from "./gorsel";
import type { Gonderi } from "./gonderi-gorunum";

export type { Gonderi, GonderiDurumu } from "./gonderi-gorunum";
export {
  GONDERI_DURUM_ADI,
  GONDERI_DURUM_SINIFI,
  GONDERI_SUZGECLERI,
  gonderiSirala,
} from "./gonderi-gorunum";

interface Ham {
  id: string;
  student_id: string;
  aciklama: string;
  gorsel_yolu: string;
  durum: Gonderi["durum"];
  karar_notu: string | null;
  karar_veren: string | null;
  created_at: string;
  study_goals: { baslik: string } | null;
}

export async function gonderiler(yalnizcaOgrenci?: string): Promise<Gonderi[]> {
  const supabase = await supabaseSunucu();

  let sorgu = supabase
    .from("mentor_submissions")
    .select(
      `id, student_id, aciklama, gorsel_yolu, durum, karar_notu, karar_veren,
       created_at, study_goals(baslik)`,
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (yalnizcaOgrenci) sorgu = sorgu.eq("student_id", yalnizcaOgrenci);

  const { data, error } = await sorgu;
  if (error) throw new Error(`Gönderiler okunamadı: ${error.message}`);

  const ham = (data ?? []) as unknown as Ham[];

  const ogrenciIdleri = new Set(ham.map((g) => g.student_id));
  const ogretmenIdleri = new Set(
    ham.map((g) => g.karar_veren).filter((x): x is string => Boolean(x)),
  );

  const ogrenciAdi = new Map<string, { ad: string; sinif: string | null }>();
  const ogretmenAdi = new Map<string, string>();

  await Promise.all([
    (async () => {
      if (!ogrenciIdleri.size) return;
      const { data } = await supabase
        .from("v_ogrenci_dizini")
        .select("id, ad, soyad, sinif_kodu")
        .in("id", [...ogrenciIdleri]);
      for (const o of data ?? []) {
        ogrenciAdi.set(o.id, { ad: `${o.ad} ${o.soyad}`, sinif: o.sinif_kodu });
      }
    })(),
    (async () => {
      if (!ogretmenIdleri.size) return;
      const { data } = await supabase
        .from("v_ogretmen_dizini")
        .select("id, ad, soyad")
        .in("id", [...ogretmenIdleri]);
      for (const o of data ?? []) ogretmenAdi.set(o.id, `${o.ad} ${o.soyad}`);
    })(),
  ]);

  // İmzalı bağlantılar toplu: gönderi başına ayrı istek, kuyruk dolduğunda
  // onlarca gidiş-dönüş demekti.
  const imza = new Map<string, string>();
  const yollar = [...new Set(ham.map((g) => g.gorsel_yolu))];
  if (yollar.length) {
    const { data } = await supabase.storage.from(KOVA).createSignedUrls(yollar, 3600);
    for (const d of data ?? []) {
      if (d.signedUrl && d.path) imza.set(d.path, d.signedUrl);
    }
  }

  return ham.map((g) => {
    const o = ogrenciAdi.get(g.student_id);
    return {
      id: g.id,
      ogrenciId: g.student_id,
      ogrenci: o?.ad ?? null,
      sinif: o?.sinif ?? null,
      hedef: g.study_goals?.baslik ?? null,
      aciklama: g.aciklama,
      gorselUrl: imza.get(g.gorsel_yolu) ?? null,
      durum: g.durum,
      kararNotu: g.karar_notu,
      kararVeren: g.karar_veren ? (ogretmenAdi.get(g.karar_veren) ?? "Öğretmen") : null,
      createdAt: g.created_at,
    };
  });
}
