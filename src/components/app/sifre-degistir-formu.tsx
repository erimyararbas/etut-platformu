"use client";

import { useState, useTransition } from "react";
import { sifreDegistir } from "@/app/[okul]/profil/actions";

export function SifreDegistirFormu() {
  const [bekliyor, basla] = useTransition();
  const [sonuc, setSonuc] = useState<{ hata?: string; basari?: string }>({});
  // Başarıdan sonra alanları temizlemek için formu yeniden kurar.
  const [anahtar, setAnahtar] = useState(0);

  return (
    <form
      key={anahtar}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        basla(async () => {
          const s = await sifreDegistir({
            mevcut: String(f.get("mevcut") ?? ""),
            yeni: String(f.get("yeni") ?? ""),
            tekrar: String(f.get("tekrar") ?? ""),
          });
          setSonuc(s);
          if (s.basari) setAnahtar((a) => a + 1);
        });
      }}
      className="space-y-3"
    >
      <Alan ad="mevcut" etiket="Mevcut şifreniz" />
      <Alan ad="yeni" etiket="Yeni şifre" ipucu="En az 8 karakter." />
      <Alan ad="tekrar" etiket="Yeni şifre (tekrar)" />

      {sonuc.hata ? (
        <div className="rounded-kart border border-marka/30 bg-marka-acik p-3 text-sm font-semibold text-marka-koyu">
          {sonuc.hata}
        </div>
      ) : null}
      {sonuc.basari ? (
        <div className="rounded-kart border border-basarili/30 bg-basarili-acik p-3 text-sm font-semibold text-basarili">
          {sonuc.basari}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={bekliyor}
        className="rounded-lg bg-marka px-4 py-2 text-sm font-bold text-white hover:bg-marka-koyu disabled:opacity-60"
      >
        {bekliyor ? "Değiştiriliyor…" : "Şifremi Değiştir"}
      </button>
    </form>
  );
}

function Alan({ ad, etiket, ipucu }: { ad: string; etiket: string; ipucu?: string }) {
  return (
    <label className="block text-sm font-semibold">
      {etiket}
      <input
        name={ad}
        type="password"
        required
        autoComplete={ad === "mevcut" ? "current-password" : "new-password"}
        className="mt-1 block w-full max-w-sm rounded-lg border border-cizgi px-3 py-2 text-sm font-normal"
      />
      {ipucu ? <span className="mt-0.5 block text-xs font-normal text-soluk">{ipucu}</span> : null}
    </label>
  );
}
