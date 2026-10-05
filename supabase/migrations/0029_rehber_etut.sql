-- =============================================================================
-- 0029 — Rehberin etüt açması ve öğrenci bazında atama
--
-- Rehber bugüne kadar etüt tablolarında hiçbir yazma yetkisine sahip değildi
-- (`etuts_ogretmen_olusturur` `has_role('ogretmen')` şart koşuyor). Okulun
-- istediği şey rehberin "şu öğrenciye şu dersten etüt açılsın" diyebilmesi.
--
-- FAZ 3'ÜN GİZLİLİK KURALI DEĞİŞMİYOR. Burada gevşeyen şey yalnızca AKADEMİK
-- taraf; 0023'ün tek bir politikasına dokunulmuyor, yönetici rehberlik
-- notlarını görmemeye devam ediyor.
--
-- İKİ TUZAK:
--
-- 1. Etüdü rehber açıyor ama dersi ÖĞRETMEN veriyor. Yani `teacher_id`
--    başkası; `etuts_ogretmen_olusturur`un `teacher_id = auth.uid()` şartı
--    burada kullanılamaz. Yetkinin taşıyıcısı `created_by` oluyor.
--
-- 2. Bireysel etüde atanan öğrencinin sınıfı `etut_eligible_classes` içinde
--    OLMAYACAK. `etut_ogrenciye_acik()` yalnızca sınıf uygunluğuna baktığı
--    için etüt öğrenciye GÖRÜNMEZDİ — özellik sessizce çalışmazdı. Fonksiyona
--    ikinci bir dal ekleniyor: kendi kaydı olan öğrenci etüdü görür.
-- =============================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1) Okul ayarı: rehberin açtığı etüt öğretmen onayından geçsin mi?
-- ---------------------------------------------------------------------------
alter table school_settings
  add column if not exists rehber_etut_ogretmen_onayi boolean not null default true;

comment on column school_settings.rehber_etut_ogretmen_onayi is
  'Rehberin bir öğretmen adına açtığı etüt, öğretmen onaylayana kadar yayına girmesin mi?';

-- ---------------------------------------------------------------------------
-- 2) Rehber etüt açabilir
-- ---------------------------------------------------------------------------
create policy etuts_rehber_olusturur on etuts for insert
  to authenticated
  with check (
    school_id = auth_school_id()
    and has_role('rehber')
    and created_by = auth.uid()
  );

-- Açtığı etüdü düzenleyebilir/iptal edebilir — ama yalnızca KENDİ açtığını.
create policy etuts_rehber_gunceller on etuts for update
  to authenticated
  using (school_id = auth_school_id() and has_role('rehber') and created_by = auth.uid())
  with check (school_id = auth_school_id() and has_role('rehber') and created_by = auth.uid());

-- Uygun sınıf yazma hakkı `etut_duzenleyebilir()` üzerinden gidiyor; rehberin
-- açtığı etüt için de geçerli olmalı.
create or replace function etut_duzenleyebilir(p_etut_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from etuts e
     where e.id = p_etut_id
       and e.school_id = auth_school_id()
       and (
         is_admin()
         or e.teacher_id = auth.uid()
         -- Etüdü açan rehber (0029).
         or (e.created_by = auth.uid() and has_role('rehber'))
       )
  );
$$;

