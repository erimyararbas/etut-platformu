-- =============================================================================
-- 0027 — Deneme sınavları
--
-- Rehber deneme sonuçlarını girer; öğrenci, velisi ve okul personeli okur.
--
-- BU VERİ REHBERLİK VERİSİ DEĞİLDİR. 0023'ün "yönetici bile göremez" kuralı
-- buraya UZANMAZ: deneme neti akademik bir ölçüdür, görüşme kaydı değil.
-- Bu yüzden okuma `ogrenciyi_gorebilir()` ile — yani öğrencinin kendisi,
-- velisi ve okulun personeli. Yazma dar: rehber ve yönetici.
--
-- NET SAKLANMIYOR. `net_hesapla(dogru, yanlis)` (0016) ile hesaplanıyor.
-- Formülün ikinci bir kopyası çıkarsa çalışma takibindeki net ile deneme
-- netinin ayrışması an meselesidir; okul da hangisinin doğru olduğunu
-- soramaz hâle gelir.
--
-- `student_id` ders kırılımı tablosunda da TEKRARLANIYOR. Normalde sonuç
-- satırından türetilebilirdi ama o zaman RLS politikası `mock_exam_results`
-- üzerinde bir alt sorgu yapmak zorunda kalırdı — ve politikaların içindeki
-- alt sorgular da RLS'e tabidir (0023'te tam bu tuzağa düşülmüştü). Kolonu
-- tekrarlamak, bir SECURITY DEFINER yardımcısı yazmaktan ucuz.
-- =============================================================================

set search_path = public, extensions;

create table mock_exams (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  ad         text not null,
  tarih      date not null,
  -- "TYT" / "AYT" / "LGS" / okulun kendi adlandırması. Enum DEĞİL: sınav
  -- türleri okuldan okula ve yıldan yıla değişiyor, enum genişletmek
  -- migration gerektirirdi.
  tur        text,
  olusturan  uuid not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (school_id, ad, tarih)
);

create index mock_exams_okul_idx on mock_exams (school_id, tarih desc);

create table mock_exam_results (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  exam_id    uuid not null references mock_exams(id) on delete cascade,
  student_id uuid not null references students(user_id) on delete cascade,
  -- Kurum dışı deneme sağlayıcısının verdiği puan ve sıralama; okul bunları
  -- girmeyebilir, o yüzden ikisi de boş kalabilir.
  puan       numeric(6,2),
  siralama   integer check (siralama is null or siralama > 0),
  not_metni  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_id, student_id)
);

create index mock_exam_results_ogrenci_idx on mock_exam_results (student_id);

