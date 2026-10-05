-- =============================================================================
-- 0006 — Güvenlik sıkılaştırma
--
-- Supabase güvenlik denetiminin (database linter) bulgularına karşılık gelir.
--
-- 1) KRİTİK: SECURITY DEFINER fonksiyonlar giriş yapmamış kullanıcıya açıktı.
--    Postgres fonksiyonlara varsayılan olarak PUBLIC'e EXECUTE verir; 0005'teki
--    "revoke ... from anon" bu varsayılanı kaldırmaz. Üstelik yetki kontrolüm
--    "auth.uid() is null ise servis anahtarıdır" varsayıyordu — oysa anon'un da
--    auth.uid()'i null. Yani internetten herhangi biri /rest/v1/rpc/rezervasyon_yap
--    çağırıp istediği öğrenci adına işlem yapabilirdi.
--
-- 2) Fonksiyonlarda search_path sabitlenmemişti. SECURITY DEFINER bir fonksiyonda
--    bu, çağıranın search_path'i ile sahte tabloya yönlendirme riskidir.
--
-- 3) v_okullar_acik görünümü anon'a açık bir SECURITY DEFINER görünümdü;
--    RLS politikasıyla aynı işi yapıp görünümü invoker'a çeviriyoruz.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Servis bağlantısı tespiti
--
-- "auth.uid() null" ölçütü yerine bağlantının hangi veritabanı rolüyle
-- kurulduğuna bakılır. anon rolü buna dahil DEĞİLDİR.
-- ---------------------------------------------------------------------------
-- DİKKAT: burada current_user KULLANILAMAZ. Bu fonksiyon SECURITY DEFINER bir
-- fonksiyonun içinden çağrılır ve orada current_user fonksiyon SAHİBİNE döner
-- (postgres), yani her çağrı "servis" görünür. Rol, isteğin JWT talebinden
-- okunmalıdır — Supabase'in auth.role() fonksiyonunun yaptığı da budur.
--
--   istek bağlamı yok (doğrudan veritabanı bağlantısı: migration, tohumlama)
--                                        → servis
--   'service_role'                       → servis
--   'anon' / 'authenticated' / diğer     → servis DEĞİL (kapalıya düşer)
create or replace function servis_baglantisi_mi() returns boolean
language sql stable
set search_path = public
as $$
  select coalesce(auth.role(), 'service_role') = 'service_role';
$$;

comment on function servis_baglantisi_mi() is
  'Sunucu tarafı servis bağlantısı mı? İçe aktarım ve tohumlama işleri için. anon bu listede değildir.';

