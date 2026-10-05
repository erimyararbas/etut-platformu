-- =============================================================================
-- 0015 — Katılım raporu
--
-- Rapor yedi tablodan birleşiyor (attendance, etuts, subjects, etut_types,
-- students, classes, users). Bunu PostgREST'in gömülü sorgularıyla kurmak
-- birkaç ayrı istek ve uygulama tarafında elle birleştirme demek; tek
-- fonksiyon hem daha hızlı hem de tutarlı bir anlık görüntü veriyor.
--
-- SECURITY INVOKER (varsayılan): RLS devrede kalır. Yönetici kendi okulunun
-- tamamını görür (attendance_admin, 0004); öğretmen çağırsa yalnızca kendi
-- etütlerinin satırlarını görür. Yani fonksiyon ayrıca yetki kontrolü
-- YAPMAZ ve yapmamalı — okul filtresini elle yazmak, bir gün unutulacak
-- bir kopya kural olurdu.
--
-- Değerlendirme (yıldız) LEFT JOIN: yoklaması alınmış ama değerlendirilmemiş
-- öğrenci rapordan düşmemeli.
-- =============================================================================

create or replace function katilim_raporu(p_baslangic date, p_bitis date)
returns table (
  okul_no     text,
  ad          text,
  soyad       text,
  sinif       text,
  tarih       date,
  baslangic   time,
  bitis       time,
  ders        text,
  tur         text,
  ogretmen    text,
  derslik     text,
  durum       text,
  yildiz      smallint,
  yorum       text
)
language sql
stable
set search_path = public
as $$
  select
    st.okul_no,
    ou.ad,
    ou.soyad,
    c.kod,
    e.tarih,
    e.baslangic,
    e.bitis,
    s.ad,
    t.ad,
    tu.ad || ' ' || tu.soyad,
    r.kod,
    a.durum::text,
    ev.yildiz,
    ev.yorum
  from attendance a
  join etuts e        on e.id = a.etut_id
  join students st    on st.user_id = a.student_id
  join users ou       on ou.id = a.student_id
  left join classes c on c.id = st.class_id
  left join subjects s on s.id = e.subject_id
  left join etut_types t on t.id = e.etut_type_id
  left join rooms r   on r.id = e.room_id
  left join users tu  on tu.id = e.teacher_id
  left join evaluations ev on ev.etut_id = a.etut_id and ev.student_id = a.student_id
  where e.tarih between p_baslangic and p_bitis
  order by ou.soyad, ou.ad, e.tarih, e.baslangic;
$$;

comment on function katilim_raporu(date, date) is
  'Tarih aralığındaki yoklama satırları. SECURITY INVOKER: RLS kimin neyi göreceğine karar verir.';

-- 0010''daki olay tetikleyicisi PUBLIC/anon yetkisini zaten kaldırır; niyeti
-- açık bırakmak için burada da yazılı.
revoke execute on function katilim_raporu(date, date) from public, anon;
grant execute on function katilim_raporu(date, date) to authenticated, service_role;
