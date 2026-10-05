-- =============================================================================
-- 0003 — Sistem tabloları: bildirim, içe aktarım, denetim kaydı
-- =============================================================================

create type bildirim_kanali as enum ('inapp', 'sms', 'eposta');
create type gonderim_durumu as enum ('bekliyor', 'gonderildi', 'basarisiz', 'iptal');
create type import_durumu as enum ('onizleme', 'uygulandi', 'iptal', 'hata');
create type satir_islemi as enum ('ekle', 'guncelle', 'atla', 'hata');

-- ---------------------------------------------------------------------------
-- Bildirimler
--
-- Uygulama içi bildirim tek kayıt; dışarı çıkan her kanal (SMS, e-posta) için
-- outbox'a ayrı satır düşer. SMS sağlayıcısı devreye alındığında yalnızca
-- outbox'ı tüketen işçi yazılır; uygulama kodu değişmez.
-- ---------------------------------------------------------------------------
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  tip         text not null,          -- 'rezervasyon_onaylandi', 'siradan_gecis', ...
  baslik      text not null,
  govde       text not null,
  data        jsonb not null default '{}'::jsonb,
  okundu_at   timestamptz,
  created_at  timestamptz not null default now()
);

create index notifications_user_idx on notifications (user_id, created_at desc);
create index notifications_okunmamis_idx on notifications (user_id) where okundu_at is null;

create table notification_outbox (
  id               uuid primary key default gen_random_uuid(),
  notification_id  uuid not null references notifications(id) on delete cascade,
  school_id        uuid not null references schools(id) on delete cascade,
  kanal            bildirim_kanali not null,
  hedef            text not null,     -- telefon veya e-posta
  durum            gonderim_durumu not null default 'bekliyor',
  deneme_sayisi    smallint not null default 0,
  saglayici_ref    text,
  hata             text,
  gonderim_at      timestamptz,
  created_at       timestamptz not null default now()
);

create index notification_outbox_kuyruk_idx on notification_outbox (durum, created_at)
  where durum = 'bekliyor';

-- ---------------------------------------------------------------------------
-- Excel içe aktarım
-- ---------------------------------------------------------------------------
create table import_batches (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools(id) on delete cascade,
  sablon_tipi  text not null,         -- templates.ts içindeki TemplateId
  dosya_adi    text not null,
  yukleyen     uuid not null references users(id) on delete restrict,
  durum        import_durumu not null default 'onizleme',
  -- {"toplam": 355, "ekle": 12, "guncelle": 340, "atla": 0, "hata": 3}
  ozet         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  uygulandi_at timestamptz
);

create index import_batches_school_idx on import_batches (school_id, created_at desc);

create table import_rows (
  id         uuid primary key default gen_random_uuid(),
  batch_id   uuid not null references import_batches(id) on delete cascade,
  satir_no   integer not null,
  ham        jsonb not null,
  islem      satir_islemi not null,
  hatalar    jsonb not null default '[]'::jsonb,
  unique (batch_id, satir_no)
);

create index import_rows_hata_idx on import_rows (batch_id) where islem = 'hata';

-- ---------------------------------------------------------------------------
-- Denetim kaydı
-- ---------------------------------------------------------------------------
create table audit_logs (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  actor_user_id   uuid references users(id) on delete set null,
  islem           text not null,      -- 'etut.onayla', 'yoklama.duzelt', ...
  entity          text not null,
  entity_id       uuid,
  oncesi          jsonb,
  sonrasi         jsonb,
  ip              inet,
  created_at      timestamptz not null default now()
);

create index audit_logs_school_idx on audit_logs (school_id, created_at desc);
create index audit_logs_entity_idx on audit_logs (entity, entity_id);
