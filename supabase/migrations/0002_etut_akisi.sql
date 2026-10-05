-- =============================================================================
-- 0002 — Etüt akışı: etütler, rezervasyon, bekleme listesi, yoklama, değerlendirme
--
-- Kontenjan ve bekleme listesi mantığı kasıtlı olarak VERİTABANINDA durur:
-- eşzamanlı iki rezervasyon isteğinin kontenjanı aşmaması ancak satır kilidiyle
-- garanti edilebilir. Öğretmen ve derslik çakışmaları exclusion constraint ile
-- engellenir; öğrenci çakışması rezervasyon fonksiyonunda kontrol edilir.
-- =============================================================================

-- btree_gist "extensions" şemasında olduğu için exclusion constraint'lerin
-- operatör sınıflarını çözebilmesi adına arama yoluna ekleniyor. Nesneler yine
-- public'te oluşur (listedeki ilk şema).
set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Haftalık tekrar serisi
-- ---------------------------------------------------------------------------
create table etut_recurrences (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  -- {"gunler": [1,3,5], "hafta_sayisi": 4}  (1 = Pazartesi)
  kural       jsonb not null,
  created_by  uuid not null references users(id) on delete restrict,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Etütler
-- ---------------------------------------------------------------------------
create table etuts (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  teacher_id      uuid not null references teachers(user_id) on delete restrict,
  subject_id      uuid not null references subjects(id) on delete restrict,
  topic_id        uuid references topics(id) on delete set null,
  etut_type_id    uuid not null references etut_types(id) on delete restrict,
  room_id         uuid references rooms(id) on delete set null,

  tarih           date not null,
  baslangic       time not null,
  bitis           time not null,

  kontenjan       smallint not null check (kontenjan > 0),
  aciklama        text,
  sinif_etudu_mu  boolean not null default false,

  durum           etut_durumu not null default 'onay_bekliyor',
  red_nedeni      text,

  periyot         periyot_turu not null default 'tek_seferlik',
  recurrence_id   uuid references etut_recurrences(id) on delete set null,

  created_by      uuid not null references users(id) on delete restrict,
  approved_by     uuid references users(id) on delete set null,
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Çakışma kontrolleri için tek alan. date + time immutable olduğu için
  -- generated column olarak saklanabilir.
  zaman_araligi   tsrange generated always as
                    (tsrange(tarih + baslangic, tarih + bitis, '[)')) stored,

  check (bitis > baslangic)
);

create index etuts_school_tarih_idx on etuts (school_id, tarih);
create index etuts_teacher_idx on etuts (teacher_id, tarih);
create index etuts_durum_idx on etuts (school_id, durum);
create index etuts_recurrence_idx on etuts (recurrence_id) where recurrence_id is not null;

-- Aynı öğretmen aynı anda iki etüt veremez.
alter table etuts add constraint etuts_ogretmen_cakismasi
  exclude using gist (
    teacher_id with =,
    zaman_araligi with &&
  ) where (durum in ('onay_bekliyor', 'onaylandi'));

-- Aynı derslik aynı anda iki etüde verilemez.
alter table etuts add constraint etuts_derslik_cakismasi
  exclude using gist (
    room_id with =,
    zaman_araligi with &&
  ) where (room_id is not null and durum in ('onay_bekliyor', 'onaylandi'));

create trigger etuts_updated_at before update on etuts
  for each row execute function set_updated_at();

-- Kontenjan, seçilen dersliğin kapasitesini aşamaz.
create or replace function etut_kapasite_kontrolu() returns trigger
language plpgsql as $$
declare
  v_kapasite smallint;
begin
  if new.room_id is not null then
    select kapasite into v_kapasite from rooms where id = new.room_id;
    if new.kontenjan > v_kapasite then
      raise exception 'Kontenjan (%) derslik kapasitesini (%) aşamaz.', new.kontenjan, v_kapasite
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger etuts_kapasite before insert or update of kontenjan, room_id on etuts
  for each row execute function etut_kapasite_kontrolu();

-- Etüdü hangi sınıflar görebilir / rezerve edebilir.
create table etut_eligible_classes (
  etut_id   uuid not null references etuts(id) on delete cascade,
  class_id  uuid not null references classes(id) on delete cascade,
  primary key (etut_id, class_id)
);

create index etut_eligible_classes_class_idx on etut_eligible_classes (class_id);

-- ---------------------------------------------------------------------------
-- Rezervasyonlar
-- ---------------------------------------------------------------------------
create table reservations (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references schools(id) on delete cascade,
  etut_id             uuid not null references etuts(id) on delete cascade,
  student_id          uuid not null references students(user_id) on delete cascade,
  durum               rezervasyon_durumu not null,
  -- Yalnızca 'beklemede' için anlamlı: sıraya giriş numarası.
  sira_no             integer,
  iptal_talebi        iptal_talep_durumu not null default 'yok',
  iptal_talep_nedeni  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (etut_id, student_id)
);

create index reservations_etut_durum_idx on reservations (etut_id, durum);
create index reservations_student_idx on reservations (student_id);
create index reservations_iptal_talebi_idx on reservations (school_id, iptal_talebi)
  where iptal_talebi = 'bekliyor';

create trigger reservations_updated_at before update on reservations
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Yoklama ve değerlendirme
-- ---------------------------------------------------------------------------
create table attendance (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  etut_id     uuid not null references etuts(id) on delete cascade,
  student_id  uuid not null references students(user_id) on delete cascade,
  durum       yoklama_durumu not null,
  marked_by   uuid not null references users(id) on delete restrict,
  marked_at   timestamptz not null default now(),
  unique (etut_id, student_id)
);

create index attendance_student_idx on attendance (student_id);

create table evaluations (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  etut_id         uuid not null references etuts(id) on delete cascade,
  student_id      uuid not null references students(user_id) on delete cascade,
  teacher_id      uuid not null references teachers(user_id) on delete restrict,
  yildiz          smallint not null check (yildiz between 1 and 5),
  hazir_yorumlar  text[] not null default '{}',
  yorum           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (etut_id, student_id)
);

create index evaluations_student_idx on evaluations (student_id);

create trigger evaluations_updated_at before update on evaluations
  for each row execute function set_updated_at();

-- =============================================================================
-- İş kuralı fonksiyonları
-- =============================================================================

-- Etüdün rezervasyona açık olup olmadığı.
--   * geçmiş etüt          → kapalı
--   * bu hafta             → açık
--   * gelecek hafta        → okulun belirlediği açılış anı geçtiyse açık
--   * iki hafta sonrası    → kapalı
--
-- p_simdi yalnızca testler içindir; üretimde verilmez ve okulun saat dilimindeki
-- gerçek zaman kullanılır.
create or replace function rezervasyon_penceresi_acik(
  p_school_id uuid,
  p_tarih     date,
  p_baslangic time,
  p_simdi     timestamp default null
) returns boolean
language plpgsql stable as $$
declare
  s        school_settings%rowtype;
  simdi    timestamp;
  bugun    date;
  bu_pzt   date;
  gel_pzt  date;
  acilis   timestamp;
begin
  select * into s from school_settings where school_id = p_school_id;
  if not found then
    return false;
  end if;

  simdi := coalesce(p_simdi, now() at time zone s.zaman_dilimi);
  bugun := simdi::date;

  if (p_tarih + p_baslangic) <= simdi then
    return false;
  end if;

  bu_pzt  := bugun - (extract(isodow from bugun)::int - 1);
  gel_pzt := bu_pzt + 7;

  if p_tarih < gel_pzt then
    return true;
  elsif p_tarih < gel_pzt + 7 then
    acilis := (bu_pzt + (s.gelecek_hafta_acilis_gun - 1)) + s.gelecek_hafta_acilis_saat;
    return simdi >= acilis;
  else
    return false;
  end if;
end;
$$;

-- Etüdün dolu sayısı (kontenjandan yer tutanlar).
create or replace function etut_dolu_sayisi(p_etut_id uuid) returns integer
language sql stable as $$
  select count(*)::integer
  from reservations
  where etut_id = p_etut_id and durum in ('rezerve', 'atandi');
$$;

-- Yoklama alınabilir mi? (etüdü veren öğretmen + kilit süresi içinde)
create or replace function yoklama_alinabilir(p_etut_id uuid) returns boolean
language plpgsql stable as $$
declare
  e      etuts%rowtype;
  s      school_settings%rowtype;
  simdi  timestamp;
begin
  select * into e from etuts where id = p_etut_id;
  if not found or e.durum <> 'onaylandi' then
    return false;
  end if;
  select * into s from school_settings where school_id = e.school_id;
  simdi := now() at time zone s.zaman_dilimi;
  return simdi >= (e.tarih + e.baslangic)
     and simdi <= (e.tarih + e.bitis) + make_interval(hours => s.yoklama_kilit_saat);
end;
$$;

-- Rezervasyon yap. Kontenjan doluysa bekleme listesine alır.
-- Dönen değer: (durum, sira_no)
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

  -- YETKİ — bu fonksiyon SECURITY DEFINER'dır, yani RLS'i atlar. Kontrol burada
  -- yapılmazsa herhangi bir öğrenci BAŞKASI adına rezervasyon yapabilirdi.
  -- auth.uid() null ise servis anahtarıyla çalışıyoruz (tohumlama, içe aktarım).
  if auth.uid() is not null
     and auth.uid() <> p_student_id
     and e.teacher_id <> auth.uid()
     and not (is_admin() and auth_school_id() = e.school_id)
  then
    raise exception 'Bu işlem için yetkiniz yok.' using errcode = 'insufficient_privilege';
  end if;

  if not rezervasyon_penceresi_acik(e.school_id, e.tarih, e.baslangic) then
    raise exception 'Rezervasyon dönemi kapalı.' using errcode = 'check_violation';
  end if;

  -- Sınıf uygunluğu
  if not exists (
    select 1 from etut_eligible_classes ec
    where ec.etut_id = e.id and ec.class_id = v_student.class_id
  ) then
    raise exception 'Bu etüt sizin sınıfınıza açık değil.' using errcode = 'check_violation';
  end if;

  -- Aynı saatte başka etüt
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

  -- Daha önce iptal edilmiş bir kaydı yeniden kullan
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

-- Rezervasyonu düşür ve bekleme listesinden ilk sıradakini yükselt.
-- Dönen değer: yükseltilen öğrenci (yoksa null) — bildirim göndermek için.
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

  -- YETKİ — bu fonksiyon SECURITY DEFINER'dır, yani RLS'i atlar. Kontrol burada
  -- yapılmazsa herhangi bir öğrenci BAŞKASI adına rezervasyon yapabilirdi.
  -- auth.uid() null ise servis anahtarıyla çalışıyoruz (tohumlama, içe aktarım).
  if auth.uid() is not null
     and auth.uid() <> p_student_id
     and e.teacher_id <> auth.uid()
     and not (is_admin() and auth_school_id() = e.school_id)
  then
    raise exception 'Bu işlem için yetkiniz yok.' using errcode = 'insufficient_privilege';
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

  -- Yer açıldıysa sıradaki ilk kişiyi al.
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

-- Sınıf etüdü: seçilen sınıfların tüm aktif öğrencilerini otomatik atar ve
-- kontenjanı o sayıya eşitler.
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

  -- YETKİ — yalnızca etüdün öğretmeni veya okul yöneticisi toplu atama yapabilir.
  if auth.uid() is not null
     and v_etut.teacher_id <> auth.uid()
     and not (is_admin() and auth_school_id() = v_etut.school_id)
  then
    raise exception 'Bu işlem için yetkiniz yok.' using errcode = 'insufficient_privilege';
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
