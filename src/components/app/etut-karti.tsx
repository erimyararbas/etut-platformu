import type { EtutOzeti } from "@/lib/etut/sorgular";
import { tarihiYaz } from "@/lib/etut/kurallar";

const DURUM_ETIKET: Record<string, { metin: string; sinif: string }> = {
  onay_bekliyor: { metin: "Onay bekliyor", sinif: "bg-uyari-acik text-uyari" },
  onaylandi: { metin: "Onaylı", sinif: "bg-basarili-acik text-basarili" },
  reddedildi: { metin: "Reddedildi", sinif: "bg-marka-acik text-marka-koyu" },
  iptal: { metin: "İptal", sinif: "bg-zemin text-soluk" },
  taslak: { metin: "Taslak", sinif: "bg-zemin text-soluk" },
};

/**
 * Kontenjan çubuğu. Renk eşikleri prototipten: doluluk %80'i geçince sarı,
 * dolunca kırmızı. Sayı da yazılır — renk tek başına erişilebilir değil.
 */
function KontenjanCubugu({ dolu, kontenjan }: { dolu: number; kontenjan: number }) {
  const oran = kontenjan > 0 ? Math.min(dolu / kontenjan, 1) : 0;
  const renk =
    dolu >= kontenjan
      ? "bg-doluluk-dolu"
      : oran >= 0.8
        ? "bg-doluluk-yakin"
        : "bg-doluluk-normal";

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-soluk">Kontenjan</span>
        <span className="font-semibold tabular-nums">
          {dolu}/{kontenjan}
          {dolu >= kontenjan ? (
            <span className="ml-1 font-normal text-marka">dolu</span>
          ) : (
            <span className="ml-1 font-normal text-soluk">
              {kontenjan - dolu} yer kaldı
            </span>
          )}
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-zemin"
        role="img"
        aria-label={`Kontenjan ${dolu} / ${kontenjan}`}
      >
        <div className={`h-full rounded-full ${renk}`} style={{ width: `${oran * 100}%` }} />
      </div>
    </div>
  );
}

export function EtutKarti({
  etut,
  ogretmenGoster = false,
  children,
}: {
  etut: EtutOzeti;
  ogretmenGoster?: boolean;
  children?: React.ReactNode;
}) {
  const durum = DURUM_ETIKET[etut.durum] ?? DURUM_ETIKET.taslak;

  return (
    <article className="rounded-kart border border-cizgi bg-white p-4">
      <div className="mb-2 flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold leading-tight">
            {etut.ders}
            {etut.konu && <span className="font-normal text-soluk"> · {etut.konu}</span>}
          </h3>
          <p className="mt-0.5 text-sm text-soluk">
            {tarihiYaz(etut.tarih)} · {etut.baslangic}–{etut.bitis}
            {etut.derslik && ` · ${etut.derslik}`}
            {ogretmenGoster && ` · ${etut.ogretmen}`}
          </p>
        </div>
        <span className={`rounded-chip px-2 py-1 text-xs font-bold ${durum.sinif}`}>
          {durum.metin}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
        <span className="rounded-chip bg-mavi-acik px-2 py-0.5 font-semibold text-mavi">
          {etut.tur}
        </span>
        {etut.sinifEtuduMu && (
          <span className="rounded-chip bg-lacivert-acik px-2 py-0.5 font-semibold text-lacivert">
            Sınıf etüdü · katılım zorunlu
          </span>
        )}
        {etut.uygunSiniflar.map((k) => (
          <span key={k} className="rounded-chip bg-zemin px-2 py-0.5 text-soluk">
            {k}
          </span>
        ))}
      </div>

      {etut.aciklama && <p className="mb-3 text-sm text-ink-2">{etut.aciklama}</p>}

      {etut.redNedeni && (
        <p className="mb-3 rounded-md bg-marka-acik px-3 py-2 text-sm text-marka-koyu">
          <strong>Red nedeni:</strong> {etut.redNedeni}
        </p>
      )}

      <KontenjanCubugu dolu={etut.dolu} kontenjan={etut.kontenjan} />

      {etut.bekleyen > 0 && (
        <p className="mt-2 text-xs text-soluk">
          Bekleme listesinde {etut.bekleyen} öğrenci var.
        </p>
      )}

      {children && <div className="mt-3 flex flex-wrap gap-2">{children}</div>}
    </article>
  );
}
