"use server";

/**
 * Bildirim okundu işaretleme.
 *
 * Bildirimi kimin okuduğunu `user_id = auth.uid()` RLS politikası belirler;
 * burada ayrıca oturum kontrolü var çünkü Server Action arayüzden bağımsız
 * çağrılabilir. 0011'den beri bu rolün yazabildiği tek kolon `okundu_at`.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseSunucu } from "@/lib/supabase/server";
import { actionYetkisi } from "@/lib/auth/oturum";

export interface BildirimSonuc {
  hata?: string;
}

const idSemasi = z.string().uuid();

export async function okunduIsaretle(
  okulSlug: string,
  bildirimId: string,
): Promise<BildirimSonuc> {
  await actionYetkisi();
  if (!idSemasi.safeParse(bildirimId).success) return { hata: "Bildirim bulunamadı." };

  const supabase = await supabaseSunucu();
  const { error } = await supabase
    .from("notifications")
    .update({ okundu_at: new Date().toISOString() })
    .eq("id", bildirimId)
    // Zaten okunmuş bildirimin zamanı yeniden yazılmasın.
    .is("okundu_at", null);

  if (error) return { hata: "Bildirim işaretlenemedi." };

  revalidatePath(`/${okulSlug}`, "layout");
  return {};
}

export async function tumunuOkunduIsaretle(okulSlug: string): Promise<BildirimSonuc> {
  await actionYetkisi();

  const supabase = await supabaseSunucu();
  // Filtre yok gibi görünüyor ama RLS kullanıcıyı kendi satırlarıyla sınırlıyor.
  const { error } = await supabase
    .from("notifications")
    .update({ okundu_at: new Date().toISOString() })
    .is("okundu_at", null);

  if (error) return { hata: "Bildirimler işaretlenemedi." };

  revalidatePath(`/${okulSlug}`, "layout");
  return {};
}
