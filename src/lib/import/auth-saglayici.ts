/**
 * AuthSaglayici'nin üretim uygulaması.
 *
 * Neden veritabanına bakıyoruz: Supabase Auth yönetim API'si e-postaya göre
 * kullanıcı arama sunmaz (yalnızca sayfalı listeleme). Binlerce kullanıcılı bir
 * okulda bu kullanılamaz. Oysa `auth.users` tablosunu servis bağlantısıyla
 * doğrudan sorgulayabiliyoruz — hepsi tek sorguda.
 *
 * Kullanıcı oluşturulurken rastgele bir şifre atanır ve HİÇ KİMSEYE verilmez.
 * Kullanıcı şifresini ilk girişte davet koduyla kendisi belirler.
 */

import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthSaglayici, DbClient } from "./apply";
import { refKey } from "./parse";

export function supabaseAuthSaglayici(
  supabase: SupabaseClient,
  db: DbClient,
): AuthSaglayici {
  return {
    async mevcutlariBul(epostalar: string[]): Promise<Map<string, string>> {
      if (!epostalar.length) return new Map();
      const { rows } = await db.query<{ id: string; email: string }>(
        `select id, email from auth.users where lower(email) = any($1::text[])`,
        [epostalar.map((e) => e.toLowerCase())],
      );
      return new Map(rows.map((r) => [refKey(r.email), r.id]));
    },

    async olustur(eposta: string): Promise<string> {
      const { data, error } = await supabase.auth.admin.createUser({
        email: eposta,
        // Kullanıcı bu şifreyi hiç görmez; davet koduyla kendi şifresini belirler.
        password: crypto.randomBytes(32).toString("base64url"),
        // Sentetik e-postalar gerçek kutulara gitmez; doğrulama beklenemez.
        email_confirm: true,
      });

      if (error || !data.user) {
        throw new Error(`Kullanıcı oluşturulamadı (${eposta}): ${error?.message ?? "bilinmeyen hata"}`);
      }
      return data.user.id;
    },
  };
}
