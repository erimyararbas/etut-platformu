-- =============================================================================
-- 0018 — Öğretmenin öğrenci çalışma özeti
--
-- Öğretmen bir sınıfın haftalık çalışmasını görmek istiyor: kaç soru, kaç net,
-- ne kadar süre, kaç aktif hedef. Bunu uygulama katmanında kurmak öğrenci
-- başına birer sorgu demekti (bir sınıf = 30 gidiş-dönüş).
--
-- SECURITY INVOKER: RLS devrede. Öğretmen yalnızca kendi okulunun öğrencilerini
-- görür (v_ogrenci_dizini ve study_sessions politikaları bunu zaten söylüyor);
-- burada okul filtresi TEKRAR YAZILMIYOR ki iki kural ayrışmasın.
--
-- LEFT JOIN kasıtlı: hiç çalışmamış öğrenci listeden düşmemeli — öğretmenin
-- görmesi gereken ilk şey tam olarak o öğrenci.
-- =============================================================================

create or replace function ogretmen_calisma_ozeti(p_baslangic date, p_bitis date)
returns table (
  ogrenci_id    uuid,
  ad            text,
  soyad         text,
  okul_no       text,
  sinif_kodu    text,
  soru          bigint,
  net           numeric,
  sure_saniye   bigint,
  son_calisma   date,
  aktif_hedef   bigint
)
language sql
stable
set search_path = public
as $$
  select
    d.id,
    d.ad,
    d.soyad,
    d.okul_no,
    d.sinif_kodu,
    coalesce(sum(o.dogru + o.yanlis + o.bos), 0),
    net_hesapla(coalesce(sum(o.dogru), 0)::int, coalesce(sum(o.yanlis), 0)::int),
    coalesce(sum(o.sure_saniye), 0),
    max(o.calisma_gunu),
    (select count(*) from study_goals g
      where g.student_id = d.id and g.durum = 'aktif')
  from v_ogrenci_dizini d
  left join study_sessions o
    on o.student_id = d.id
   and o.calisma_gunu between p_baslangic and p_bitis
   and o.bitti_at is not null
  group by d.id, d.ad, d.soyad, d.okul_no, d.sinif_kodu
  order by d.sinif_kodu, d.soyad, d.ad;
$$;

comment on function ogretmen_calisma_ozeti(date, date) is
  'Tarih aralığındaki öğrenci çalışma toplamları. Hiç çalışmayan öğrenci de listede.';

revoke execute on function ogretmen_calisma_ozeti(date, date) from public, anon;
grant execute on function ogretmen_calisma_ozeti(date, date) to authenticated, service_role;
