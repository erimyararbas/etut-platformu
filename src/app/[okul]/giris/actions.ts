"use server";

/**
 * Giriş ve şifre belirleme işlemleri.
 *
 * Server Action'lar arayüzden geçmeden, doğrudan POST ile de çağrılabilir.
 * Bu yüzden her action girdisini kendisi doğrular ve hiçbir şey kullanıcıdan
 * gelen "bu kişi yöneticidir" iddiasına güvenmez.
 *
 * Hata mesajları bilerek geneldir: "kullanıcı bulunamadı" ile "şifre yanlış"
 * ayrımı yapmak, kimlerin kayıtlı olduğunu dışarıya sızdırır.
 */

import { redirect } from "next/navigation";
import { z } from "zod";
import { supabaseSunucu } from "@/lib/supabase/server";
import { servisIstemcisi } from "@/lib/supabase/service";
import { kullaniciBul } from "@/lib/auth/kullanici-bul";
import { kimligiCoz, rolAnaSayfasi } from "@/lib/auth/kimlik";
import { davetKoduDogrula } from "@/lib/import/davet";
import { okulBul } from "@/lib/okul";

export interface ActionDurumu {
  hata?: string;
  basarili?: boolean;
}

const HATALI_GIRIS = "Kimlik veya şifre hatalı.";

const girisSemasi = z.object({
  kimlik: z.string().trim().min(1, "Okul numaranızı, e-postanızı veya telefonunuzu girin."),
  sifre: z.string().min(1, "Şifrenizi girin."),
});

export async function girisYap(
  okulSlug: string,
  _oncekiDurum: ActionDurumu,
  formData: FormData,
): Promise<ActionDurumu> {
  const girdi = girisSemasi.safeParse({
    kimlik: formData.get("kimlik"),
    sifre: formData.get("sifre"),
  });
  if (!girdi.success) {
    return { hata: girdi.error.issues[0].message };
  }

  const okul = await okulBul(okulSlug);
  if (!okul) return { hata: "Okul bulunamadı." };

  const kimlik = kimligiCoz(okulSlug, girdi.data.kimlik);
  if (!kimlik) return { hata: HATALI_GIRIS };

  const supabase = await supabaseSunucu();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: kimlik.authEpostasi,
    password: girdi.data.sifre,
  });

  if (error || !data.user) return { hata: HATALI_GIRIS };

  // Öğretmen/yönetici e-postası okula özgü değildir: A okulunun öğretmeni
  // B okulunun adresinden giriş yapmayı deneyebilir. Okul eşleşmiyorsa
  // oturumu hemen kapat.
  const { data: kullanici } = await supabase
    .from("users")
    .select("school_id, durum, sifre_belirlendi_mi")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!kullanici || kullanici.school_id !== okul.id || kullanici.durum !== "aktif") {
    await supabase.auth.signOut();
    return { hata: HATALI_GIRIS };
  }

  if (!kullanici.sifre_belirlendi_mi) {
    redirect(`/${okulSlug}/ilk-giris`);
  }

  const { data: roller } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);

  await supabase
    .from("users")
    .update({ son_giris_at: new Date().toISOString() })
    .eq("id", data.user.id);

  redirect(rolAnaSayfasi(okulSlug, (roller ?? []).map((r) => r.role as string)));
}

const ilkGirisSemasi = z
  .object({
    kimlik: z.string().trim().min(1, "Okul numaranızı, e-postanızı veya telefonunuzu girin."),
    kod: z.string().trim().min(1, "Size verilen davet kodunu girin."),
    sifre: z
      .string()
      .min(8, "Şifre en az 8 karakter olmalı.")
      .max(72, "Şifre en fazla 72 karakter olabilir."),
    sifreTekrar: z.string(),
  })
  .refine((d) => d.sifre === d.sifreTekrar, {
    message: "Şifreler birbiriyle aynı değil.",
    path: ["sifreTekrar"],
  });

/**
 * Davet koduyla ilk şifreyi belirler.
 *
 * Servis anahtarı gerekir: kullanıcı henüz giriş yapamadığı için kendi satırını
 * RLS ile okuyamaz ve Auth tarafında şifre değiştirmek yönetim yetkisi ister.
 */
export async function sifreBelirle(
  okulSlug: string,
  _oncekiDurum: ActionDurumu,
  formData: FormData,
): Promise<ActionDurumu> {
  const girdi = ilkGirisSemasi.safeParse({
    kimlik: formData.get("kimlik"),
    kod: formData.get("kod"),
    sifre: formData.get("sifre"),
    sifreTekrar: formData.get("sifreTekrar"),
  });
  if (!girdi.success) {
    return { hata: girdi.error.issues[0].message };
  }

  const okul = await okulBul(okulSlug);
  if (!okul) return { hata: "Okul bulunamadı." };

  const kimlik = kimligiCoz(okulSlug, girdi.data.kimlik);
  if (!kimlik) return { hata: "Kimlik veya davet kodu hatalı." };

  const servis = servisIstemcisi();
  const kullanici = await kullaniciBul(servis, okul.id, kimlik);

  if (!kullanici || kullanici.durum !== "aktif") {
    return { hata: "Kimlik veya davet kodu hatalı." };
  }
  if (kullanici.sifreBelirlendiMi) {
    return { hata: "Şifreniz zaten belirlenmiş. Giriş sayfasından devam edin." };
  }
  if (!davetKoduDogrula(girdi.data.kod, kullanici.setupTokenHash)) {
    return { hata: "Kimlik veya davet kodu hatalı." };
  }
  if (kullanici.setupTokenExpiresAt && new Date(kullanici.setupTokenExpiresAt) < new Date()) {
    return { hata: "Davet kodunun süresi dolmuş. Okul yönetiminden yeni kod isteyin." };
  }

  const { error: sifreHatasi } = await servis.auth.admin.updateUserById(kullanici.id, {
    password: girdi.data.sifre,
  });
  if (sifreHatasi) {
    // Sağlayıcının mesajı kullanıcıya GÖSTERİLMEZ (giriş yapmamış birine auth
    // ayrıntısı sızdırmak doğru olmaz) ama yutulması da olmaz: bu satır
    // olmadan üretimdeki bir arıza "tekrar deneyin" olarak görünür ve neden
    // olduğu hiçbir yerden anlaşılmaz.
    console.error("İlk giriş şifre belirleme başarısız:", {
      kullaniciId: kullanici.id,
      durum: sifreHatasi.status,
      kod: sifreHatasi.code,
      mesaj: sifreHatasi.message,
    });
    return { hata: "Şifre belirlenemedi. Lütfen tekrar deneyin." };
  }

  // Kod tek kullanımlıktır: kullanıldığı anda silinir.
  await servis
    .from("users")
    .update({
      sifre_belirlendi_mi: true,
      setup_token_hash: null,
      setup_token_expires_at: null,
    })
    .eq("id", kullanici.id);

  // Şifre belirlendi; kullanıcıyı doğrudan içeri al.
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: kimlik.authEpostasi,
    password: girdi.data.sifre,
  });
  if (error || !data.user) {
    return { basarili: true, hata: "Şifreniz belirlendi. Giriş sayfasından devam edin." };
  }

  const { data: roller } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);

  redirect(rolAnaSayfasi(okulSlug, (roller ?? []).map((r) => r.role as string)));
}

export async function cikisYap(okulSlug: string) {
  const supabase = await supabaseSunucu();
  await supabase.auth.signOut();
  redirect(`/${okulSlug}/giris`);
}
