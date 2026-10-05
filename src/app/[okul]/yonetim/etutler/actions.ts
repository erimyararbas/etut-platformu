"use server";

/**
 * Yöneticinin etüt iptali.
 *
 * İptal, etüdü silmez — `durum = 'iptal'` olur. Geçmiş, yoklama ve
 * değerlendirme kayıtları etüde bağlı; silmek okulun geçmişini de silerdi.
 *
 * Kayıtlı öğrencilere haber verilmesi gerekir ama bunu uygulama yapmaz:
 * `etuts.durum` değişimi 0009'daki tetikleyiciyi çalıştırır. Bildirim
 * mantığını buraya kopyalamak, bir gün etüt başka bir yerden iptal
 * edildiğinde kimsenin haberi olmaması demekti.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionYetkisi } from "@/lib/auth/oturum";
import { supabaseSunucu } from "@/lib/supabase/server";
import { denetimYaz } from "@/lib/denetim";

export interface EtutSonuc {
  hata?: string;
  basari?: string;
}

const semasi = z.object({
  etutId: z.string().uuid(),
  neden: z.string().trim().min(3, "Kısa bir gerekçe yazın; öğrencilere bu iletilecek."),
});

export async function etudiIptalEt(okulSlug: string, girdi: unknown): Promise<EtutSonuc> {
  const oturum = await actionYetkisi("admin");

  const sonuc = semasi.safeParse(girdi);
  if (!sonuc.success) return { hata: sonuc.error.issues[0].message };

  const supabase = await supabaseSunucu();

  const { data: onceki } = await supabase
    .from("etuts")
    .select("durum, tarih, baslangic")
    .eq("id", sonuc.data.etutId)
    .maybeSingle();

  if (!onceki) return { hata: "Etüt bulunamadı." };
  if (onceki.durum === "iptal") return { hata: "Bu etüt zaten iptal edilmiş." };

  const { error } = await supabase
    .from("etuts")
    .update({ durum: "iptal", red_nedeni: sonuc.data.neden.slice(0, 500) })
    .eq("id", sonuc.data.etutId);

  if (error) return { hata: `Etüt iptal edilemedi: ${error.message}` };

  await denetimYaz({
    schoolId: oturum.schoolId,
    actorUserId: oturum.kullaniciId,
    islem: "etut.iptal",
    entity: "etuts",
    entityId: sonuc.data.etutId,
    oncesi: { durum: onceki.durum },
    sonrasi: { durum: "iptal", red_nedeni: sonuc.data.neden },
  });

  revalidatePath(`/${okulSlug}/yonetim/etutler`);
  return { basari: "Etüt iptal edildi." };
}
