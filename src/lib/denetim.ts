/**
 * Denetim kaydı yazımı.
 *
 * `audit_logs` tablosuna HİÇBİR kullanıcının yazma yetkisi yoktur — yönetici
 * dahil (bkz. 0005_yetkiler.sql). Değiştirilebilen bir denetim kaydı denetim
 * kaydı sayılmaz. Bu yüzden satırı kullanıcı oturumu değil, sunucu yazar.
 *
 * Kullanıcı oturumuyla yazmaya çalışmak sessizce başarısız olur: supabase-js
 * hatayı döndürür, kimse bakmazsa kayıt kaybolur. Bu modül tam olarak bunu
 * engellemek için var.
 */

import "server-only";
import { servisIstemcisi } from "@/lib/supabase/service";

export interface DenetimKaydi {
  schoolId: string;
  actorUserId: string;
  islem: string;
  entity: string;
  entityId?: string | null;
  oncesi?: unknown;
  sonrasi?: unknown;
}

export async function denetimYaz(kayit: DenetimKaydi): Promise<void> {
  const { error } = await servisIstemcisi().from("audit_logs").insert({
    school_id: kayit.schoolId,
    actor_user_id: kayit.actorUserId,
    islem: kayit.islem,
    entity: kayit.entity,
    entity_id: kayit.entityId ?? null,
    oncesi: kayit.oncesi ?? null,
    sonrasi: kayit.sonrasi ?? null,
  });

  if (error) {
    // Asıl işlem çoktan yapıldı; burada patlamak kullanıcıya yanlış bilgi verir.
    // Ama sessiz kalmak da olmaz — sunucu günlüğüne bariz biçimde düşsün.
    console.error(
      `[DENETİM KAYDI YAZILAMADI] ${kayit.islem} / ${kayit.entity} ${kayit.entityId}: ${error.message}`,
    );
  }
}
