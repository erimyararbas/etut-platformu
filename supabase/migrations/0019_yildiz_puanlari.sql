-- =============================================================================
-- 0019 — Öğretmen değerlendirmeleri puan defterine yazılsın
--
-- Yıldızlar Faz 1'den beri `evaluations` tablosunda duruyor ama `point_ledger`
-- boştu. Prototipte öğrencinin ana sayfasında "124 yıldız · Ort. 4.6/5" yazıyor;
-- bu toplamın tek bir yerden gelmesi gerekiyor.
--
-- NEDEN TETİKLEYİCİ: değerlendirme birkaç farklı ekrandan yazılabiliyor
-- (yoklama ekranı bugün, mentör ekranı yarın). Puan yazmayı uygulama katmanına
-- bırakmak, bir gün birinin unutması demek — ve unutulduğu fark edilmez, çünkü
-- eksik puan hata vermez, sadece yanlış görünür.
--
-- NEDEN UPSERT: öğretmen verdiği yıldızı düzeltebiliyor (evaluations'ta
-- unique(etut_id, student_id) var, satır güncelleniyor). Puan defterine ikinci
-- bir satır atmak toplamı şişirirdi; 0016'daki tekil dizin zaten buna izin
-- vermiyor. Doğru davranış: aynı kaynağın puanını güncellemek.
-- =============================================================================

create or replace function puan_degerlendirme() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into point_ledger (school_id, user_id, tur, miktar, kaynak, kaynak_id, aciklama)
  values (
    new.school_id,
    new.student_id,
    'yildiz',
    new.yildiz,
    'degerlendirme',
    new.etut_id,
    'Etüt değerlendirmesi'
  )
  -- 0016'daki tekil dizin KISMİ (where kaynak_id is not null). Postgres kısmi
  -- bir dizini ON CONFLICT hedefi olarak çıkarabilmek için aynı koşulu burada
  -- da görmek ister; yoksa "no unique constraint matching" der.
  on conflict (user_id, tur, kaynak, kaynak_id) where kaynak_id is not null
    do update set miktar = excluded.miktar, created_at = now();

  return new;
end;
$$;

drop trigger if exists evaluations_puan on evaluations;

create trigger evaluations_puan
  after insert or update of yildiz on evaluations
  for each row execute function puan_degerlendirme();

-- ---------------------------------------------------------------------------
-- Geçmiş değerlendirmeleri aktar
--
-- Tetikleyici yalnızca bundan sonrasını yakalar. Faz 1'de girilmiş
-- değerlendirmeler defterde görünmezse öğrencinin yıldızı bugün sıfırlanmış
-- gibi olurdu.
-- ---------------------------------------------------------------------------
insert into point_ledger (school_id, user_id, tur, miktar, kaynak, kaynak_id, aciklama)
select e.school_id, e.student_id, 'yildiz', e.yildiz, 'degerlendirme', e.etut_id,
       'Etüt değerlendirmesi'
from evaluations e
on conflict (user_id, tur, kaynak, kaynak_id) where kaynak_id is not null do nothing;

-- ---------------------------------------------------------------------------
-- Öğrencinin puan özeti
--
-- SECURITY INVOKER: RLS karar verir. Öğrenci kendininkini, velisi çocuğunun,
-- yönetici okulunun puanını görür (0017'deki point_ledger_gorunur).
--
-- Ortalama yıldız defterden DEĞİL evaluations'tan hesaplanıyor: defter toplam
-- için, ortalama için değerlendirme sayısı gerekiyor ve o bilgi asıl tabloda.
-- ---------------------------------------------------------------------------
create or replace function ogrenci_puan_ozeti(p_student_id uuid)
returns table (
  toplam_yildiz    bigint,
  toplam_elmas     bigint,
  degerlendirme    bigint,
  ortalama_yildiz  numeric
)
language sql
stable
set search_path = public
as $$
  select
    coalesce((select sum(miktar) from point_ledger
               where user_id = p_student_id and tur = 'yildiz'), 0),
    coalesce((select sum(miktar) from point_ledger
               where user_id = p_student_id and tur = 'elmas'), 0),
    (select count(*) from evaluations where student_id = p_student_id),
    (select round(avg(yildiz), 1) from evaluations where student_id = p_student_id);
$$;

revoke execute on function ogrenci_puan_ozeti(uuid) from public, anon;
grant execute on function ogrenci_puan_ozeti(uuid) to authenticated, service_role;
