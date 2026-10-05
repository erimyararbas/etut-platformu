"use server";

/**
 * Kullanıcı yönetimi işlemleri.
 *
 * ŞİFRE SIFIRLAMA NASIL ÇALIŞIR: yönetici kullanıcının şifresini göremez ve
 * belirleyemez. Yeni bir tek kullanımlık davet kodu üretilir, kullanıcının
 * mevcut şifresi geçersizleşir ve kullanıcı /ilk-giris'ten kendi şifresini
 * yeniden belirler. Kodun kendisi veritabanına yazılmaz; yalnızca SHA-256
 * özeti saklanır ve düz metin hâli yöneticiye BİR KEZ gösterilir.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import crypto from "node:crypto";
import { actionYetkisi } from "@/lib/auth/oturum";
import { servisIstemcisi } from "@/lib/supabase/service";
import { denetimYaz } from "@/lib/denetim";
import { davetKoduUret, davetKoduOzeti, davetSonKullanma } from "@/lib/import/davet";

export interface DavetSonuc {
  hata?: string;
  /** Yöneticiye bir kez gösterilecek düz metin kod. */
  kod?: string;
  kullaniciAdi?: string;
}

const idSemasi = z.string().uuid();

export async function davetKoduYenile(
  okulSlug: string,
  kullaniciId: string,
): Promise<DavetSonuc> {
  const oturum = await actionYetkisi("admin");
  if (!idSemasi.safeParse(kullaniciId).success) return { hata: "Kullanıcı bulunamadı." };

  const servis = servisIstemcisi();

  // Hedef kullanıcı yöneticinin KENDİ okulunda mı? Servis istemcisi RLS'i
  // atladığı için bu kontrol burada elle yapılmak zorunda.
  const { data: hedef } = await servis
    .from("users")
    .select("id, ad, soyad, school_id")
    .eq("id", kullaniciId)
    .maybeSingle();

  if (!hedef || hedef.school_id !== oturum.schoolId) {
    return { hata: "Kullanıcı bulunamadı." };
  }

  const kod = davetKoduUret();

  // Mevcut şifre geçersizleşmeli: aksi hâlde eski şifre çalışmaya devam eder
  // ve "sıfırlama" adı yanlış olurdu. Kullanıcı bu rastgele şifreyi hiç görmez.
  const { error: sifreHatasi } = await servis.auth.admin.updateUserById(kullaniciId, {
    password: crypto.randomUUID() + crypto.randomUUID(),
  });
  if (sifreHatasi) return { hata: "Şifre sıfırlanamadı. Lütfen tekrar deneyin." };

  const { error } = await servis
    .from("users")
    .update({
      setup_token_hash: davetKoduOzeti(kod),
      setup_token_expires_at: davetSonKullanma().toISOString(),
      sifre_belirlendi_mi: false,
    })
    .eq("id", kullaniciId);

  if (error) return { hata: "Davet kodu kaydedilemedi." };

  await denetimYaz({
    schoolId: oturum.schoolId,
    actorUserId: oturum.kullaniciId,
    islem: "kullanici.davet_kodu_yenile",
    entity: "users",
    entityId: kullaniciId,
    // Kodun kendisi denetim kaydına da yazılmaz.
    sonrasi: { sifre_belirlendi_mi: false },
  });

  revalidatePath(`/${okulSlug}/yonetim/kullanicilar`);
  return { kod, kullaniciAdi: `${hedef.ad} ${hedef.soyad}` };
}

/**
 * Ek rol verir veya alır.
 *
 * YALNIZCA `mentor` VE `rehber`. Diğer roller yapısaldır ve Excel aktarımından
 * gelir: `ogrenci` rolünün yanında bir `students` satırı, `veli` rolünün
 * yanında bir `parent_students` bağı olmak zorunda. Bu ekrandan rol verilseydi
 * o satırlar oluşmaz ve hiçbir yere bağlı olmayan bozuk bir kullanıcı çıkardı.
 * `admin` de burada yok; yönetici atamak okul kurulumunun işi.
 *
 * `rehber` bu uygulamadaki en ağır yetki: rehberlik görüşme kayıtlarını
 * yöneticinin bile göremediği yerden açar (0023). Yöneticinin kendine bu rolü
 * verebilmesi bilinçli — 0023'te "müdürün notları okuması gerekiyorsa ona
 * rehber rolü verilir" diye yazılı. Önemli olan sessiz olmaması: denetim
 * kaydına düşüyor.
 */