create table mock_exam_subject_results (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  result_id  uuid not null references mock_exam_results(id) on delete cascade,
  -- Bkz. başlık: RLS alt sorgusundan kaçınmak için tekrarlanıyor.
  student_id uuid not null references students(user_id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  dogru      integer not null default 0 check (dogru >= 0),
  yanlis     integer not null default 0 check (yanlis >= 0),
  bos        integer not null default 0 check (bos >= 0),
  unique (result_id, subject_id)
);

create index mock_exam_subject_results_ogrenci_idx on mock_exam_subject_results (student_id);

create trigger mock_exam_results_updated_at
  before update on mock_exam_results
  for each row execute function set_updated_at();

-- =============================================================================
-- RLS
-- =============================================================================
alter table mock_exams                enable row level security;
alter table mock_exam_results         enable row level security;
alter table mock_exam_subject_results enable row level security;

/**
 * Deneme girebilen: rehberlik servisi ve yönetici.
 *
 * Öğretmen giremiyor — deneme sonuçları tek elden girilmezse aynı sınav iki
 * kez, farklı adlarla açılır ve karşılaştırma imkânsız hâle gelir.
 */
create or replace function deneme_yazabilir() returns boolean
language sql stable set search_path = public as $$
  select has_role('rehber') or is_admin();
$$;

-- --- Sınavın kendisi: okulun tamamı okur ---
create policy mock_exams_okur on mock_exams for select
  to authenticated using (school_id = auth_school_id());

create policy mock_exams_yazar on mock_exams for all
  to authenticated
  using (school_id = auth_school_id() and deneme_yazabilir())
  with check (school_id = auth_school_id() and deneme_yazabilir());

-- --- Sonuçlar: öğrenciyi görebilen okur ---
create policy mock_exam_results_okur on mock_exam_results for select
  to authenticated using (ogrenciyi_gorebilir(student_id));

create policy mock_exam_results_yazar on mock_exam_results for all
  to authenticated
  using (school_id = auth_school_id() and deneme_yazabilir())
  with check (school_id = auth_school_id() and deneme_yazabilir());

create policy mock_exam_subject_results_okur on mock_exam_subject_results for select
  to authenticated using (ogrenciyi_gorebilir(student_id));

create policy mock_exam_subject_results_yazar on mock_exam_subject_results for all
  to authenticated
  using (school_id = auth_school_id() and deneme_yazabilir())
  with check (school_id = auth_school_id() and deneme_yazabilir());

grant select, insert, update, delete on mock_exams                to authenticated;
grant select, insert, update, delete on mock_exam_results         to authenticated;
grant select, insert, update, delete on mock_exam_subject_results to authenticated;
grant all on mock_exams, mock_exam_results, mock_exam_subject_results to service_role;

-- =============================================================================
-- Okuma yardımcıları
-- =============================================================================

/**
 * Bir öğrencinin deneme geçmişi — sınav × ders kırılımında.
 *
 * Toplamı burada DEĞİL uygulamada topluyoruz: ders kırılımı hem tabloda hem
 * grafikte gerekiyor, iki ayrı sorgu atmak yerine tek sorgudan türetmek daha
 * ucuz. `ogrenci_calisma_dokumu` (0025) ile aynı kalıp.
 *
 * SECURITY INVOKER: görünürlüğe yukarıdaki RLS karar verir, burada ikinci bir
 * yetki kuralı yazılmıyor.
 */
create or replace function ogrenci_deneme_gecmisi(p_student_id uuid)
returns table (
  exam_id    uuid,
  ad         text,
  tarih      date,
  tur        text,
  puan       numeric,
  siralama   integer,
  ders       text,
  subject_id uuid,
  dogru      integer,
  yanlis     integer,
  bos        integer,
  net        numeric
)
language sql
stable
set search_path = public
as $$
  select
    e.id, e.ad, e.tarih, e.tur,
    r.puan, r.siralama,
    s.ad, s.id,
    d.dogru, d.yanlis, d.bos,
    net_hesapla(d.dogru, d.yanlis)
  from mock_exam_results r
  join mock_exams e on e.id = r.exam_id
  join mock_exam_subject_results d on d.result_id = r.id
  join subjects s on s.id = d.subject_id
  where r.student_id = p_student_id
  order by e.tarih desc, s.ad;
$$;

comment on function ogrenci_deneme_gecmisi(uuid) is
  'Öğrencinin deneme sonuçları, sınav × ders kırılımında. SECURITY INVOKER: görünürlüğe RLS karar verir.';

/**
 * Bir denemenin tüm sonuçları — rehberin sınav ekranı için.
 *
 * SECURITY INVOKER olduğu için öğrenci bu fonksiyonu çağırsa yalnızca kendi
 * satırını görür; yetki kontrolü tekrarlanmıyor.
 *
 * AD ÇÖZÜMÜ `v_ogrenci_dizini` ÜZERİNDEN: `users` ve `students` tablolarına
 * doğrudan join atılamaz, çünkü rehberin o tablolarda okuma hakkı yok ve
 * SECURITY INVOKER fonksiyonun içindeki join de RLS'e tabi — sonuç sessizce
 * BOŞ dönerdi. Dizin görünümü tam bu iş için var (0004).
 */
create or replace function deneme_sonuclari(p_exam_id uuid)
returns table (
  student_id  uuid,
  ad          text,
  soyad       text,
  okul_no     text,
  sinif_kodu  text,
  puan        numeric,
  siralama    integer,
  toplam_net  numeric,
  ders_sayisi bigint
)
language sql
stable
set search_path = public
as $$
  select
    r.student_id,
    o.ad,
    o.soyad,
    o.okul_no,
    o.sinif_kodu,
    r.puan,
    r.siralama,
    coalesce(sum(net_hesapla(d.dogru, d.yanlis)), 0),
    count(d.id)
  from mock_exam_results r
  join v_ogrenci_dizini o on o.id = r.student_id
  left join mock_exam_subject_results d on d.result_id = r.id
  where r.exam_id = p_exam_id
  group by r.student_id, o.ad, o.soyad, o.okul_no, o.sinif_kodu, r.puan, r.siralama
  order by 8 desc;
$$;

comment on function deneme_sonuclari(uuid) is
  'Bir denemenin öğrenci bazında sonuçları, toplam nete göre sıralı.';

revoke execute on function deneme_yazabilir()            from public, anon;
revoke execute on function ogrenci_deneme_gecmisi(uuid)  from public, anon;
revoke execute on function deneme_sonuclari(uuid)        from public, anon;
grant execute on function deneme_yazabilir()             to authenticated, service_role;
grant execute on function ogrenci_deneme_gecmisi(uuid)   to authenticated, service_role;
grant execute on function deneme_sonuclari(uuid)         to authenticated, service_role;
