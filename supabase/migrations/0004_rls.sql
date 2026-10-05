-- =============================================================================
-- 0004 — Satır seviyesi güvenlik (RLS)
--
-- Temel kural: HİÇBİR rol kendi okulunun dışındaki bir satıra erişemez.
-- Okul içinde ise:
--   öğrenci → yalnız kendi kayıtları + sınıfına açık onaylı etütler
--   veli    → yalnız bağlı olduğu öğrencilerin kayıtları
--   öğretmen→ kendi etütleri ve o etütlerdeki öğrenciler
--   admin   → kendi okulunun tamamı
--
-- Yazma işlemlerinin bir kısmı (rezervasyon, iptal talebi) bilerek RLS'e değil,
-- SECURITY DEFINER fonksiyonlara bırakılmıştır; böylece kontenjan ve sıra
-- mantığı atlanamaz.
-- =============================================================================

-- ÖNEMLİ — politikalar arası özyineleme:
-- Bir tablonun politikası başka bir RLS'li tabloyu doğrudan sorgularsa, o tablonun
-- politikası da geri dönüp ilkini sorgular ve Postgres "infinite recursion detected
-- in policy" hatası verir. Üstelik politikalar OR'landığı için, veli politikası
-- ÖĞRENCİ sorgularında da değerlendirilir; yani döngü herkesi etkiler.
-- Bu yüzden politikalardaki tüm çapraz tablo kontrolleri, RLS'i atlayan
-- SECURITY DEFINER fonksiyonların arkasına alınmıştır.

-- Öğrencinin sınıfına açık, onaylı bir etüt mü?
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
  );
$$;

-- Etüdün sahibi öğretmen miyim?
create or replace function etut_ogretmeni_mi(p_etut_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from etuts e where e.id = p_etut_id and e.teacher_id = auth.uid());
$$;

-- Etüt benim okulumda mı?
create or replace function etut_okulumda_mi(p_etut_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from etuts e where e.id = p_etut_id and e.school_id = auth_school_id());
$$;

-- Etüdü düzenleyebilir miyim? (sahibi öğretmen veya okul yöneticisi)
create or replace function etut_duzenleyebilir(p_etut_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from etuts e
    where e.id = p_etut_id
      and e.school_id = auth_school_id()
      and (is_admin() or e.teacher_id = auth.uid())
  );
$$;

