"use server";

/**
 * Kendi şifresini değiştirme.
 *
 * MEVCUT ŞİFRE NEDEN SORULUYOR: Supabase'in `updateUser({ password })` çağrısı
 * eski şifreyi doğrulamaz — açık oturum yeterlidir. Bu, açık bırakılmış bir
 * telefonu eline geçiren birinin hesabı kalıcı olarak ele geçirmesi demektir.
 * Bu yüzden önce mevcut şifreyle yeniden kimlik doğrulanıyor.
 *
 * Doğrulama, oturumu bozmamak için AYRI bir istemciyle yapılır: `signInWithPassword`
 * normal sunucu istemcisinde çağrılırsa oturum çerezlerini yeniden yazar.
 */

import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { actionYetkisi } from "@/lib/auth/oturum";
import { supabaseSunucu } from "@/lib/supabase/server";
import { servisIstemcisi } from "@/lib/supabase/service";

export interface SifreSonuc {
  hata?: string;
  basari?: string;
}

const semasi = z
  .object({
    mevcut: z.string().min(1, "Mevcut şifrenizi girin."),
    yeni: z.string().min(8, "Yeni şifre en az 8 karakter olmalı."),
    tekrar: z.string(),
  })
  .refine((d) => d.yeni === d.tekrar, {
    message: "Yeni şifreler birbiriyle uyuşmuyor.",
    path: ["tekrar"],
  })
  .refine((d) => d.yeni !== d.mevcut, {
    message: "Yeni şifre eskisiyle aynı olamaz.",
    path: ["yeni"],
  });

export async function sifreDegistir(girdi: unknown): Promise<SifreSonuc> {
  const oturum = await actionYetkisi();

  const sonuc = semasi.safeParse(girdi);
  if (!sonuc.success) return { hata: sonuc.error.issues[0].message };

  const supabase = await supabaseSunucu();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { hata: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };

  // Oturum çerezlerine dokunmayan, tek kullanımlık bir istemci.
  const dogrulayici = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error: dogrulamaHatasi } = await dogrulayici.auth.signInWithPassword({
    email: user.email,
    password: sonuc.data.mevcut,
  });
  if (dogrulamaHatasi) return { hata: "Mevcut şifreniz yanlış." };

  const { error } = await servisIstemcisi().auth.admin.updateUserById(oturum.kullaniciId, {
    password: sonuc.data.yeni,
  });
  if (error) return { hata: "Şifre değiştirilemedi. Lütfen tekrar deneyin." };

  // Supabase şifre değişince mevcut oturumu geçersiz kılar. Bunu yapmazsak
  // kullanıcı "Şifreniz değiştirildi" yazısını görür, sonraki tıklamada hiçbir
  // açıklama olmadan giriş ekranına düşer. Yeni şifre elimizdeyken oturumu
  // tazeleyip kullanıcıyı içeride tutuyoruz.
  const { error: oturumHatasi } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: sonuc.data.yeni,
  });
  if (oturumHatasi) {
    return {
      basari: "Şifreniz değiştirildi. Yeni şifrenizle tekrar giriş yapın.",
    };
  }

  return { basari: "Şifreniz değiştirildi." };
}
