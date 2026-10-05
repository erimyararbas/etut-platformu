-- =============================================================================
-- 0024 — Erken uyarı / risk kuyruğu
--
-- Prototipte: "Devamsızlık · akademik düşüş · mentör bildirimi" başlığı altında
-- puanlanmış bir öğrenci listesi (80 / 74 / 64 ...) ve her satırda gerekçe.
--
-- SKOR SAKLANMIYOR, HESAPLANIYOR. Saklansaydı tazeleme işi doğardı: bir
-- öğrenci bugün devamsızlık yaptığında skorun ne zaman güncelleneceği ayrı bir
-- soru olurdu ve cevabı "birinin unuttuğu bir zamanlanmış görev" olurdu.
-- Canlı hesap her zaman günceldir.
--
-- SKOR BİR TEŞHİS DEĞİL, BİR SIRALAMA ARACIDIR. Rehberin önce kime bakacağını
-- söyler, öğrenci hakkında bir yargı bildirmez. Bu yüzden her satır GEREKÇE
-- taşıyor: rehber puanı değil, puanın nedenini okur.
--
-- Yalnızca rehberlik personeli çağırabilir — fonksiyon kendi içinde kontrol
-- ediyor çünkü SECURITY DEFINER olmak zorunda: yoklama ve değerlendirme
-- verisini RLS altında rehber zaten görüyor ama tek tek öğrenci bazında;
-- okul çapında toplamak için tanımlayıcı hak gerekiyor.
-- =============================================================================

create or replace function risk_kuyrugu(p_gun int default 30)
returns table (
  ogrenci_id   uuid,
  ad           text,
  soyad        text,
  sinif_kodu   text,
  mentor_ad    text,
  skor         int,
  devamsizlik  bigint,
  katilim      int,
  ort_yildiz   numeric,
  acik_vaka    bigint,
  gerekceler   text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_okul uuid := auth_school_id();
begin
  if not rehberlik_personeli_mi() then
    raise exception 'Risk kuyruğunu yalnızca rehberlik servisi görebilir.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  with pencere as (
    select (now() at time zone 'Europe/Istanbul')::date - p_gun as baslangic
  ),
  yoklama as (
    select a.student_id,
           count(*) filter (where a.durum = 'devamsiz') as devamsiz,
           count(*) filter (where a.durum = 'katildi') as katildi
    from attendance a
    join etuts e on e.id = a.etut_id, pencere
    where a.school_id = v_okul and e.tarih >= pencere.baslangic
    group by a.student_id
  ),
  yildiz as (
    select ev.student_id, round(avg(ev.yildiz), 1) as ort
    from evaluations ev
    where ev.school_id = v_okul
    group by ev.student_id
  ),
  vaka as (
    select c.student_id, count(*) as acik
    from counseling_cases c
    where c.school_id = v_okul and c.durum <> 'kapandi'
    group by c.student_id
  ),
  hesap as (
    select
      st.user_id,
      u.ad,
      u.soyad,
      c.kod as sinif_kodu,
      mu.ad || ' ' || mu.soyad as mentor_ad,
      coalesce(y.devamsiz, 0) as devamsiz,
      case
        when coalesce(y.katildi, 0) + coalesce(y.devamsiz, 0) = 0 then null
        else round(
          100.0 * y.katildi / (y.katildi + y.devamsiz)
        )::int
      end as katilim_yuzde,
      z.ort as ort_yildiz,
      coalesce(v.acik, 0) as acik_vaka
    from students st
    join users u on u.id = st.user_id
    left join classes c on c.id = st.class_id
    left join users mu on mu.id = st.mentor_teacher_id
    left join yoklama y on y.student_id = st.user_id
    left join yildiz z on z.student_id = st.user_id
    left join vaka v on v.student_id = st.user_id
    where st.school_id = v_okul and u.durum = 'aktif'
  )
  select
    h.user_id,
    h.ad,
    h.soyad,
    h.sinif_kodu,
    h.mentor_ad,
    -- Ağırlıklar: devamsızlık en güçlü sinyal (her biri 12, en çok 48),
    -- düşük katılım oranı 30'a kadar, düşük yıldız 15, açık vaka 10.
    -- Toplam 100'de kırpılıyor.
    least(
      100,
      (least(h.devamsiz, 4) * 12)
      + case
          when h.katilim_yuzde is null then 0
          when h.katilim_yuzde < 50 then 30
          when h.katilim_yuzde < 70 then 20
          when h.katilim_yuzde < 85 then 10
          else 0
        end
      + case
          when h.ort_yildiz is null then 0
          when h.ort_yildiz < 2.5 then 15
          when h.ort_yildiz < 3.5 then 8
          else 0
        end
      + case when h.acik_vaka > 0 then 10 else 0 end
    )::int as skor,
    h.devamsiz,
    h.katilim_yuzde,
    h.ort_yildiz,
    h.acik_vaka,
    -- Gerekçeler: rehber puanı değil, puanın nedenini okur.
    array_remove(array[
      case when h.devamsiz > 0 then h.devamsiz || ' devamsızlık' end,
      case when h.katilim_yuzde is not null and h.katilim_yuzde < 85
           then 'katılım %' || h.katilim_yuzde end,
      case when h.ort_yildiz is not null and h.ort_yildiz < 3.5
           then 'düşük yıldız (' || h.ort_yildiz || ')' end,
      case when h.acik_vaka > 0 then h.acik_vaka || ' açık vaka' end
    ], null) as gerekceler
  from hesap h
  -- Hiçbir sinyali olmayan öğrenci kuyruğa girmez: kuyruk uzarsa işe yaramaz.
  where h.devamsiz > 0
     or (h.katilim_yuzde is not null and h.katilim_yuzde < 85)
     or (h.ort_yildiz is not null and h.ort_yildiz < 3.5)
     or h.acik_vaka > 0
  order by skor desc, h.soyad, h.ad;
end;
$$;

comment on function risk_kuyrugu(int) is
  'Erken uyarı sıralaması. Teşhis değil, rehberin önceliklendirme aracı.';

revoke execute on function risk_kuyrugu(int) from public, anon;
grant execute on function risk_kuyrugu(int) to authenticated, service_role;