-- Çocuğumun kayıtlı olduğu bir etüt mü?
create or replace function veli_etudu_gorebilir(p_etut_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from reservations r
    join parent_students ps on ps.student_id = r.student_id
    where r.etut_id = p_etut_id
      and ps.parent_user_id = auth.uid()
      and r.durum <> 'iptal'
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS'i aç
-- ---------------------------------------------------------------------------
alter table schools               enable row level security;
alter table school_settings       enable row level security;
alter table academic_years        enable row level security;
alter table terms                 enable row level security;
alter table users                 enable row level security;
alter table user_roles            enable row level security;
alter table grade_levels          enable row level security;
alter table classes               enable row level security;
alter table subjects              enable row level security;
alter table topics                enable row level security;
alter table rooms                 enable row level security;
alter table etut_types            enable row level security;
alter table teachers              enable row level security;
alter table students              enable row level security;
alter table parent_students       enable row level security;
alter table etut_recurrences      enable row level security;
alter table etuts                 enable row level security;
alter table etut_eligible_classes enable row level security;
alter table reservations          enable row level security;
alter table attendance            enable row level security;
alter table evaluations           enable row level security;
alter table notifications         enable row level security;
alter table notification_outbox   enable row level security;
alter table import_batches        enable row level security;
alter table import_rows           enable row level security;
alter table audit_logs            enable row level security;

-- ---------------------------------------------------------------------------
-- Kiracı
-- ---------------------------------------------------------------------------
create policy schools_uye_okur on schools for select
  to authenticated using (id = auth_school_id());

-- Giriş sayfası okulu tanıyabilsin diye yalnızca marka bilgisi herkese açık.
create view v_okullar_acik
  with (security_invoker = off) as
  select id, slug, ad, logo_url, tema from schools where durum = 'aktif';

grant select on v_okullar_acik to anon, authenticated;

create policy school_settings_uye_okur on school_settings for select
  to authenticated using (school_id = auth_school_id());
create policy school_settings_admin_yazar on school_settings for update
  to authenticated using (school_id = auth_school_id() and is_admin())
  with check (school_id = auth_school_id() and is_admin());

create policy academic_years_uye_okur on academic_years for select
  to authenticated using (school_id = auth_school_id());
create policy academic_years_admin_yazar on academic_years for all
  to authenticated using (school_id = auth_school_id() and is_admin())
  with check (school_id = auth_school_id() and is_admin());

create policy terms_uye_okur on terms for select
  to authenticated using (school_id = auth_school_id());
create policy terms_admin_yazar on terms for all
  to authenticated using (school_id = auth_school_id() and is_admin())
  with check (school_id = auth_school_id() and is_admin());

-- ---------------------------------------------------------------------------
-- Kullanıcılar
--
-- Kişisel iletişim bilgisi (telefon/e-posta) yalnızca kişinin kendisine ve
-- yöneticiye görünür. Diğer roller adları aşağıdaki dar görünümlerden okur.
-- ---------------------------------------------------------------------------
create policy users_kendisi_okur on users for select
  to authenticated using (id = auth.uid());
create policy users_admin_okur on users for select
  to authenticated using (school_id = auth_school_id() and is_admin());
create policy users_kendisi_gunceller on users for update
  to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy users_admin_yazar on users for all
  to authenticated using (school_id = auth_school_id() and is_admin())
  with check (school_id = auth_school_id() and is_admin());

create policy user_roles_kendisi_okur on user_roles for select
  to authenticated using (user_id = auth.uid());
create policy user_roles_admin_yazar on user_roles for all
  to authenticated using (school_id = auth_school_id() and is_admin())
  with check (school_id = auth_school_id() and is_admin());

-- Ad/soyad dizinleri: yalnızca gerekli sütunlar.
create view v_ogretmen_dizini
  with (security_invoker = off) as
  select u.id, u.school_id, u.ad, u.soyad, s.ad as brans, t.mentor_mu
  from users u
  join teachers t on t.user_id = u.id
  join subjects s on s.id = t.brans_subject_id
  where u.durum = 'aktif' and u.school_id = auth_school_id();

grant select on v_ogretmen_dizini to authenticated;

create view v_ogrenci_dizini
  with (security_invoker = off) as
  select u.id, u.school_id, u.ad, u.soyad, st.okul_no, c.kod as sinif_kodu, st.class_id
  from users u
  join students st on st.user_id = u.id
  left join classes c on c.id = st.class_id
  where u.durum = 'aktif'
    and u.school_id = auth_school_id()
    and is_staff();

grant select on v_ogrenci_dizini to authenticated;

-- ---------------------------------------------------------------------------
-- Akademik yapı — okul üyeleri okur, yönetici yazar
-- ---------------------------------------------------------------------------
create policy grade_levels_okur on grade_levels for select
  to authenticated using (school_id = auth_school_id());
create policy grade_levels_admin on grade_levels for all
  to authenticated using (school_id = auth_school_id() and is_admin())
  with check (school_id = auth_school_id() and is_admin());

create policy classes_okur on classes for select
  to authenticated using (school_id = auth_school_id());
create policy classes_admin on classes for all
  to authenticated using (school_id = auth_school_id() and is_admin())
  with check (school_id = auth_school_id() and is_admin());

create policy subjects_okur on subjects for select
  to authenticated using (school_id = auth_school_id());
create policy subjects_admin on subjects for all
  to authenticated using (school_id = auth_school_id() and is_admin())
  with check (school_id = auth_school_id() and is_admin());

create policy topics_okur on topics for select
  to authenticated using (school_id = auth_school_id());
create policy topics_admin on topics for all
  to authenticated using (school_id = auth_school_id() and is_admin())
  with check (school_id = auth_school_id() and is_admin());

create policy rooms_okur on rooms for select
  to authenticated using (school_id = auth_school_id());
create policy rooms_admin on rooms for all
  to authenticated using (school_id = auth_school_id() and is_admin())
  with check (school_id = auth_school_id() and is_admin());

create policy etut_types_okur on etut_types for select
  to authenticated using (school_id = auth_school_id());
create policy etut_types_admin on etut_types for all
  to authenticated using (school_id = auth_school_id() and is_admin())
  with check (school_id = auth_school_id() and is_admin());

-- ---------------------------------------------------------------------------
-- Rol profilleri
-- ---------------------------------------------------------------------------
create policy teachers_okur on teachers for select
  to authenticated using (school_id = auth_school_id());
create policy teachers_admin on teachers for all
  to authenticated using (school_id = auth_school_id() and is_admin())
  with check (school_id = auth_school_id() and is_admin());

create policy students_gorunur on students for select
  to authenticated using (ogrenciyi_gorebilir(user_id));
create policy students_admin on students for all
  to authenticated using (school_id = auth_school_id() and is_admin())
  with check (school_id = auth_school_id() and is_admin());

create policy parent_students_gorunur on parent_students for select
  to authenticated using (
    parent_user_id = auth.uid()
    or (school_id = auth_school_id() and is_staff())
  );
create policy parent_students_admin on parent_students for all
  to authenticated using (school_id = auth_school_id() and is_admin())
  with check (school_id = auth_school_id() and is_admin());

-- ---------------------------------------------------------------------------
-- Etütler
-- ---------------------------------------------------------------------------
create policy etuts_personel_okur on etuts for select
  to authenticated using (school_id = auth_school_id() and is_staff());

create policy etuts_ogrenci_okur on etuts for select
  to authenticated using (
    school_id = auth_school_id()
    and durum = 'onaylandi'
    and etut_ogrenciye_acik(id)
  );

create policy etuts_veli_okur on etuts for select
  to authenticated using (
    school_id = auth_school_id()
    and has_role('veli')
    and veli_etudu_gorebilir(id)
  );

create policy etuts_ogretmen_olusturur on etuts for insert
  to authenticated with check (
    school_id = auth_school_id()
    and has_role('ogretmen')
    and teacher_id = auth.uid()
  );

create policy etuts_ogretmen_gunceller on etuts for update
  to authenticated using (school_id = auth_school_id() and teacher_id = auth.uid())
  with check (school_id = auth_school_id() and teacher_id = auth.uid());

create policy etuts_admin on etuts for all
  to authenticated using (school_id = auth_school_id() and is_admin())
  with check (school_id = auth_school_id() and is_admin());

create policy etut_recurrences_personel on etut_recurrences for all
  to authenticated using (school_id = auth_school_id() and is_staff())
  with check (school_id = auth_school_id() and is_staff());

create policy etut_eligible_classes_okur on etut_eligible_classes for select
  to authenticated using (etut_okulumda_mi(etut_id));

create policy etut_eligible_classes_yazar on etut_eligible_classes for all
  to authenticated using (etut_duzenleyebilir(etut_id))
  with check (etut_duzenleyebilir(etut_id));

-- ---------------------------------------------------------------------------
-- Rezervasyonlar
--
-- Yazma işlemi yok: rezervasyon/iptal yalnızca SECURITY DEFINER fonksiyonlarla
-- yapılır, böylece kontenjan ve sıra mantığı atlanamaz.
-- ---------------------------------------------------------------------------
create policy reservations_okur on reservations for select
  to authenticated using (
    ogrenciyi_gorebilir(student_id) or etut_ogretmeni_mi(etut_id)
  );

create policy reservations_admin on reservations for all
  to authenticated using (school_id = auth_school_id() and is_admin())
  with check (school_id = auth_school_id() and is_admin());

-- ---------------------------------------------------------------------------
-- Yoklama ve değerlendirme
-- ---------------------------------------------------------------------------
create policy attendance_okur on attendance for select
  to authenticated using (
    ogrenciyi_gorebilir(student_id) or etut_ogretmeni_mi(etut_id)
  );

create policy attendance_ogretmen_yazar on attendance for all
  to authenticated using (etut_ogretmeni_mi(etut_id))
  with check (etut_ogretmeni_mi(etut_id));

create policy attendance_admin on attendance for all
  to authenticated using (school_id = auth_school_id() and is_admin())
  with check (school_id = auth_school_id() and is_admin());

create policy evaluations_okur on evaluations for select
  to authenticated using (
    ogrenciyi_gorebilir(student_id) or etut_ogretmeni_mi(etut_id)
  );

create policy evaluations_ogretmen_yazar on evaluations for all
  to authenticated using (etut_ogretmeni_mi(etut_id))
  with check (etut_ogretmeni_mi(etut_id) and teacher_id = auth.uid());

create policy evaluations_admin on evaluations for select
  to authenticated using (school_id = auth_school_id() and is_admin());

-- Yoklama zaman kilidi. Yönetici düzeltebilir; düzeltme audit_logs'a yazılır.
-- Servis anahtarıyla (auth.uid() null) yapılan tohumlama/aktarım işleri muaftır.
create or replace function yoklama_kilit_kontrolu() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not is_admin() and not yoklama_alinabilir(new.etut_id) then
    raise exception 'Yoklama süresi doldu. Düzeltme için yönetime başvurun.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger attendance_kilit before insert or update on attendance
  for each row execute function yoklama_kilit_kontrolu();

-- ---------------------------------------------------------------------------
-- Bildirimler — herkes yalnızca kendi bildirimini görür
-- ---------------------------------------------------------------------------
create policy notifications_kendisi on notifications for select
  to authenticated using (user_id = auth.uid());
create policy notifications_kendisi_okudu on notifications for update
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notification_outbox_admin on notification_outbox for select
  to authenticated using (school_id = auth_school_id() and is_admin());

-- ---------------------------------------------------------------------------
-- İçe aktarım ve denetim kaydı — yalnızca yönetici
-- ---------------------------------------------------------------------------
create policy import_batches_admin on import_batches for select
  to authenticated using (school_id = auth_school_id() and is_admin());

create policy import_rows_admin on import_rows for select
  to authenticated using (
    exists (
      select 1 from import_batches b
      where b.id = batch_id and b.school_id = auth_school_id() and is_admin()
    )
  );

create policy audit_logs_admin on audit_logs for select
  to authenticated using (school_id = auth_school_id() and is_admin());
