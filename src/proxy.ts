/**
 * Next 16'da `middleware.ts` yerini `proxy.ts` aldı; dışa aktarılan fonksiyon
 * da `proxy` olarak adlandırılmalı. Çalışma ortamı Node.js'tir (edge değil).
 *
 * İki iş yapar:
 *
 * 1. OTURUM YENİLEME. Supabase'in erişim jetonu kısa ömürlüdür. Burada
 *    `getUser()` çağrılarak süresi dolan jeton yenilenir ve yeni çerezler hem
 *    tarayıcıya hem de aşağı akıştaki Server Component'lere geçirilir. Bu
 *    yapılmazsa kullanıcı bir saat sonra sebepsiz yere çıkışa düşer.
 *
 * 2. KİRACI ÇÖZÜMLEME. Yol `/{okulSlug}/...` biçimindedir; slug bir başlığa
 *    yazılır ki sayfalar tekrar ayrıştırmak zorunda kalmasın.
 *
 * DİKKAT: Burada yetki kontrolü YAPILMAZ. Proxy yalnızca oturumu tazeler;
 * "bu kişi bunu görebilir mi" kararı her zaman veritabanındaki RLS ve sayfa
 * içindeki kontrollerle verilir. Yetkilendirmeyi proxy'ye yaslamak, proxy'nin
 * atlandığı her yolda açık bırakır.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Okul slug'ı olmayan, kök seviyedeki yollar. */
const KIRACISIZ_YOLLAR = ["/", "/giris", "/hakkinda"];

export const OKUL_BASLIGI = "x-okul-slug";

export async function proxy(request: NextRequest) {
  let yanit = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(yazilacaklar) {
          for (const { name, value } of yazilacaklar) {
            request.cookies.set(name, value);
          }
          yanit = NextResponse.next({ request });
          for (const { name, value, options } of yazilacaklar) {
            yanit.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Bu çağrı jetonu tazeler. Kaldırılmamalı.
  await supabase.auth.getUser();

  const yol = request.nextUrl.pathname;
  if (!KIRACISIZ_YOLLAR.includes(yol)) {
    const slug = yol.split("/")[1];
    if (slug) yanit.headers.set(OKUL_BASLIGI, slug);
  }

  return yanit;
}

export const config = {
  matcher: [
    /*
     * Statik dosyalar ve görseller hariç her yol. Bunlar için oturum
     * yenilemeye gerek yok ve her istekte Supabase'e gitmek pahalı olur.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