-- ---------------------------------------------------------------------------
-- 2) İş kuralı fonksiyonları — düzeltilmiş yetki kontrolüyle
-- ---------------------------------------------------------------------------
create or replace function rezervasyon_yap(
  p_etut_id    uuid,
  p_student_id uuid
) returns table (durum rezervasyon_durumu, sira_no integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  e          etuts%rowtype;
  v_student  students%rowtype;
  v_dolu     integer;
  v_durum    rezervasyon_durumu;
  v_sira     integer;
  v_mevcut   reservations%rowtype;
  -- DİKKAT: FOUND her SELECT INTO ile sıfırlanır; kaydın var olup olmadığını
  -- araya giren sorgulardan etkilenmeyecek şekilde ayrı bir değişkende tutuyoruz.
  v_kayit_var boolean;
begin
  -- Etüdü kilitle: eşzamanlı isteklerin kontenjanı aşmasını bu satır engeller.
  select * into e from etuts where id = p_etut_id for update;
  if not found then
    raise exception 'Etüt bulunamadı.' using errcode = 'no_data_found';
  end if;

  if e.durum <> 'onaylandi' then
    raise exception 'Bu etüt rezervasyona kapalı.' using errcode = 'check_violation';
  end if;

  select * into v_student from students where user_id = p_student_id;
  if not found or v_student.school_id <> e.school_id then
    raise exception 'Öğrenci bu okula ait değil.' using errcode = 'check_violation';
  end if;

  -- YETKİ — bu fonksiyon SECURITY DEFINER'dır, yani RLS'i atlar.
  -- Giriş yapmamış çağrı (auth.uid() null) BURADA REDDEDİLİR.
  if not servis_baglantisi_mi() then
    if auth.uid() is null
       or (auth.uid() <> p_student_id
           and e.teacher_id <> auth.uid()
           and not (is_admin() and auth_school_id() = e.school_id))
    then
      raise exception 'Bu işlem için yetkiniz yok.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if not rezervasyon_penceresi_acik(e.school_id, e.tarih, e.baslangic) then
    raise exception 'Rezervasyon dönemi kapalı.' using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from etut_eligible_classes ec
    where ec.etut_id = e.id and ec.class_id = v_student.class_id
  ) then
    raise exception 'Bu etüt sizin sınıfınıza açık değil.' using errcode = 'check_violation';
  end if;

  if exists (
    select 1
    from reservations r
    join etuts e2 on e2.id = r.etut_id
    where r.student_id = p_student_id
      and r.etut_id <> e.id
      and r.durum in ('rezerve', 'atandi')
      and e2.durum in ('onaylandi', 'onay_bekliyor')
      and e2.zaman_araligi && e.zaman_araligi
  ) then
    raise exception 'Bu saatte başka bir etüde kayıtlısınız.' using errcode = 'check_violation';
  end if;

  select * into v_mevcut from reservations
  where etut_id = p_etut_id and student_id = p_student_id;
  v_kayit_var := found;

  if v_kayit_var and v_mevcut.durum <> 'iptal' then
    raise exception 'Bu etüde zaten kayıtlısınız.' using errcode = 'unique_violation';
  end if;

  v_dolu := etut_dolu_sayisi(p_etut_id);

  if v_dolu < e.kontenjan then
    v_durum := 'rezerve';
    v_sira  := null;
  else
    v_durum := 'beklemede';
    select coalesce(max(r.sira_no), 0) + 1 into v_sira
    from reservations r where r.etut_id = p_etut_id and r.durum = 'beklemede';
  end if;

  if v_kayit_var then
    update reservations
       set durum = v_durum, sira_no = v_sira, iptal_talebi = 'yok', iptal_talep_nedeni = null
     where id = v_mevcut.id;
  else
    insert into reservations (school_id, etut_id, student_id, durum, sira_no)
    values (e.school_id, p_etut_id, p_student_id, v_durum, v_sira);
  end if;

  return query select v_durum, v_sira;
end;
$$;

