"use client";

/**
 * "Demo olarak incele" — ziyaretçi rol seçip şifresiz giriyor.
 *
 * Kapalı başlıyor: giriş ekranının asıl işi okulun kendi kullanıcılarını
 * içeri almak. Açık bir rol listesi, her sabah giriş yapan öğretmenin önüne
 * her gün gereksiz bir menü koyardı.
 *
 * Her rol kendi formu: tek bir formda gizli bir alanı değiştirip göndermek
 * yerine beş ayrı form olması, hangi düğmenin hangi rolü gönderdiğini
 * tarayıcıya da bırakıyor — JavaScript çalışmasa bile doğru rol gider.
 */

import { useActionState, useState } from "react";
import { DEMO_ROLLER } from "@/lib/demo/roller";
import type { ActionDurumu } from "@/app/[okul]/giris/actions";

interface Props {
  eylem: (durum: ActionDurumu, formData: FormData) => Promise<ActionDurumu>;
}

export function DemoGiris({ eylem }: Props) {
  const [acik, setAcik] = useState(false);
  const [durum, gonder, bekliyor] = useActionState(eylem, {} as ActionDurumu);

  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-cizgi" />
        <span className="text-xs font-semibold uppercase tracking-wide text-soluk">veya</span>
        <span className="h-px flex-1 bg-cizgi" />
      </div>

      {!acik ? (
        <>
          <button
            type="button"
            onClick={() => setAcik(true)}
            className="w-full rounded-lg border border-lacivert bg-lacivert px-4 py-2.5 text-sm font-bold text-white hover:bg-lacivert/90"
          >
            Demo olarak incele
          </button>
          <p className="mt-2 text-center text-xs text-soluk">
            Hesap açmadan, örnek verilerle gezebilirsiniz.
          </p>
        </>
      ) : (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-bold">Hangi rolle bakmak istersiniz?</p>
            <button
              type="button"
              onClick={() => setAcik(false)}
              className="text-xs font-semibold text-mavi underline underline-offset-2"
            >
              Vazgeç
            </button>
          </div>

          {DEMO_ROLLER.map((rol) => (
            <form key={rol.anahtar} action={gonder}>
              <input type="hidden" name="rol" value={rol.anahtar} />
              <button
                type="submit"
                disabled={bekliyor}
                className="w-full rounded-lg border border-cizgi bg-white px-4 py-3 text-left hover:border-lacivert hover:bg-zemin disabled:opacity-50"
              >
                <span className="block text-sm font-bold text-lacivert">{rol.etiket}</span>
                <span className="mt-0.5 block text-xs leading-snug text-soluk">
                  {rol.aciklama}
                </span>
              </button>
            </form>
          ))}

          {durum.hata ? (
            <p role="alert" className="rounded-md bg-marka-acik px-3 py-2 text-sm text-marka-koyu">
              {durum.hata}
            </p>
          ) : null}

          <p className="pt-1 text-xs leading-snug text-soluk">
            Örnek okulun verisidir; gerçek bir öğrenciye ait değildir. Yaptığınız
            değişiklikler diğer ziyaretçilerin de göreceği demo veriyi etkiler.
          </p>
        </div>
      )}
    </div>
  );
}
