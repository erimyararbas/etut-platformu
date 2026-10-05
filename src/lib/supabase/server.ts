/**
 * Sunucu tarafı Supabase istemcisi (kullanıcı oturumuyla).
 *
 * Bu istemci anon anahtarını ve kullanıcının oturum çerezini kullanır, yani
 * RLS DEVREDEDİR. Uygulamanın neredeyse tamamı bunu kullanmalıdır;
 * `service.ts` içindeki servis istemcisi yalnızca içe aktarım ve kullanıcı
 * oluşturma gibi sistem işleri içindir.
 *
 * Next 16'da `cookies()` asenkrondur.
 */

import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function zorunlu(ad: string): string {
  const deger = process.env[ad];
  if (!deger) throw new Error(`${ad} tanımlı değil (.env.local).`);
  return deger;
}

export async function supabaseSunucu() {
  const cerezler = await cookies();

  return createServerClient(
    zorunlu("NEXT_PUBLIC_SUPABASE_URL"),
    zorunlu("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cerezler.getAll();
        },
        setAll(yazilacaklar) {
          try {
            for (const { name, value, options } of yazilacaklar) {
              cerezler.set(name, value, options);
            }
          } catch {
            // Server Component'ten çağrıldığında çerez yazılamaz. Oturum
            // yenilemesini proxy.ts üstlendiği için bu durum güvenle yok sayılır.
          }
        },
      },
    },
  );
}