create or replace function rezervasyon_birak(
  p_etut_id    uuid,
  p_student_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  e            etuts%rowtype;
  v_mevcut     reservations%rowtype;
  v_yukselen   reservations%rowtype;
begin
  select * into e from etuts where id = p_etut_id for update;
  if not found then
    raise exception 'Etüt bulunamadı.' using errcode = 'no_data_found';
  end if;

  if not servis_baglantisi_mi() then
    if auth.uid() is null
       or (auth.uid() <> p_student_id
           and e.teacher_id <> auth.uid()
           and not (is_admin() and auth_school_id() = e.school_id))
    then
      raise exception 'Bu işlem için yetkiniz yok.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  select * into v_mevcut from reservations
  where etut_id = p_etut_id and student_id = p_student_id;
  if not found or v_mevcut.durum = 'iptal' then
    raise exception 'Aktif bir rezervasyon yok.' using errcode = 'no_data_found';
  end if;

  if v_mevcut.durum = 'atandi' then
    raise exception 'Sınıf etüdünden kendiniz çıkamazsınız.' using errcode = 'check_violation';
  end if;

  update reservations set durum = 'iptal', sira_no = null, iptal_talebi = 'yok'
   where id = v_mevcut.id;

  if v_mevcut.durum = 'rezerve' and etut_dolu_sayisi(p_etut_id) < e.kontenjan then
    select * into v_yukselen from reservations
     where etut_id = p_etut_id and durum = 'beklemede'
     order by sira_no
     limit 1
     for update;

    if found then
      update reservations set durum = 'rezerve', sira_no = null where id = v_yukselen.id;
      return v_yukselen.student_id;
    end if;
  end if;

  return null;
end;
$$;

create or replace function sinif_etudu_ogrencileri_ata(p_etut_id uuid) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sayi integer;
  -- DİKKAT: değişken adı sorgudaki "etuts e" takma adıyla çakışmamalı.
  v_etut etuts%rowtype;
begin
  select * into v_etut from etuts where id = p_etut_id;
  if not found then
    raise exception 'Etüt bulunamadı.' using errcode = 'no_data_found';
  end if;

  if not servis_baglantisi_mi() then
    if auth.uid() is null
       or (v_etut.teacher_id <> auth.uid()
           and not (is_admin() and auth_school_id() = v_etut.school_id))
    then
      raise exception 'Bu işlem için yetkiniz yok.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  insert into reservations (school_id, etut_id, student_id, durum)
  select e.school_id, e.id, s.user_id, 'atandi'
  from etuts e
  join etut_eligible_classes ec on ec.etut_id = e.id
  join students s on s.class_id = ec.class_id
  join users u on u.id = s.user_id and u.durum = 'aktif'
  where e.id = p_etut_id
  on conflict (etut_id, student_id)
    do update set durum = 'atandi', sira_no = null;

  select count(*)::integer into v_sayi
  from reservations where etut_id = p_etut_id and durum = 'atandi';

  update etuts set kontenjan = greatest(v_sayi, 1) where id = p_etut_id;
  return v_sayi;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) search_path'i sabitlenmemiş fonksiyonlar
-- ---------------------------------------------------------------------------
alter function set_updated_at()                              set search_path = public;
alter function has_role(kullanici_rolu)                      set search_path = public;
alter function is_admin()                                    set search_path = public;
alter function is_staff()                                    set search_path = public;
alter function etut_kapasite_kontrolu()                      set search_path = public;
alter function etut_dolu_sayisi(uuid)                        set search_path = public;
alter function yoklama_alinabilir(uuid)                      set search_path = public;
alter function yoklama_kilit_kontrolu()                      set search_path = public;
alter function rezervasyon_penceresi_acik(uuid, date, time, timestamp)
                                                             set search_path = public;

-- ---------------------------------------------------------------------------
-- 4) Fonksiyon yetkileri
--
-- Postgres her fonksiyona PUBLIC üzerinden EXECUTE verir. Önce bu varsayılan
-- kaldırılır, sonra yalnızca giriş yapmış kullanıcılara ve servise verilir.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant execute on all functions in schema public to authenticated, service_role;

-- Bundan sonra oluşturulacak fonksiyonlar da aynı varsayılana tabi olsun.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

-- ---------------------------------------------------------------------------
-- 5) v_okullar_acik → SECURITY INVOKER
--
-- Giriş sayfasının okulu tanıması için gereken marka bilgisi. Görünümü
-- invoker'a çevirip erişimi RLS politikasıyla veriyoruz; böylece kural
-- görünümün içinde gizli kalmak yerine politika olarak görünür oluyor.
-- Okul adı ve logosu gizli bilgi değildir.
-- ---------------------------------------------------------------------------
drop view if exists v_okullar_acik;

create view v_okullar_acik
  with (security_invoker = on) as
  select id, slug, ad, logo_url, tema from schools where durum = 'aktif';

create policy schools_acik_marka on schools for select
  to anon, authenticated using (durum = 'aktif');

grant select on schools to anon;
grant select on v_okullar_acik to anon, authenticated;
