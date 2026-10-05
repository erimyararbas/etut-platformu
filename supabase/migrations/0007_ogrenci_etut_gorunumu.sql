-- =============================================================================
-- 0007 — Öğrencinin etüt listesi
--
-- Öğrenci ekranı her etüt için beş şey bilmek zorunda: doluluk, bekleme
-- listesi, kendi durumu, rezervasyonun açık olup olmadığı ve saat çakışması.
--
-- Bunları uygulama katmanında hesaplamak iki sorun çıkarırdı:
--   1. Rezervasyon penceresi kuralı (bu hafta / gelecek hafta / açılış anı)
--      hem SQL'de hem TypeScript'te yazılmış olurdu ve zamanla ayrışırdı.
--   2. Her etüt için ayrı sorgu gerekirdi.
--
-- Bu yüzden tek fonksiyon: kural nerede uygulanıyorsa orada duruyor.
--
-- SECURITY INVOKER (varsayılan): RLS devrede kalır, yani öğrenci yalnızca
-- sınıfına açık ve onaylanmış etütleri görür. Fonksiyon bunu ayrıca
-- kontrol etmez — etmesi de gerekmez.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Doluluk sayımı
--
-- DİKKAT: bu fonksiyon SECURITY DEFINER OLMAK ZORUNDA. `reservations` üzerindeki
-- RLS öğrenciye yalnızca KENDİ kaydını gösterir; sayımı öğrencinin oturumuyla
-- yaparsak dolu bir etüt "1/12" görünür ve kontenjan çubuğu yalan söyler.
--
-- Sızıntı yok: fonksiyon yalnızca SAYI döndürür, kimin kayıtlı olduğunu değil.
-- ---------------------------------------------------------------------------
create or replace function etut_doluluk(p_etut_id uuid)
returns table (dolu integer, bekleyen integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where durum in ('rezerve', 'atandi'))::int,
    count(*) filter (where durum = 'beklemede')::int
  from reservations
  where etut_id = p_etut_id;
$$;

comment on function etut_doluluk(uuid) is
  'Etüdün doluluk ve bekleme sayısı. SECURITY DEFINER: RLS altında öğrenci yalnızca kendi kaydını sayabilirdi.';

create or replace function ogrenci_etut_listesi(p_student_id uuid)
returns table (
  id               uuid,
  tarih            date,
  baslangic        time,
  bitis            time,
  kontenjan        smallint,
  aciklama         text,
  sinif_etudu_mu   boolean,
  ders             text,
  konu             text,
  tur              text,
  derslik          text,
  ogretmen_id      uuid,
  dolu             integer,
  bekleyen         integer,
  benim_durumum    rezervasyon_durumu,
  benim_siram      integer,
  iptal_talebim    iptal_talep_durumu,
  rezervasyon_acik boolean,
  cakisma          boolean
)
language sql
stable
set search_path = public
as $$
  select
    e.id,
    e.tarih,
    e.baslangic,
    e.bitis,
    e.kontenjan,
    e.aciklama,
    e.sinif_etudu_mu,
    s.ad,
    t.ad,
    et.ad,
    r.kod,
    e.teacher_id,
    coalesce(d.dolu, 0),
    coalesce(d.bekleyen, 0),
    bana.durum,
    bana.sira_no,
    coalesce(bana.iptal_talebi, 'yok'::iptal_talep_durumu),
    rezervasyon_penceresi_acik(e.school_id, e.tarih, e.baslangic),
    -- Öğrencinin BAŞKA bir etüdüyle saat çakışması var mı? Rezervasyon
    -- fonksiyonu bunu zaten reddeder; burada amaç düğmeyi baştan anlamlı
    -- göstermek.
    exists (
      select 1
      from reservations r2
      join etuts e2 on e2.id = r2.etut_id
      where r2.student_id = p_student_id
        and r2.etut_id <> e.id
        and r2.durum in ('rezerve', 'atandi')
        and e2.durum = 'onaylandi'
        and e2.zaman_araligi && e.zaman_araligi
    )
  from etuts e
  join subjects s on s.id = e.subject_id
  join etut_types et on et.id = e.etut_type_id
  left join topics t on t.id = e.topic_id
  left join rooms r on r.id = e.room_id
  left join lateral etut_doluluk(e.id) d on true
  left join lateral (
    select durum, sira_no, iptal_talebi
    from reservations
    where etut_id = e.id and student_id = p_student_id and durum <> 'iptal'
    limit 1
  ) bana on true
  where e.durum = 'onaylandi'
  order by e.tarih, e.baslangic;
$$;

comment on function ogrenci_etut_listesi(uuid) is
  'Öğrencinin görebildiği onaylı etütler; doluluk, kendi durumu, rezervasyon penceresi ve çakışma bilgisiyle.';

-- Öğrenci iptal talebi oluşturur; öğretmen karara bağlar.
-- SECURITY DEFINER: reservations tablosuna doğrudan yazma yetkisi kimsede yok.
create or replace function iptal_talebi_olustur(
  p_etut_id uuid,
  p_student_id uuid,
  p_neden text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rez reservations%rowtype;
begin
  select * into v_rez from reservations
  where etut_id = p_etut_id and student_id = p_student_id;

  if not found or v_rez.durum = 'iptal' then
    raise exception 'Aktif bir rezervasyon yok.' using errcode = 'no_data_found';
  end if;

  -- YETKİ — giriş yapmamış çağrı burada reddedilir (bkz. 0006).
  if not servis_baglantisi_mi() then
    if auth.uid() is null or auth.uid() <> p_student_id then
      raise exception 'Bu işlem için yetkiniz yok.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if v_rez.durum <> 'atandi' then
    raise exception 'Bu kayıt için iptal talebi gerekmez, doğrudan çıkabilirsiniz.'
      using errcode = 'check_violation';
  end if;

  update reservations
     set iptal_talebi = 'bekliyor', iptal_talep_nedeni = p_neden
   where id = v_rez.id;
end;
$$;

-- Yeni fonksiyonlar da aynı yetki kuralına tabi (bkz. 0006).
revoke execute on function etut_doluluk(uuid) from public, anon;
revoke execute on function ogrenci_etut_listesi(uuid) from public, anon;
revoke execute on function iptal_talebi_olustur(uuid, uuid, text) from public, anon;
grant execute on function etut_doluluk(uuid) to authenticated, service_role;
grant execute on function ogrenci_etut_listesi(uuid) to authenticated, service_role;
grant execute on function iptal_talebi_olustur(uuid, uuid, text) to authenticated, service_role;
