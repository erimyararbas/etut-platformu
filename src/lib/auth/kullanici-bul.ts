/**
 * Giriş kimliğinden kullanıcıyı bulur.
 *
 * `auth.users` tablosuna HİÇ dokunmaz: kimliğin türü zaten belli olduğu için
 * kullanıcı kendi tablolarımızdan bulunabilir. Bu sayede kimlik doğrulama
 * akışları doğrudan veritabanı bağlantısı gerektirmez; servis anahtarıyla
 * PostgREST üzerinden çalışır.
 *
 *   e-posta  → users.eposta      (öğretmen, yönetici)
 *   telefon  → users.telefon     (veli)
 *   okul no  → students.okul_no  (öğrenci)
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CozulmusKimlik } from "./kimlik";

export interface BulunanKullanici {
  id: string;
  durum: string;
  sifreBelirlendiMi: boolean;
  setupTokenHash: string | null;
  setupTokenExpiresAt: string | null;
}

const ALANLAR =
  "id, durum, sifre_belirlendi_mi, setup_token_hash, setup_token_expires_at";

function bicimlendir(satir: Record<string, unknown>): BulunanKullanici {
  return {
    id: satir.id as string,
    durum: satir.durum as string,
    sifreBelirlendiMi: satir.sifre_belirlendi_mi as boolean,
    setupTokenHash: (satir.setup_token_hash as string | null) ?? null,
    setupTokenExpiresAt: (satir.setup_token_expires_at as string | null) ?? null,
  };
}

export async function kullaniciBul(
  servis: SupabaseClient,
  schoolId: string,
  kimlik: CozulmusKimlik,
): Promise<BulunanKullanici | null> {
  if (kimlik.tur === "okul_no") {
    const { data } = await servis
      .from("students")
      // DİKKAT: "users!inner" yeterli DEĞİL. students tablosunun users'a İKİ yolu
      // var (user_id ve mentor_teacher_id üzerinden); PostgREST belirsizlikte
      // hata verir ve öğrenci okul numarasıyla giriş yapamaz. Yabancı anahtar
      // adını açıkça belirtmek şart.
      .select(`user_id, users!students_user_id_fkey!inner(${ALANLAR})`)
      .eq("school_id", schoolId)
      .eq("okul_no", kimlik.normalize)
      .maybeSingle();

    const u = data?.users as unknown as Record<string, unknown> | undefined;
    return u ? bicimlendir(u) : null;
  }

  const sutun = kimlik.tur === "eposta" ? "eposta" : "telefon";
  const { data } = await servis
    .from("users")
    .select(ALANLAR)
    .eq("school_id", schoolId)
    .eq(sutun, kimlik.normalize)
    .maybeSingle();

  return data ? bicimlendir(data as Record<string, unknown>) : null;
}
