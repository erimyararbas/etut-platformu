/**
 * Tarayıcı tarafı Supabase istemcisi.
 *
 * Yalnızca anon anahtarını kullanır; RLS devrededir. Şifre belirleme gibi
 * oturum akışlarında kullanılır.
 */

"use client";

import { createBrowserClient } from "@supabase/ssr";

export function supabaseTarayici() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
