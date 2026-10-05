-- =============================================================================
-- 0001 — Temel şema: kiracı (okul), kişiler, akademik yapı
--
-- Çok okullu (multi-tenant) kurgu: her tabloda school_id vardır ve RLS ile
-- izole edilir. RLS politikaları 0003_rls.sql içindedir.
-- =============================================================================

-- Uzantılar "extensions" şemasına kurulur (Supabase kuralı). public şemasına
-- kurulan uzantılar Supabase güvenlik denetiminde uyarı üretir.
create schema if not exists extensions;
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "btree_gist" with schema extensions;

-- ---------------------------------------------------------------------------
-- Enum türleri
-- ---------------------------------------------------------------------------
create type kullanici_rolu as enum (
  'ogrenci', 'ogretmen', 'veli', 'admin', 'mentor', 'rehber'
);

create type kayit_durumu as enum ('aktif', 'pasif');

create type etut_durumu as enum (
  'taslak', 'onay_bekliyor', 'onaylandi', 'reddedildi', 'iptal'
);

create type rezervasyon_durumu as enum (
  'rezerve',    -- kontenjandan yer aldı
  'beklemede',  -- kontenjan doluydu, sırada
  'atandi',     -- sınıf etüdü: öğrenci otomatik eklendi, kendi çıkamaz
  'iptal'
);

create type iptal_talep_durumu as enum ('yok', 'bekliyor', 'onaylandi', 'reddedildi');

create type yoklama_durumu as enum ('katildi', 'devamsiz', 'mazeretli');

create type yakinlik_turu as enum ('anne', 'baba', 'vasi', 'diger');

create type periyot_turu as enum ('tek_seferlik', 'haftalik');

-- ---------------------------------------------------------------------------
-- Kiracı
-- ---------------------------------------------------------------------------
create table schools (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique
              check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 40),
  ad          text not null,
  logo_url    text,
  tema        jsonb not null default '{}'::jsonb,
  durum       kayit_durumu not null default 'aktif',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table schools is 'Kiracı. Her okul tamamen izole bir veri alanıdır.';

create table school_settings (
  school_id                  uuid primary key references schools(id) on delete cascade,
  -- Öğretmenin açtığı etüt yayına girmeden önce yönetici onayından geçsin mi?
  etut_onay_gerekli          boolean not null default true,
  -- Gelecek haftanın rezervasyonunun açıldığı an (1 = Pazartesi ... 7 = Pazar).
  gelecek_hafta_acilis_gun   smallint not null default 5 check (gelecek_hafta_acilis_gun between 1 and 7),
  gelecek_hafta_acilis_saat  time not null default '20:00',
  -- Etüt bitiminden kaç saat sonra yoklama kilitlenir.
  yoklama_kilit_saat         smallint not null default 24 check (yoklama_kilit_saat between 1 and 720),
  -- Öğrenci ana sayfasındaki geri sayım.
  sinav_adi                  text,
  sinav_tarihi               date,
  zaman_dilimi               text not null default 'Europe/Istanbul',
  updated_at                 timestamptz not null default now()
);

create table academic_years (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  ad          text not null,
  baslangic   date not null,
  bitis       date not null,
  aktif_mi    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (school_id, ad),
  check (bitis > baslangic)
);

-- Okul başına yalnızca bir aktif akademik yıl olabilir.
create unique index academic_years_tek_aktif
  on academic_years (school_id) where aktif_mi;

create table terms (
  id                uuid primary key default gen_random_uuid(),
  academic_year_id  uuid not null references academic_years(id) on delete cascade,
  school_id         uuid not null references schools(id) on delete cascade,
  ad                text not null,
  baslangic         date not null,
  bitis             date not null,
  unique (academic_year_id, ad),
  check (bitis > baslangic)
);

