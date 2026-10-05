-- =============================================================================
-- 0013 — Yönetim panosu özeti
--
-- Pano beş ayrı sayım gösteriyor. Bunları PostgREST üzerinden beş ayrı istekle
-- çekmek hem beş gidiş-dönüş hem de tutarsız bir anlık görüntü demek. Tek
-- fonksiyon tek transaction içinde hepsini verir.
--
-- SECURITY INVOKER (varsayılan): fonksiyon çağıranın haklarıyla çalışır, yani
-- RLS devrede kalır ve yönetici yalnızca kendi okulunun sayılarını görür.
-- Burada SECURITY DEFINER kullanmak için hiçbir sebep yok — kullanılsaydı
-- okul filtresini elle yazmak zorunda kalırdık ve bir gün unutulurdu.
--
-- "Yoklaması alınmamış etüt" pilotun en kritik uyarısı: yoklama 24 saat sonra
-- kilitleniyor, kilitlenmeden önce fark edilmesi gerekiyor.
-- =============================================================================

create or replace function yonetim_ozeti()
returns table (
  ogrenci_sayisi          bigint,
  ogretmen_sayisi         bigint,
  giris_yapmamis          bigint,
  onay_bekleyen           bigint,
  bu_hafta_etut           bigint,
  bu_hafta_rezervasyon    bigint,
  yoklamasi_eksik         bigint
)
language sql
stable
set search_path = public
as $$
  with sinirlar as (
    select
      (now() at time zone 'Europe/Istanbul')::date
        - (extract(isodow from (now() at time zone 'Europe/Istanbul')::date)::int - 1)
        as hafta_basi
  )
  select
    (select count(*) from students),
    (select count(*) from teachers),
    (select count(*) from users where not sifre_belirlendi_mi and durum = 'aktif'),
    (select count(*) from etuts where durum = 'onay_bekliyor'),
    (select count(*) from etuts, sinirlar
      where tarih >= sinirlar.hafta_basi
        and tarih < sinirlar.hafta_basi + 7
        and durum = 'onaylandi'),
    (select count(*) from reservations r
      join etuts e on e.id = r.etut_id, sinirlar
      where e.tarih >= sinirlar.hafta_basi
        and e.tarih < sinirlar.hafta_basi + 7
        and r.durum in ('rezerve', 'atandi')),
    (select count(*) from etuts e
      where e.durum = 'onaylandi'
        and (e.tarih + e.bitis) < (now() at time zone 'Europe/Istanbul')
        -- Kimsenin kayıtlı olmadığı etüt için yoklama beklenmez.
        and exists (select 1 from reservations r
                     where r.etut_id = e.id and r.durum in ('rezerve', 'atandi'))
        and not exists (select 1 from attendance a where a.etut_id = e.id));
$$;

comment on function yonetim_ozeti() is
  'Yönetim panosunun sayıları. SECURITY INVOKER: RLS okul filtresini kendisi yapar.';

-- Yetki: 0010''daki olay tetikleyicisi PUBLIC/anon yetkisini kendiliğinden
-- kaldırır ve authenticated/service_role''e verir. Yine de açıkça yazmak,
-- migration''ı tek başına okuyanın niyeti görmesini sağlar.
revoke execute on function yonetim_ozeti() from public, anon;
grant execute on function yonetim_ozeti() to authenticated, service_role;
