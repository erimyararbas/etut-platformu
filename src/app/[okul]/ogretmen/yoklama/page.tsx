import Link from "next/link";
import { rolZorunlu } from "@/lib/auth/oturum";
import { yoklamaListesi, etutKatilimcilari } from "@/lib/etut/yoklama";
import { tarihiYaz } from "@/lib/etut/kurallar";
import { YoklamaPaneli } from "@/components/app/yoklama-paneli";
import {
  yoklamaKaydet,
  degerlendirmeKaydet,
  iptalTalebiKarar,
} from "./actions";
import type { YoklamaDurumu } from "@/lib/etut/yoklama-gorunum";

export default async function YoklamaSayfasi({
  params,
  searchParams,
}: PageProps<"/[okul]/ogretmen/yoklama">) {
  const { okul: slug } = await params;
  const arama = await searchParams;
  const oturum = await rolZorunlu(slug, "ogretmen");

  const etutler = await yoklamaListesi(oturum.kullaniciId);
  const seciliId = typeof arama.etut === "string" ? arama.etut : etutler[0]?.id;
  const secili = seciliId ? await etutKatilimcilari(seciliId) : null;

  async function yoklama(etutId: string, isaretler: Record<string, YoklamaDurumu>) {
    "use server";
    return yoklamaKaydet(slug, etutId, isaretler);
  }
  async function degerlendir(
    etutId: string,
    ogrenciId: string,
    yildiz: number,
    hazir: string[],
    yorum: string,
  ) {
    "use server";
    return degerlendirmeKaydet(slug, etutId, ogrenciId, yildiz, hazir, yorum);
  }
  async function iptalKarar(etutId: string, ogrenciId: string, onay: boolean) {
    "use server";
    return iptalTalebiKarar(slug, etutId, ogrenciId, onay);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-extrabold tracking-tight">Yoklama ve Değerlendirme</h1>
      <p className="mb-6 text-sm text-soluk">
        Yoklama etüt başladıktan sonra alınır ve bitiminden <strong>24 saat</strong> sonra
        kilitlenir. Değerlendirme için süre sınırı yoktur.
      </p>

      {etutler.length === 0 ? (
        <div className="rounded-kart border border-dashed border-cizgi bg-white p-8 text-center">
          <p className="font-semibold">Yoklama bekleyen etüt yok.</p>
          <p className="mt-1 text-sm text-soluk">
            Etüt başladıktan sonra burada görünecek.
          </p>
        </div>
      ) : (
        <>
          <ul className="mb-6 grid gap-2 sm:grid-cols-2">
            {etutler.map((e) => {
              const secili = e.id === seciliId;
              const tamam = e.kayitli > 0 && e.yoklananSayisi >= e.kayitli;
              return (
                <li key={e.id}>
                  <Link
                    href={`/${slug}/ogretmen/yoklama?etut=${e.id}`}
                    aria-current={secili ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                      secili ? "border-mavi bg-mavi-acik" : "border-cizgi bg-white hover:border-mavi/50"
                    }`}
                  >
                    <span
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        tamam ? "bg-basarili-acik text-basarili" : "bg-uyari-acik text-uyari"
                      }`}
                    >
                      {tamam ? "✓" : "!"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {e.ders}
                        {e.konu && <span className="font-normal text-soluk"> · {e.konu}</span>}
                      </span>
                      <span className="block text-xs text-soluk">
                        {tarihiYaz(e.tarih)} · {e.baslangic}
                        {" · "}
                        yoklama {e.yoklananSayisi}/{e.kayitli}
                        {" · "}
                        değerlendirme {e.degerlendirilen}/{e.kayitli}
                        {!e.yoklamaAcik && " · kilitli"}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {secili && (
            <YoklamaPaneli
              key={secili.id}
              etut={secili}
              yoklamaKaydet={yoklama}
              degerlendir={degerlendir}
              iptalKarar={iptalKarar}
            />
          )}
        </>
      )}
    </div>
  );
}
