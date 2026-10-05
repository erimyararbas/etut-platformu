"use server";

/**
 * Okul ayarlarının kaydı.
 *
 * Bu ayarlar iş kurallarını doğrudan değiştirdiği (rezervasyon penceresi,
 * yoklama kilidi) için her değişiklik denetim kaydına önce/sonra değerleriyle
 * yazılır: "etütlere neden kayıt olunamıyor" sorusunun cevabı çoğu zaman
 * burada bir değişikliktir.
 *
 * Yazma kullanıcı oturumuyla yapılır — RLS zaten yöneticiyi kendi okuluyla
 * sınırlar (school_settings_admin, 0004). Servis istemcisine gerek yok ve
 * kullanmamak daha güvenli.
 */

import { revalidatePath } from "next/cache";
import { actionYetkisi } from "@/lib/auth/oturum";
import { supabaseSunucu } from "@/lib/supabase/server";
import { denetimYaz } from "@/lib/denetim";
import { ayarSemasi, type Ayarlar } from "@/lib/yonetim/ayar-gorunum";

export interface AyarSonuc {
  hata?: string;
  basari?: string;
}

export async function ayarlariKaydet(
  okulSlug: string,
  girdi: unknown,
): Promise<AyarSonuc> {
  const oturum = await actionYetkisi("admin");

  const sonuc = ayarSemasi.safeParse(girdi);
  if (!sonuc.success) return { hata: sonuc.error.issues[0].message };
  const a = sonuc.data;

  // Uygulama içi bildirim kapatılamaz: bildirim merkezi tek kalıcı kayıttır,
  // kapatılırsa SMS gönderilemediğinde kullanıcı hiçbir şey görmez.
  const kanallar = Array.from(new Set<Ayarlar["kanallar"][number]>(["inapp", ...a.kanallar]));

  const supabase = await supabaseSunucu();

  const { data: onceki } = await supabase
    .from("school_settings")
    .select(
      `etut_onay_gerekli, rehber_etut_ogretmen_onayi, demo_modu,
       gelecek_hafta_acilis_gun, gelecek_hafta_acilis_saat,
       yoklama_kilit_saat, sinav_adi, sinav_tarihi, aktif_bildirim_kanallari`,
    )
    .single();

  const yeni = {
    etut_onay_gerekli: a.etutOnayGerekli,
    rehber_etut_ogretmen_onayi: a.rehberEtutOgretmenOnayi,
    demo_modu: a.demoModu,
    gelecek_hafta_acilis_gun: a.acilisGun,
    // Postgres 'time' değerini "20:00:00" olarak döndürür. Formdan "20:00"
    // gelir; saniyeyi eklemezsek denetim kaydı her kayıtta olmayan bir
    // değişiklik ("20:00:00 → 20:00") gösterir.
    gelecek_hafta_acilis_saat: `${a.acilisSaat}:00`,
    yoklama_kilit_saat: a.yoklamaKilitSaat,
    sinav_adi: a.sinavAdi.trim() || null,
    sinav_tarihi: a.sinavTarihi || null,
    aktif_bildirim_kanallari: kanallar,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("school_settings")
    .update(yeni)
    .eq("school_id", oturum.schoolId);

  if (error) return { hata: `Ayarlar kaydedilemedi: ${error.message}` };

  await denetimYaz({
    schoolId: oturum.schoolId,
    actorUserId: oturum.kullaniciId,
    islem: "ayarlar.guncelle",
    entity: "school_settings",
    entityId: oturum.schoolId,
    oncesi: onceki ?? null,
    sonrasi: yeni,
  });

  // Ayarlar her rolün ekranını etkiler (geri sayım, rezervasyon butonu).
  revalidatePath(`/${okulSlug}`, "layout");
  return { basari: "Ayarlar kaydedildi." };
}
