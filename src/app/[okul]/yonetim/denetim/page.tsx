import { rolZorunlu } from "@/lib/auth/oturum";
import {
  denetimKayitlari,
  degisimOzeti,
  islemAdi,
  zamanBicimle,
} from "@/lib/yonetim/denetim-kaydi";

export default async function DenetimSayfasi({ params }: PageProps<"/[okul]/yonetim/denetim">) {
  const { okul: slug } = await params;
  await rolZorunlu(slug, "admin");
  const kayitlar = await denetimKayitlari();

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-extrabold">Denetim Kaydı</h1>
        <p className="text-sm text-soluk">
          Yoklama düzeltmeleri, etüt onayları, ayar değişiklikleri ve şifre sıfırlamaları.
          Bu kayıtlar silinemez ve değiştirilemez.
        </p>
      </div>

      {kayitlar.length === 0 ? (
        <div className="rounded-kart border border-cizgi bg-white p-8 text-center text-sm text-soluk">
          Henüz kayıt yok.
        </div>
      ) : (
        <ol className="space-y-2">
          {kayitlar.map((k) => {
            const degisimler = degisimOzeti(k);
            return (
              <li key={k.id} className="rounded-kart border border-cizgi bg-white p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-bold">{islemAdi(k.islem)}</span>
                  <span className="text-xs text-soluk">{zamanBicimle(k.createdAt)}</span>
                </div>
                <div className="mt-0.5 text-sm text-soluk">
                  {k.aktor ?? "Silinmiş kullanıcı"}
                  <span className="ml-2 font-mono text-xs opacity-70">{k.islem}</span>
                </div>
                {degisimler.length > 0 ? (
                  <ul className="mt-2 space-y-0.5 border-t border-cizgi pt-2">
                    {degisimler.map((d) => (
                      <li key={d} className="font-mono text-xs text-ink-2">
                        {d}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
