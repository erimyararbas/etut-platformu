-- =============================================================================
-- 0023 — Faz 3: Rehberlik servisi
--
-- BU MIGRATION'IN TAMAMI TEK BİR CÜMLEYE DAYANIYOR. Prototipin rehberlik
-- ekranının tepesinde yazıyor:
--
--     "Rehberlik notları gizlidir · yalnız rehberlik servisi görür"
--
-- Buradaki veri reşit olmayan öğrenciler hakkında görüşme kaydı. Uygulamanın
-- geri kalanında yönetici kendi okulunun her şeyini görür; BURADA GÖRMEZ.
-- `is_staff()` yönetici ve öğretmeni de kapsadığı için bu dosyada hiç
-- kullanılmıyor — yalnızca `has_role('rehber')`.
--
-- Okul müdürünün görüşme notlarını okuması gerekiyorsa çözüm ona `rehber`
-- rolünü vermektir; bu bilinçli ve kayıtlı bir karar olur. Sessizce yönetici
-- yetkisiyle sızmasındansa böylesi doğru.
--
-- VELİ: randevusunu görür ve talep açar, görüşme notlarını GÖRMEZ. Bir notun
-- veliyle paylaşılması istenirse rehber o notun görünürlüğüne 'veli' ekler —
-- açık ve tek tek verilen bir izin.
-- =============================================================================

create type vaka_durumu as enum ('acik', 'izlemede', 'kapandi');
create type vaka_onceligi as enum ('dusuk', 'normal', 'yuksek');
create type randevu_turu as enum ('bireysel', 'veli', 'grup');
create type randevu_durumu as enum ('talep', 'planlandi', 'onaylandi', 'iptal', 'tamamlandi');