export async function rolDegistir(
  okulSlug: string,
  kullaniciId: string,
  rol: "mentor" | "rehber",
  ver: boolean,
): Promise<{ hata?: string }> {
  const oturum = await actionYetkisi("admin");
  if (!idSemasi.safeParse(kullaniciId).success) return { hata: "Kullanıcı bulunamadı." };
  if (rol !== "mentor" && rol !== "rehber") return { hata: "Bu rol buradan verilemez." };

  const servis = servisIstemcisi();
  const { data: hedef } = await servis
    .from("users")
    .select("id, ad, soyad, school_id, user_roles(role)")
    .eq("id", kullaniciId)
    .maybeSingle();

  if (!hedef || hedef.school_id !== oturum.schoolId) return { hata: "Kullanıcı bulunamadı." };

  const roller = (hedef.user_roles ?? []).map((r) => r.role);

  // Öğrenciye veya veliye personel rolü verilemez. Asıl korunan şey bu:
  // `rehber` rolü alan bir öğrenci, okulun bütün görüşme kayıtlarını okurdu.
  if (roller.includes("ogrenci") || roller.includes("veli")) {
    return { hata: "Öğrenci ve veli hesaplarına personel rolü verilemez." };
  }

  if (ver) {
    const { error } = await servis
      .from("user_roles")
      .upsert(
        { user_id: kullaniciId, school_id: oturum.schoolId, role: rol },
        { onConflict: "user_id,role" },
      );
    if (error) return { hata: "Rol verilemedi." };
  } else {
    const { error } = await servis
      .from("user_roles")
      .delete()
      .eq("user_id", kullaniciId)
      .eq("role", rol);
    if (error) return { hata: "Rol alınamadı." };
  }

  await denetimYaz({
    schoolId: oturum.schoolId,
    actorUserId: oturum.kullaniciId,
    islem: ver ? "kullanici.rol_ver" : "kullanici.rol_al",
    entity: "user_roles",
    entityId: kullaniciId,
    oncesi: { roller },
    sonrasi: {
      roller: ver ? [...new Set([...roller, rol])] : roller.filter((r) => r !== rol),
    },
  });

  revalidatePath(`/${okulSlug}/yonetim/kullanicilar`);
  return {};
}

export async function durumDegistir(
  okulSlug: string,
  kullaniciId: string,
  yeniDurum: "aktif" | "pasif",
): Promise<{ hata?: string }> {
  const oturum = await actionYetkisi("admin");
  if (!idSemasi.safeParse(kullaniciId).success) return { hata: "Kullanıcı bulunamadı." };
  if (kullaniciId === oturum.kullaniciId) {
    return { hata: "Kendi hesabınızı kapatamazsınız." };
  }

  const servis = servisIstemcisi();
  const { data: hedef } = await servis
    .from("users")
    .select("id, durum, school_id")
    .eq("id", kullaniciId)
    .maybeSingle();

  if (!hedef || hedef.school_id !== oturum.schoolId) return { hata: "Kullanıcı bulunamadı." };

  const { error } = await servis
    .from("users")
    .update({ durum: yeniDurum })
    .eq("id", kullaniciId);

  if (error) return { hata: "Durum değiştirilemedi." };

  await denetimYaz({
    schoolId: oturum.schoolId,
    actorUserId: oturum.kullaniciId,
    islem: "kullanici.durum",
    entity: "users",
    entityId: kullaniciId,
    oncesi: { durum: hedef.durum },
    sonrasi: { durum: yeniDurum },
  });

  revalidatePath(`/${okulSlug}/yonetim/kullanicilar`);
  return {};
}
