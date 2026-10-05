"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionDurumu } from "@/app/[okul]/giris/actions";

interface Props {
  eylem: (durum: ActionDurumu, formData: FormData) => Promise<ActionDurumu>;
}

export function IlkGirisFormu({ eylem }: Props) {
  const [durum, gonder, bekliyor] = useActionState(eylem, {} as ActionDurumu);

  return (
    <form action={gonder} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="kimlik">Okul No / E-posta / Telefon</Label>
        <Input id="kimlik" name="kimlik" autoComplete="username" autoFocus required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="kod">Davet Kodu</Label>
        <Input
          id="kod"
          name="kod"
          required
          placeholder="K7MP-3XRA"
          // Kod büyük harfle üretiliyor; küçük yazılsa da kabul edilir ama
          // büyük göstermek okumayı kolaylaştırıyor.
          className="font-mono uppercase tracking-widest"
          aria-describedby="kod-yardim"
        />
        <p id="kod-yardim" className="text-xs text-muted-foreground">
          Okulunuzun size verdiği tek kullanımlık kod.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sifre">Yeni Şifre</Label>
        <Input
          id="sifre"
          name="sifre"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          aria-describedby="sifre-yardim"
        />
        <p id="sifre-yardim" className="text-xs text-muted-foreground">
          En az 8 karakter.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sifreTekrar">Yeni Şifre (tekrar)</Label>
        <Input
          id="sifreTekrar"
          name="sifreTekrar"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      {durum.hata && (
        <p
          role="alert"
          className={
            durum.basarili
              ? "rounded-md bg-basarili-acik px-3 py-2 text-sm text-basarili"
              : "rounded-md bg-marka-acik px-3 py-2 text-sm text-marka-koyu"
          }
        >
          {durum.hata}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={bekliyor}>
        {bekliyor ? "Kaydediliyor…" : "Şifremi Belirle"}
      </Button>
    </form>
  );
}
