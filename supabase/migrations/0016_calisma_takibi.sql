-- =============================================================================
-- 0016 — Faz 2: çalışma takibi
--
-- Kapsam: hedefler, çalışma oturumları (soru sayacı), çözülemeyen sorular ve
-- puan defteri. Medya yolları alan olarak burada; Storage kovası ayrı
-- migration'da (yükleme arayüzü yazılınca).
--
-- İLERLEME NEDEN AYRI TABLODA DEĞİL: planda `goal_progress` vardı. Onun yerine
-- ilerleme `study_sessions` satırlarından toplanıyor. Ayrı bir sayaç tutmak iki
-- kayıt yeri demek ve ikisi er geç birbirinden ayrışır — öğrenci bir oturumu
-- düzeltince sayacın da düzeltilmesi gerekirdi. Tek kaynak: oturumlar.
-- =============================================================================

set search_path = public, extensions;

create type hedef_durumu as enum ('aktif', 'tamamlandi', 'iptal');
create type soru_durumu as enum ('bekliyor', 'yanitlandi', 'kapandi');
create type puan_turu as enum ('yildiz', 'elmas');

-- ---------------------------------------------------------------------------
-- Net hesabı
--
-- Formül TEK YERDE. Prototipte "Net = D − Y/4" yazıyor (YKS kuralı). Okul
-- bazında değişmesi gerekirse burası değişir, çağıran hiçbir yer değişmez.
-- ---------------------------------------------------------------------------
create or replace function net_hesapla(p_dogru int, p_yanlis int)
returns numeric
language sql immutable
as $$
  select round(coalesce(p_dogru, 0) - coalesce(p_yanlis, 0) / 4.0, 2);
$$;

comment on function net_hesapla(int, int) is
  'Net = D − Y/4. Formülün tek tanımı; değişmesi gerekirse yalnızca burası.';

-- ---------------------------------------------------------------------------
-- Hedefler
-- ---------------------------------------------------------------------------
create table study_goals (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id) on delete cascade,
  student_id    uuid not null references students(user_id) on delete cascade,
  -- Boşsa öğrencinin kendine koyduğu hedef; doluysa atayan öğretmen.
  assigned_by   uuid references users(id) on delete set null,
  subject_id    uuid references subjects(id) on delete set null,
  topic_id      uuid references topics(id) on delete set null,
  baslik        text not null,
  hedef_soru    int not null check (hedef_soru > 0),
  son_tarih     date,
  durum         hedef_durumu not null default 'aktif',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index study_goals_ogrenci_idx on study_goals (student_id, durum);
create index study_goals_atayan_idx on study_goals (assigned_by) where assigned_by is not null;

-- ---------------------------------------------------------------------------
-- Çalışma oturumları — soru sayacı ve serbest çalışma
--
-- `goal_id` boş olabilir: öğrenci hedefe bağlı olmayan serbest çalışma da
-- kaydedebiliyor ("Kendi Çalışmalarım").
-- ---------------------------------------------------------------------------
create table study_sessions (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references schools(id) on delete cascade,
  student_id     uuid not null references students(user_id) on delete cascade,
  goal_id        uuid references study_goals(id) on delete set null,
  subject_id     uuid references subjects(id) on delete set null,
  topic_id       uuid references topics(id) on delete set null,
  dogru          int not null default 0 check (dogru >= 0),
  yanlis         int not null default 0 check (yanlis >= 0),
  bos            int not null default 0 check (bos >= 0),
  -- Sayaç açık kaldıysa bitis boş; süre bitişte hesaplanır.
  basladi_at     timestamptz not null default now(),
  bitti_at       timestamptz,
  sure_saniye    int check (sure_saniye is null or sure_saniye >= 0),
  -- Okulun saat dilimindeki çalışma günü: seri ve haftalık toplamlar buna göre.
  calisma_gunu   date not null,
  not_metni      text,
  created_at     timestamptz not null default now(),
  check (bitti_at is null or bitti_at >= basladi_at)
);

create index study_sessions_ogrenci_gun_idx on study_sessions (student_id, calisma_gunu desc);
create index study_sessions_hedef_idx on study_sessions (goal_id) where goal_id is not null;
-- Öğrenci başına aynı anda en fazla bir açık sayaç.
create unique index study_sessions_tek_acik_idx
  on study_sessions (student_id) where bitti_at is null;

comment on index study_sessions_tek_acik_idx is
  'Aynı anda iki sayaç açık olamaz; ikinci "başlat" veritabanında reddedilir.';

-- ---------------------------------------------------------------------------
-- Çözemediği sorular
-- ---------------------------------------------------------------------------
create table unsolved_questions (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id) on delete cascade,
  student_id    uuid not null references students(user_id) on delete cascade,
  subject_id    uuid references subjects(id) on delete set null,
  topic_id      uuid references topics(id) on delete set null,
  -- Öğrenci belirli bir öğretmene sorabilir; boşsa dersin öğretmenlerine açık.
  hedef_ogretmen_id uuid references teachers(user_id) on delete set null,
  metin         text not null,
  gorsel_yolu   text,
  durum         soru_durumu not null default 'bekliyor',
  created_at    timestamptz not null default now()
);

create index unsolved_questions_ogrenci_idx on unsolved_questions (student_id, created_at desc);
create index unsolved_questions_bekleyen_idx
  on unsolved_questions (school_id, subject_id) where durum = 'bekliyor';

create table question_answers (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id) on delete cascade,
  question_id   uuid not null references unsolved_questions(id) on delete cascade,
  teacher_id    uuid not null references teachers(user_id) on delete restrict,
  metin         text not null,
  gorsel_yolu   text,
  created_at    timestamptz not null default now()
);

create index question_answers_soru_idx on question_answers (question_id, created_at);

-- ---------------------------------------------------------------------------
-- Puan defteri
--
-- Toplam bir kolonda TUTULMUYOR, hareketlerden toplanıyor. Böylece "bu yıldız
-- nereden geldi" sorusunun cevabı her zaman kayıtta duruyor ve bir hata
-- düzeltilirken toplamı elle düzeltme ihtiyacı doğmuyor.
-- ---------------------------------------------------------------------------
create table point_ledger (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  tur         puan_turu not null,
  miktar      int not null check (miktar <> 0),
  -- 'degerlendirme', 'hedef_tamamlandi', 'seri' ...
  kaynak      text not null,
  kaynak_id   uuid,
  aciklama    text,
  created_at  timestamptz not null default now()
);

create index point_ledger_kullanici_idx on point_ledger (user_id, created_at desc);
-- Aynı kaynaktan iki kez puan yazılmasın (ör. değerlendirme düzeltilirse).
create unique index point_ledger_kaynak_idx
  on point_ledger (user_id, tur, kaynak, kaynak_id) where kaynak_id is not null;
