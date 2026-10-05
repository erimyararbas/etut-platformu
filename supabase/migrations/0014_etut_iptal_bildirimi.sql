-- =============================================================================
-- 0014 — Etüt iptalinde kayıtlı öğrencilere haber verilsin
--
-- 0009'daki `bildirim_etut_durumu` yalnızca 'onaylandi' ve 'reddedildi'
-- durumlarını, o da yalnızca ÖĞRETMENE bildiriyordu. Bir etüt iptal edildiğinde
-- kayıtlı öğrenciler hiçbir şey görmüyor; çarşamba 16:00'da boş sınıfa gidiyorlar.
--
-- İptal, red'den farklıdır: red onaylanmamış bir teklifi geri çevirmektir ve
-- kimse kayıtlı değildir. İptal ise YAYINDAKİ bir etüdü kaldırır — kayıtlı
-- öğrenci, bekleme listesindeki öğrenci ve velileri vardır.
-- =============================================================================

create or replace function bildirim_etut_durumu() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_etiket  text;
  v_alicilar uuid[];
begin
  if old.durum = new.durum then
    return new;
  end if;

  v_etiket := etut_etiketi(new.id);

  if new.durum = 'onaylandi' then
    perform bildirim_gonder(new.school_id, array[new.teacher_id], 'etut_onaylandi',
      'Etüdün onaylandı',
      v_etiket || ' etüdün onaylandı ve öğrencilere açıldı.',
      jsonb_build_object('etut_id', new.id));

  elsif new.durum = 'reddedildi' then
    perform bildirim_gonder(new.school_id, array[new.teacher_id], 'etut_reddedildi',
      'Etüdün reddedildi',
      v_etiket || ' etüdün reddedildi. Gerekçe: ' || coalesce(new.red_nedeni, 'belirtilmedi'),
      jsonb_build_object('etut_id', new.id));

  elsif new.durum = 'iptal' then
    -- Öğretmen
    perform bildirim_gonder(new.school_id, array[new.teacher_id], 'etut_iptal',
      'Etüdün iptal edildi',
      v_etiket || ' etüdün iptal edildi. Gerekçe: ' || coalesce(new.red_nedeni, 'belirtilmedi'),
      jsonb_build_object('etut_id', new.id));

    -- Kayıtlı ve sırada bekleyen öğrenciler ile velileri. Bekleme listesindeki
    -- öğrenci de bildirilmeli: onun için de artık açılacak bir yer yok.
    select coalesce(array_agg(distinct k), '{}'::uuid[]) into v_alicilar
    from (
      select r.student_id as k
      from reservations r
      where r.etut_id = new.id and r.durum in ('rezerve', 'atandi', 'beklemede')
      union
      select unnest(ogrencinin_velileri(r.student_id))
      from reservations r
      where r.etut_id = new.id and r.durum in ('rezerve', 'atandi', 'beklemede')
    ) t;

    perform bildirim_gonder(new.school_id, v_alicilar, 'etut_iptal',
      'Etüt iptal edildi',
      v_etiket || ' etüdü iptal edildi. Gerekçe: ' ||
        coalesce(new.red_nedeni, 'belirtilmedi'),
      jsonb_build_object('etut_id', new.id));
  end if;

  return new;
end;
$$;

-- 0010'daki olay tetikleyicisi PUBLIC/anon yetkisini kendiliğinden kaldırır.