-- ---------------------------------------------------------------------------
-- Kullanıcılar
--
-- users.id = auth.users.id. Gerçek e-postası olmayan öğrenci/veli için Supabase
-- Auth tarafında sentetik bir e-posta üretilir; kullanıcı bunu hiç görmez,
-- giriş formu okul no / telefon / e-posta kabul edip arkada eşler.
-- ---------------------------------------------------------------------------
create table users (
  id                       uuid primary key references auth.users(id) on delete cascade,
  school_id                uuid not null references schools(id) on delete cascade,
  ad                       text not null,
  soyad                    text not null,
  eposta                   text,
  telefon                  text,
  durum                    kayit_durumu not null default 'aktif',
  son_giris_at             timestamptz,
  -- İlk girişte şifre belirlemek için tek kullanımlık kod (hash'lenmiş saklanır).
  setup_token_hash         text,
  setup_token_expires_at   timestamptz,
  sifre_belirlendi_mi      boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index users_school_idx on users (school_id);
create unique index users_school_eposta_key on users (school_id, lower(eposta)) where eposta is not null;
create unique index users_school_telefon_key on users (school_id, telefon) where telefon is not null;

create table user_roles (
  user_id    uuid not null references users(id) on delete cascade,
  school_id  uuid not null references schools(id) on delete cascade,
  role       kullanici_rolu not null,
  primary key (user_id, role)
);

create index user_roles_school_role_idx on user_roles (school_id, role);

-- ---------------------------------------------------------------------------
-- Akademik yapı
-- ---------------------------------------------------------------------------
create table grade_levels (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  ad         text not null,          -- 'Hazırlık', '9. Sınıf', ...
  sira       smallint not null,
  unique (school_id, ad)
);

comment on table grade_levels is
  'Sınıf seviyeleri veriden gelir; ortaokul/ilkokul eklemek kod değişikliği gerektirmez.';

create table classes (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references schools(id) on delete cascade,
  kod               text not null,   -- '11-A'
  grade_level_id    uuid not null references grade_levels(id) on delete restrict,
  sube              text,
  aciklama          text,
  academic_year_id  uuid references academic_years(id) on delete set null,
  durum             kayit_durumu not null default 'aktif',
  unique (school_id, kod)
);

create table subjects (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  ad         text not null,
  kisa_kod   text,
  renk       text,
  aktif      boolean not null default true,
  unique (school_id, ad)
);

-- TYMM ağacı: ders x seviye x konu
create table topics (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  subject_id      uuid not null references subjects(id) on delete cascade,
  grade_level_id  uuid not null references grade_levels(id) on delete cascade,
  ad              text not null,
  sira            smallint not null default 0,
  unique (subject_id, grade_level_id, ad)
);

create index topics_school_idx on topics (school_id);

create table rooms (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  kod        text not null,
  bina       text,
  kat        text,
  kapasite   smallint not null check (kapasite > 0),
  aktif      boolean not null default true,
  unique (school_id, kod)
);

create table etut_types (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  ad         text not null,
  aktif      boolean not null default true,
  unique (school_id, ad)
);

-- ---------------------------------------------------------------------------
-- Rol profilleri
-- ---------------------------------------------------------------------------
create table teachers (
  user_id             uuid primary key references users(id) on delete cascade,
  school_id           uuid not null references schools(id) on delete cascade,
  brans_subject_id    uuid not null references subjects(id) on delete restrict,
  -- Boş dizi = tüm aktif türlere izin var.
  verebilecegi_tur_ids uuid[] not null default '{}',
  mentor_mu           boolean not null default false
);

create index teachers_school_idx on teachers (school_id);

create table students (
  user_id            uuid primary key references users(id) on delete cascade,
  school_id          uuid not null references schools(id) on delete cascade,
  okul_no            text not null,
  class_id           uuid references classes(id) on delete set null,
  mentor_teacher_id  uuid references teachers(user_id) on delete set null,
  unique (school_id, okul_no)
);

create index students_class_idx on students (class_id);
create index students_school_idx on students (school_id);

create table parent_students (
  parent_user_id  uuid not null references users(id) on delete cascade,
  student_id      uuid not null references students(user_id) on delete cascade,
  school_id       uuid not null references schools(id) on delete cascade,
  yakinlik        yakinlik_turu not null,
  primary key (parent_user_id, student_id)
);

create index parent_students_student_idx on parent_students (student_id);

-- ---------------------------------------------------------------------------
-- updated_at tetikleyicisi
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger schools_updated_at before update on schools
  for each row execute function set_updated_at();
create trigger school_settings_updated_at before update on school_settings
  for each row execute function set_updated_at();
create trigger users_updated_at before update on users
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Yardımcı fonksiyonlar
--
-- SECURITY DEFINER oldukları için users/user_roles üzerindeki RLS'e takılmaz;
-- bu sayede politikalar özyinelemeye girmez.
-- ---------------------------------------------------------------------------
create or replace function auth_school_id() returns uuid
language sql stable security definer set search_path = public as $$
  select school_id from users where id = auth.uid();
$$;

create or replace function auth_roles() returns kullanici_rolu[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(role), '{}'::kullanici_rolu[])
  from user_roles where user_id = auth.uid();
$$;

create or replace function has_role(p_role kullanici_rolu) returns boolean
language sql stable as $$ select p_role = any (auth_roles()); $$;

create or replace function is_admin() returns boolean
language sql stable as $$ select has_role('admin'); $$;

create or replace function is_staff() returns boolean
language sql stable as $$
  select has_role('admin') or has_role('ogretmen') or has_role('rehber');
$$;

-- Verilen öğrenciyi görüntüleme hakkı var mı?
create or replace function ogrenciyi_gorebilir(p_student_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    p_student_id = auth.uid()
    or exists (
      select 1 from parent_students ps
      where ps.student_id = p_student_id and ps.parent_user_id = auth.uid()
    )
    or (
      is_staff()
      and exists (
        select 1 from students s
        where s.user_id = p_student_id and s.school_id = auth_school_id()
      )
    );
$$;
