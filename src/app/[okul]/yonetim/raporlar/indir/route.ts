/**
 * Katılım raporunun XLSX indirmesi.
 *
 * Neden Route Handler, neden Server Action değil: Server Action bir dosya
 * indirmesi başlatamaz — döndürdüğü değer tarayıcıda JS'e gelir, indirme için
 * yine bir istek gerekir. Burada doğrudan Content-Disposition ile dönüyoruz.
 *
 * Yetki: rota arayüzden bağımsız çağrılabildiği için oturum ve rol burada
 * yeniden doğrulanıyor. Ayrıca veritabanı fonksiyonu SECURITY INVOKER olduğu
 * için RLS de devrede; iki katman da yerinde.
 */

import { z } from "zod";
import { oturum } from "@/lib/auth/oturum";
import { okulBul } from "@/lib/okul";
import { katilimSatirlari, katilimRaporuUret, dosyaAdi } from "@/lib/rapor/katilim";
import { denetimYaz } from "@/lib/denetim";

const tarihSemasi = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function GET(
  istek: Request,
  { params }: { params: Promise<{ okul: string }> },
) {
  const { okul: slug } = await params;

  const o = await oturum();
  if (!o || o.okulSlug !== slug || !o.roller.includes("admin")) {
    return new Response("Bu rapora erişim yetkiniz yok.", { status: 403 });
  }

  const url = new URL(istek.url);
  const baslangic = tarihSemasi.safeParse(url.searchParams.get("baslangic"));
  const bitis = tarihSemasi.safeParse(url.searchParams.get("bitis"));

  if (!baslangic.success || !bitis.success) {
    return new Response("Tarih aralığı geçersiz.", { status: 400 });
  }
  if (baslangic.data > bitis.data) {
    return new Response("Başlangıç tarihi bitişten sonra olamaz.", { status: 400 });
  }

  const okul = await okulBul(slug);
  const satirlar = await katilimSatirlari(baslangic.data, bitis.data);
  const dosya = await katilimRaporuUret(
    okul?.ad ?? slug,
    baslangic.data,
    bitis.data,
    satirlar,
  );

  // Öğrenci verisi okuldan dışarı çıkıyor; kimin ne zaman indirdiği kalsın.
  await denetimYaz({
    schoolId: o.schoolId,
    actorUserId: o.kullaniciId,
    islem: "rapor.katilim_indir",
    entity: "attendance",
    sonrasi: { baslangic: baslangic.data, bitis: bitis.data, satir: satirlar.length },
  });

  return new Response(new Uint8Array(dosya), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${dosyaAdi(baslangic.data, bitis.data)}"`,
      // Rapor anlık veriye dayanıyor; ara katmanların saklaması yanlış olur.
      "Cache-Control": "no-store",
    },
  });
}
