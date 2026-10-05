"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionDurumu } from "@/app/[okul]/giris/actions";

interface Props {
  eylem: (durum: ActionDurumu, formData: FormData) => Promise<ActionDurumu>;
}

export function GirisFormu({ eylem }: Props) {
  const [durum, gonder, bekliyor] = useActionState(eylem, {} as ActionDurumu);

  return (
    <form action={gonder} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="kimlik">Okul No / E-posta / Telefon</Label>
        <Input
          id="kimlik"
          name="kimlik"
          autoComplete="username"
          autoFocus
          required
          placeholder="248"
          aria-describedby="kimlik-yardim"
        />
        <p id="kimlik-yardim" className="text-xs text-muted-foreground">
          Öğrenciler okul numarasıyla, veliler telefonla, öğretmenler e-postayla girer.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sifre">Şifre</Label>
        <Input
          id="sifre"
          name="sifre"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {durum.hata && (
        <p role="alert" className="rounded-md bg-marka-acik px-3 py-2 text-sm text-marka-koyu">
          {durum.hata}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={bekliyor}>
        {bekliyor ? "Giriş yapılıyor…" : "Giriş Yap"}
      </Button>
    </form>
  );
}