-- ---------------------------------------------------------------------------
-- 3) Bireysel/grup etüdüne öğrenci atama
--
-- `sinif_etudu_ogrencileri_ata`nın ikizi, ama sınıf yerine ÖĞRENCİ LİSTESİ
-- alıyor. `reservations`a doğrudan INSERT yetkisi kimsede yok (0005); yazma
-- yalnızca SECURITY DEFINER fonksiyonlarıyla yapılıyor ve bu onlardan biri.
--
-- Kontenjan atanan sayıya eşitlenmiyor — sınıf etüdünden farkı bu. Rehber
-- 5 kontenjanlık bir gruba 3 öğrenci atayıp kalan 2 yeri açık bırakabilir.
-- ---------------------------------------------------------------------------
create or replace function etude_ogrenci_ata(p_etut_id uuid, p_student_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_etut  etuts%rowtype;
  v_sayi  integer;
begin
  select * into v_etut from etuts where id = p_etut_id for update;
  if not found then
    raise exception 'Etüt bulunamadı.' using errcode = 'no_data_found';
  end if;

  if not servis_baglantisi_mi() then
    if auth.uid() is null
       or (v_etut.teacher_id <> auth.uid()
           and not (v_etut.created_by = auth.uid() and has_role('rehber'))
           and not (is_admin() and auth_school_id() = v_etut.school_id))
    then
      raise exception 'Bu işlem için yetkiniz yok.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Başka okulun öğrencisi atanamaz. Dizi olarak geldiği için tek tek
  -- kontrol yerine ekleme sorgusunun kendisi süzüyor.
  insert into reservations (school_id, etut_id, student_id, durum)
  select v_etut.school_id, v_etut.id, s.user_id, 'atandi'
  from students s
  join users u on u.id = s.user_id and u.durum = 'aktif'
  where s.user_id = any (p_student_ids)
    and s.school_id = v_etut.school_id
  on conflict (etut_id, student_id)
    do update set durum = 'atandi', sira_no = null;

  select count(*)::integer into v_sayi
  from reservations where etut_id = p_etut_id and durum = 'atandi';

  return v_sayi;
end;
$$;

comment on function etude_ogrenci_ata(uuid, uuid[]) is
  'Bireysel/grup etüdüne öğrenci atar (durum = atandi). Yetki kontrolü fonksiyonun içindedir.';

-- ---------------------------------------------------------------------------
-- 4) Atanan öğrenci etüdü GÖREBİLMELİ
--
-- Bu düzeltme olmadan bireysel etüt öğrenciye hiç görünmez: sınıfı uygun
-- sınıflar listesinde değil. Kendi rezervasyonu olan öğrenci için ikinci dal.
-- ---------------------------------------------------------------------------
create or replace function etut_ogrenciye_acik(p_etut_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from etuts e
    join etut_eligible_classes ec on ec.etut_id = e.id
    join students s on s.class_id = ec.class_id
    where e.id = p_etut_id
      and e.durum = 'onaylandi'
      and s.user_id = auth.uid()
  )
  or exists (
    -- Bireysel/grup etüdüne doğrudan atanmış veya kendi kaydolmuş öğrenci.
    select 1
    from etuts e
    join reservations r on r.etut_id = e.id
    where e.id = p_etut_id
      and e.durum = 'onaylandi'
      and r.student_id = auth.uid()
      and r.durum <> 'iptal'
  );
$$;

-- ---------------------------------------------------------------------------
-- 5) Öğretmene "onayını bekleyen etüt" bildirimi
-- ---------------------------------------------------------------------------
create or replace function bildirim_rehber_etudu() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acan text;
begin
  -- Yalnızca BAŞKASININ açtığı etütler; öğretmen kendi etüdü için bildirim
  -- almamalı (0009'daki bildirim_etut_durumu zaten onu karşılıyor).
  if new.created_by is null or new.created_by = new.teacher_id then
    return new;
  end if;

  select u.ad || ' ' || u.soyad into v_acan from users u where u.id = new.created_by;

  perform bildirim_gonder(
    new.school_id,
    array[new.teacher_id],
    case when new.durum = 'onay_bekliyor' then 'etut_onayin_bekleniyor' else 'etut_sizin_adiniza' end,
    case when new.durum = 'onay_bekliyor'
         then 'Onayınızı bekleyen etüt var'
         else 'Adınıza etüt açıldı' end,
    coalesce(v_acan, 'Rehberlik servisi') || ' sizin adınıza ' ||
      etut_etiketi(new.id) || ' etüdü açtı.',
    jsonb_build_object('etut_id', new.id)
  );
  return new;
end;
$$;

drop trigger if exists etuts_rehber_bildirim on etuts;
create trigger etuts_rehber_bildirim
  after insert on etuts
  for each row execute function bildirim_rehber_etudu();

-- ---------------------------------------------------------------------------
-- 6) Yan düzeltme: `etut_recurrences` rehbere tam açık kalmasın
--
-- `etut_recurrences_personel` politikası `is_staff()` kullanıyor, yani rehber
-- haftalık tekrar kayıtlarını silebiliyor. Tabloyu yalnızca öğretmenin etüt
-- oluşturma akışı yazıyor; kastedilen "öğretmen veya yönetici"ydi.
-- ---------------------------------------------------------------------------
drop policy if exists etut_recurrences_personel on etut_recurrences;
create policy etut_recurrences_personel on etut_recurrences for all
  to authenticated
  using (school_id = auth_school_id() and (has_role('ogretmen') or is_admin()))
  with check (school_id = auth_school_id() and (has_role('ogretmen') or is_admin()));

revoke execute on function etude_ogrenci_ata(uuid, uuid[]) from public, anon;
grant execute on function etude_ogrenci_ata(uuid, uuid[]) to authenticated, service_role;
