import { rolZorunlu } from "@/lib/auth/oturum";
import { ogrencininEtutleri } from "@/lib/etut/ogrenci";
import { sinavBilgisi } from "@/lib/okul-ayarlari";
import { puanOzeti } from "@/lib/calisma/puan";
import {
  bugun,
  donem,
  geriSayimMetni,
  sinavaKalanGun,
  tarihiYaz,
  type Donem,
} from "@/lib/etut/kurallar";
import { OgrenciEtutKarti } from "@/components/app/ogrenci-etut-karti";
import { EtutTalepFormu } from "@/components/app/etut-talep-formu";
import { ogrencininTalepleri } from "@/lib/etut/talep";
import { supabaseSunucu } from "@/lib/supabase/server";
import { etudeKatil, kaydiBirak, iptalTalebiGonder } from "./actions";

const BASLIKLAR: Record<Donem, string> = {
  bugun: "Bugün",
  buHafta: "Bu hafta",
  gelecekHafta: "Gelecek hafta",
  ilerisi: "İleri tarihli",
  gecmis: "Geçmiş",
};
const SIRA: Donem[] = ["bugun", "buHafta", "gelecekHafta", "ilerisi", "gecmis"];

export default async function OgrenciAnaSayfa({ params }: PageProps<"/[okul]/ogrenci">) {
  const { okul: slug } = await params;
  const oturum = await rolZorunlu(slug, "ogrenci");
  const supabase = await supabaseSunucu();
  const [etutler, sinav, puan, talepler, dersYanit, konuYanit] = await Promise.all([
    ogrencininEtutleri(oturum.kullaniciId),
    sinavBilgisi(),
    puanOzeti(oturum.kullaniciId),
    ogrencininTalepleri(oturum.kullaniciId),
    supabase.from("subjects").select("id, ad").eq("aktif", true).order("ad"),
    supabase.from("topics").select("id, ad, subject_id").order("sira"),
  ]);

  async function katil(etutId: string) {
    "use server";
    return etudeKatil(slug, etutId);
  }
  async function birak(etutId: string) {
    "use server";
    return kaydiBirak(slug, etutId);
  }
  async function iptalTalebi(etutId: string, neden: string) {
    "use server";
    return iptalTalebiGonder(slug, etutId, neden);
  }

  const bugunIso = bugun();

  // Sınav geçmişse geri sayım gösterilmez; okul yeni tarihi girene kadar
  // "-12 gün" yazmaktansa hiç yazmamak doğru.
  const kalanGun = sinav ? sinavaKalanGun(sinav.tarih, bugunIso) : null;
  const geriSayim = kalanGun === null ? null : geriSayimMetni(kalanGun);
  // "Bugün!" ve "Yarın" kendi başına tam cümle; yanına "kaldı" eklenmez.
  const kaldiYazsin = kalanGun !== null && kalanGun > 1;
  const kayitlilar = etutler.filter(
    (e) => e.tarih >= bugunIso && (e.benimDurumum === "rezerve" || e.benimDurumum === "atandi"),
  );
  const sirada = etutler.filter((e) => e.benimDurumum === "beklemede");

  const gruplar = new Map<Donem, typeof etutler>();
  for (const e of etutler) {
    const d = donem(e.tarih, bugunIso);
    if (!gruplar.has(d)) gruplar.set(d, []);
    gruplar.get(d)!.push(e);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-extrabold tracking-tight">Merhaba, {oturum.ad}</h1>
      <p className="mb-5 text-sm text-soluk">
        Sınıfına açık etütler. Kontenjan dolmuşsa sıraya girebilirsin — biri ayrılınca
        otomatik olarak sen alınırsın.
      </p>

      <EtutTalepFormu
        okulSlug={slug}
        dersler={dersYanit.data ?? []}
        konular={konuYanit.data ?? []}
        talepler={talepler}
      />

      {sinav && geriSayim ? (
        <div className="mb-4 flex items-baseline justify-between gap-3 rounded-kart border border-lacivert/20 bg-lacivert px-4 py-3 text-white">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide opacity-75">
              {sinav.ad}
            </div>
            <div className="text-xs opacity-75">{tarihiYaz(sinav.tarih)}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-extrabold leading-none tabular-nums">{geriSayim}</div>
            {kaldiYazsin ? <div className="text-xs opacity-75">kaldı</div> : null}
          </div>
        </div>
      ) : null}

      {/* Yıldız yalnızca kazanılmışsa görünür: sıfır yıldız gösteren bir kutu
          öğrenciyi yüreklendirmez, boş yer kaplar. */}
      {puan.yildiz > 0 ? (
        <div className="mb-3 flex items-baseline justify-between gap-3 rounded-kart border border-uyari/30 bg-uyari-acik px-4 py-3">
          <div>
            <div className="text-2xl font-extrabold tabular-nums text-uyari">
              {puan.yildiz} yıldız
            </div>
            <div className="text-xs text-soluk">
              Öğretmenlerinden topladığın toplam yıldız
            </div>
          </div>
          {puan.ortalama !== null ? (
            <div className="text-right">
              <div className="text-sm font-bold">Ort. {puan.ortalama}/5</div>
              <div className="text-xs text-soluk">
                {puan.degerlendirmeSayisi} değerlendirme
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3">
        <Kutu deger={kayitlilar.length} etiket="Yaklaşan kaydın" />
        <Kutu deger={sirada.length} etiket="Bekleme listesi" renk={sirada.length ? "text-uyari" : undefined} />
      </div>

      {etutler.length === 0 ? (
        <div className="rounded-kart border border-dashed border-cizgi bg-white p-8 text-center">
          <p className="font-semibold">Sınıfına açık etüt yok.</p>
          <p className="mt-1 text-sm text-soluk">
            Öğretmenlerin etüt açtıkça burada görünecek.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {SIRA.filter((d) => gruplar.has(d)).map((d) => (
            <section key={d}>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-soluk">
                {BASLIKLAR[d]}
                <span className="ml-2 font-normal normal-case">({gruplar.get(d)!.length})</span>
              </h2>
              <div className="space-y-3">
                {gruplar.get(d)!.map((e) => (
                  <OgrenciEtutKarti
                    key={e.id}
                    etut={e}
                    katil={katil}
                    birak={birak}
                    iptalTalebi={iptalTalebi}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Kutu({ deger, etiket, renk }: { deger: number; etiket: string; renk?: string }) {
  return (
    <div className="rounded-kart border border-cizgi bg-white px-4 py-3">
      <div className={`text-2xl font-extrabold ${renk ?? ""}`}>{deger}</div>
      <div className="text-xs text-soluk">{etiket}</div>
    </div>
  );
}
