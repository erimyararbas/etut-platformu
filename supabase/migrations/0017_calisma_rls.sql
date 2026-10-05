-- =============================================================================
-- 0017 — Faz 2 tablolarının RLS'i ve yetkileri
--
-- Görünürlük için mevcut `ogrenciyi_gorebilir()` yardımcısı kullanılıyor
-- (0001): öğrencinin kendisi, velisi ve okulun personeli. Kuralı burada
-- yeniden yazmak, iki tanımın zamanla ayrışması demekti.
--
-- YAZMA HAKKI okumadan dar: çalışma kaydını yalnızca öğrencinin kendisi
-- girer. Öğretmen öğrencinin çözdüğü soru sayısını değiştirememeli — o veri
-- öğrencinin beyanı ve öyle kalmalı.
-- =============================================================================

set search_path = public, extensions;

alter table study_goals          enable row level security;
alter table study_sessions       enable row level security;
alter table unsolved_questions   enable row level security;
alter table question_answers     enable row level security;
alter table point_ledger         enable row level security;

-- ---------------------------------------------------------------------------
-- Hedefler
-- ---------------------------------------------------------------------------
create policy study_goals_gorunur on study_goals for select
  to authenticated using (ogrenciyi_gorebilir(student_id));

-- Öğrenci yalnızca KENDİNE hedef koyabilir ve atayan alanını dolduramaz;
-- doldurabilseydi öğretmen atamış gibi görünen bir hedef üretebilirdi.
create policy study_goals_ogrenci_yazar on study_goals for insert
  to authenticated with check (
    student_id = auth.uid() and assigned_by is null
  );

create policy study_goals_ogrenci_gunceller on study_goals for update
  to authenticated using (student_id = auth.uid() and assigned_by is null)
  with check (student_id = auth.uid() and assigned_by is null);

-- Personel kendi okulunun öğrencisine hedef atar; atayan kendisi olmak zorunda.
create policy study_goals_personel_yazar on study_goals for insert
  to authenticated with check (
    is_staff()
    and school_id = auth_school_id()
    and assigned_by = auth.uid()
    and exists (select 1 from students s where s.user_id = student_id and s.school_id = auth_school_id())
  );

create policy study_goals_personel_gunceller on study_goals for update
  to authenticated using (is_staff() and school_id = auth_school_id() and assigned_by = auth.uid())
  with check (is_staff() and school_id = auth_school_id() and assigned_by = auth.uid());

create policy study_goals_admin on study_goals for all
  to authenticated using (school_id = auth_school_id() and is_admin())
  with check (school_id = auth_school_id() and is_admin());

-- ---------------------------------------------------------------------------
-- Çalışma oturumları — okuma geniş, yazma yalnızca öğrencinin kendisi
-- ---------------------------------------------------------------------------
create policy study_sessions_gorunur on study_sessions for select
  to authenticated using (ogrenciyi_gorebilir(student_id));

create policy study_sessions_ogrenci_yazar on study_sessions for insert
  to authenticated with check (student_id = auth.uid());

create policy study_sessions_ogrenci_gunceller on study_sessions for update
  to authenticated using (student_id = auth.uid())
  with check (student_id = auth.uid());

create policy study_sessions_ogrenci_siler on study_sessions for delete
  to authenticated using (student_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Çözemediği sorular
--
-- Personel okulun tüm sorularını görür: soruyu yanıtlayabilmesi için önce
-- görmesi gerekiyor ve hangi öğretmenin yanıtlayacağı henüz kesin değil
-- (bkz. docs/faz2-sorular.md). Daraltmak sonradan tek politika değişikliği.
-- ---------------------------------------------------------------------------
create policy unsolved_questions_gorunur on unsolved_questions for select
  to authenticated using (ogrenciyi_gorebilir(student_id));

create policy unsolved_questions_ogrenci_yazar on unsolved_questions for insert
  to authenticated with check (student_id = auth.uid());

create policy unsolved_questions_ogrenci_gunceller on unsolved_questions for update
  to authenticated using (student_id = auth.uid())
  with check (student_id = auth.uid());

-- Yanıtlayan öğretmen soruyu 'yanitlandi' durumuna çekebilmeli.
create policy unsolved_questions_personel_gunceller on unsolved_questions for update
  to authenticated using (is_staff() and school_id = auth_school_id())
  with check (is_staff() and school_id = auth_school_id());

create policy question_answers_gorunur on question_answers for select
  to authenticated using (
    exists (
      select 1 from unsolved_questions q
      where q.id = question_id and ogrenciyi_gorebilir(q.student_id)
    )
  );

-- Yanıtı yalnızca öğretmenin kendisi yazar; başkasının adına yazılamaz.
create policy question_answers_ogretmen_yazar on question_answers for insert
  to authenticated with check (
    teacher_id = auth.uid()
    and school_id = auth_school_id()
    and has_role('ogretmen')
  );

create policy question_answers_ogretmen_gunceller on question_answers for update
  to authenticated using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Puan defteri — hiç kimse elle yazamaz
--
-- Puan yalnızca sunucu tarafından (tetikleyici veya servis bağlantısı)
-- üretilir. Öğrencinin kendine yıldız yazabilmesi puanı anlamsız kılardı.
-- ---------------------------------------------------------------------------
create policy point_ledger_gorunur on point_ledger for select
  to authenticated using (
    user_id = auth.uid()
    or (is_admin() and school_id = auth_school_id())
    or exists (
      select 1 from parent_students ps
      where ps.student_id = point_ledger.user_id and ps.parent_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Yetkiler (0005'teki ayrım: GRANT "tabloya dokunabilir misin", RLS "hangi satıra")
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on study_goals to authenticated;
grant select, insert, update, delete on study_sessions to authenticated;
grant select, insert, update on unsolved_questions to authenticated;
grant select, insert, update on question_answers to authenticated;
-- Puan defteri kullanıcı tarafından YAZILAMAZ; yalnızca okunur.
grant select on point_ledger to authenticated;

grant all on study_goals, study_sessions, unsolved_questions, question_answers,
  point_ledger to service_role;

-- ---------------------------------------------------------------------------
-- Her tablonun RLS'i açık mı? (0005'teki kontrolün aynısı, yeni tablolar için)
-- ---------------------------------------------------------------------------
do $$
declare
  korumasiz text;
begin
  select string_agg(c.relname, ', ') into korumasiz
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if korumasiz is not null then
    raise exception 'RLS açık olmayan tablo(lar) var: %', korumasiz;
  end if;
end;
$$;