-- ---------------------------------------------------------------------------
-- Vakalar
-- ---------------------------------------------------------------------------
create table counseling_cases (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  student_id  uuid not null references students(user_id) on delete cascade,
  acan        uuid not null references users(id) on delete restrict,
  baslik      text not null,
  oncelik     vaka_onceligi not null default 'normal',
  durum       vaka_durumu not null default 'acik',
  kapanis_ozeti text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index counseling_cases_ogrenci_idx on counseling_cases (student_id, durum);
create index counseling_cases_okul_idx on counseling_cases (school_id, durum, oncelik);

-- ---------------------------------------------------------------------------
-- Görüşme notları
--
-- TEK TABLO, GÖRÜNÜRLÜK DİZİSİ. Planda `case_messages` ve `private_notes` ayrı
-- iki tablo olarak geçiyordu; tek tabloda `gorunurluk` dizisiyle ikisi de
-- karşılanıyor ve "bu not hangi tabloda?" sorusu hiç doğmuyor. İki tablo
-- olsaydı aynı kural iki yerde yazılır ve zamanla ayrışırdı.
--
-- Varsayılan {rehber}: bir not aksi SÖYLENMEDİKÇE gizlidir. Tersi olsaydı
-- (varsayılan herkese açık) bir gün biri paylaşımı kapatmayı unuturdu.
-- ---------------------------------------------------------------------------
create table case_notes (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  case_id     uuid not null references counseling_cases(id) on delete cascade,
  yazan       uuid not null references users(id) on delete restrict,
  metin       text not null,
  gorunurluk  kullanici_rolu[] not null default '{rehber}',
  -- Yalnızca yazanın göreceği not: başka bir rehber bile okuyamaz.
  yalnizca_yazan boolean not null default false,
  created_at  timestamptz not null default now(),
  -- 'rehber' her zaman görünürlükte kalmalı; çıkarılırsa notu kimse yönetemez.
  constraint case_notes_rehber_kalmali check ('rehber' = any (gorunurluk))
);

create index case_notes_vaka_idx on case_notes (case_id, created_at);

-- ---------------------------------------------------------------------------
-- Randevular
-- ---------------------------------------------------------------------------
create table appointments (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools(id) on delete cascade,
  student_id   uuid not null references students(user_id) on delete cascade,
  case_id      uuid references counseling_cases(id) on delete set null,
  -- Talebi açan: öğrenci, veli veya rehberin kendisi.
  talep_eden   uuid not null references users(id) on delete restrict,
  rehber_id    uuid references users(id) on delete set null,
  tur          randevu_turu not null default 'bireysel',
  tarih        date,
  baslangic    time,
  durum        randevu_durumu not null default 'talep',
  talep_notu   text,
  ret_nedeni   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Planlanmış bir randevunun zamanı olmak zorunda.
  constraint appointments_zaman check (
    durum = 'talep' or durum = 'iptal' or (tarih is not null and baslangic is not null)
  )
);

create index appointments_ogrenci_idx on appointments (student_id, tarih desc);
create index appointments_kuyruk_idx on appointments (school_id, durum, tarih);

-- =============================================================================
-- RLS
-- =============================================================================
alter table counseling_cases enable row level security;
alter table case_notes       enable row level security;
alter table appointments     enable row level security;

/**
 * Rehberlik personeli mi? Yönetici ve öğretmen BU KAPSAMA GİRMEZ.
 * `is_staff()` yerine bu kullanılıyor; ikisini karıştırmak rehberlik verisini
 * tüm okul personeline açardı.
 */
create or replace function rehberlik_personeli_mi() returns boolean
language sql stable set search_path = public as $$
  select has_role('rehber');
$$;

-- --- Vakalar: yalnızca rehberlik servisi ---
create policy counseling_cases_rehber on counseling_cases for all
  to authenticated
  using (rehberlik_personeli_mi() and school_id = auth_school_id())
  with check (rehberlik_personeli_mi() and school_id = auth_school_id());

/**
 * Bir vakanın öğrencisi. SECURITY DEFINER olmak ZORUNDA: politikaların içindeki
 * alt sorgular da RLS'e tabidir ve `counseling_cases` yalnızca rehbere açık.
 * Doğrudan `exists (select ... from counseling_cases ...)` yazıldığında,
 * kendisiyle paylaşılmış bir notu okumaya çalışan mentör için o alt sorgu boş
 * döner ve not görünmez. (0004'te aynı tuzağa düşülmüştü.)
 *
 * Sızdırdığı tek bilgi, zaten kendisiyle paylaşılmış bir notun hangi öğrenciye
 * ait olduğu.
 */
create or replace function vakanin_ogrencisi(p_case_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select student_id from counseling_cases where id = p_case_id;
$$;

-- --- Notlar ---
-- Rehber: kendi okulunun notlarını görür; `yalnizca_yazan` işaretli olanlar
-- hariç (onları yalnızca yazan görür).
create policy case_notes_rehber on case_notes for select
  to authenticated
  using (
    rehberlik_personeli_mi()
    and school_id = auth_school_id()
    and (not yalnizca_yazan or yazan = auth.uid())
  );

-- Görünürlüğü genişletilmiş not, o rolü taşıyan ve ÖĞRENCİYİ GÖREBİLEN
-- kullanıcıya açılır. İki koşul da gerekli: yalnızca rol bakılsaydı bir
-- mentör, hiç tanımadığı bir öğrencinin notunu okurdu.
create policy case_notes_paylasilan on case_notes for select
  to authenticated
  using (
    not yalnizca_yazan
    and school_id = auth_school_id()
    and gorunurluk && auth_roles()
    and ogrenciyi_gorebilir(vakanin_ogrencisi(case_id))
  );

-- Not yalnızca rehber yazar ve kendi adına yazar.
create policy case_notes_yazar on case_notes for insert
  to authenticated
  with check (
    rehberlik_personeli_mi()
    and school_id = auth_school_id()
    and yazan = auth.uid()
  );

-- Not DÜZENLENEMEZ ve SİLİNEMEZ: görüşme kaydı sonradan değiştirilebiliyorsa
-- kayıt olmaktan çıkar. Düzeltme yeni bir notla yapılır.

-- --- Randevular ---
create policy appointments_rehber on appointments for all
  to authenticated
  using (rehberlik_personeli_mi() and school_id = auth_school_id())
  with check (rehberlik_personeli_mi() and school_id = auth_school_id());

-- Öğrenci ve velisi: kendi randevusunu görür.
create policy appointments_ilgili_okur on appointments for select
  to authenticated
  using (
    student_id = auth.uid()
    or exists (
      select 1 from parent_students ps
      where ps.student_id = appointments.student_id and ps.parent_user_id = auth.uid()
    )
  );

-- Öğrenci ve velisi TALEP açabilir; doğrudan planlayamaz.
create policy appointments_talep on appointments for insert
  to authenticated
  with check (
    durum = 'talep'
    and rehber_id is null
    and talep_eden = auth.uid()
    and (
      student_id = auth.uid()
      or exists (
        select 1 from parent_students ps
        where ps.student_id = appointments.student_id and ps.parent_user_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Yetkiler
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on counseling_cases to authenticated;
-- Not güncelleme/silme YOK: kayıt değiştirilemez.
grant select, insert on case_notes to authenticated;
grant select, insert, update on appointments to authenticated;

grant all on counseling_cases, case_notes, appointments to service_role;

revoke execute on function rehberlik_personeli_mi() from public, anon;
grant execute on function rehberlik_personeli_mi() to authenticated, service_role;
revoke execute on function vakanin_ogrencisi(uuid) from public, anon;
grant execute on function vakanin_ogrencisi(uuid) to authenticated, service_role;
