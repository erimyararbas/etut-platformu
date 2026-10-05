import Link from "next/link";
import { supabaseSunucu } from "@/lib/supabase/server";

/**
 * Kök sayfa. Adres yapısı /{okulSlug}/... olduğu için burası bir kapı görevi
 * görür: kayıtlı okulları listeler ve kullanıcıyı kendi okuluna yönlendirir.
 *
 * Yalnızca `v_okullar_acik` görünümünden okur — giriş yapmamış ziyaretçinin
 * görebildiği tek okul verisi budur (ad, logo). Öğrenci, etüt veya kişi
 * verisine buradan erişilemez.
 */
export default async function AnaSayfa() {
  const supabase = await supabaseSunucu();
  const { data: okullar } = await supabase
    .from("v_okullar_acik")
    .select("slug, ad, logo_url")
    .order("ad");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-lacivert">
            Etüt Platformu
          </h1>
          <p className="mt-2 text-sm text-soluk">
            Etüt rezervasyonu ve akademik takip sistemi
          </p>
        </div>

        {okullar && okullar.length > 0 ? (
          <>
            <h2 className="mb-3 text-sm font-semibold text-ink-2">Okulunuzu seçin</h2>
            <ul className="space-y-2">
              {okullar.map((o) => (
                <li key={o.slug}>
                  <Link
                    href={`/${o.slug}/giris`}
                    className="flex items-center gap-3 rounded-kart border border-cizgi bg-white px-4 py-3 transition-colors hover:border-mavi"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-cizgi text-sm font-extrabold text-marka">
                      {o.ad.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{o.ad}</span>
                      <span className="block text-xs text-soluk">/{o.slug}</span>
                    </span>
                    <span aria-hidden className="text-soluk">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="rounded-kart border border-cizgi bg-white p-6 text-center">
            <p className="text-sm text-soluk">
              Henüz kayıtlı okul yok. Yeni bir okul eklemek için:
            </p>
            <code className="mt-3 block rounded-md bg-zemin px-3 py-2 text-left text-xs">
              npm run okul-olustur -- --slug okul-adi --ad &quot;Okul Adı&quot;
              --yonetici-eposta mudur@okul.k12.tr
            </code>
          </div>
        )}
      </div>
    </main>
  );
}
