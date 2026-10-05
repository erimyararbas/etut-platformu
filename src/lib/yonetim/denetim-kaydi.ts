/**
 * Denetim kaydı okuma katmanı.
 *
 * `audit_logs` yalnızca yöneticiye ve yalnızca SELECT olarak açıktır (0005):
 * yönetici dahil hiç kimse bu tabloya yazamaz, yazan tek şey sunucudur
 * (bkz. lib/denetim.ts). Değiştirilebilen bir denetim kaydı denetim kaydı değildir.
 */

import "server-only";
import { supabaseSunucu } from "@/lib/supabase/server";
import type { DenetimSatiri } from "./denetim-gorunum";

export type { DenetimSatiri } from "./denetim-gorunum";
export { islemAdi, degisimOzeti, zamanBicimle } from "./denetim-gorunum";

interface Ham {
  id: string;
  islem: string;
  entity: string;
  entity_id: string | null;
  oncesi: Record<string, unknown> | null;
  sonrasi: Record<string, unknown> | null;
  created_at: string;
  users: { ad: string; soyad: string } | { ad: string; soyad: string }[] | null;
}

export async function denetimKayitlari(limit = 100): Promise<DenetimSatiri[]> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, islem, entity, entity_id, oncesi, sonrasi, created_at, users(ad, soyad)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Denetim kaydı okunamadı: ${error.message}`);

  return ((data ?? []) as unknown as Ham[]).map((r) => {
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    return {
      id: r.id,
      islem: r.islem,
      entity: r.entity,
      entityId: r.entity_id,
      // Kullanıcı silinmişse (on delete set null) kayıt yine de kalır.
      aktor: u ? `${u.ad} ${u.soyad}` : null,
      oncesi: r.oncesi,
      sonrasi: r.sonrasi,
      createdAt: r.created_at,
    };
  });
}
