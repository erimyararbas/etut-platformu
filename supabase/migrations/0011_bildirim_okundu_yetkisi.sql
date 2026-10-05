-- =============================================================================
-- 0011 — Bildirimde yalnızca "okundu" işaretlenebilsin
--
-- 0005'te `grant select, update on notifications to authenticated` verilmişti;
-- bu TÜM kolonları kapsar. RLS satırı doğru kişiyle sınırlıyor ama kullanıcı
-- kendi bildiriminin başlığını/gövdesini/data'sını değiştirebiliyordu.
--
-- Tek başına büyük bir açık değil (kimse başkasının bildirimini göremiyor),
-- ama bildirim kaydı bir olayın kanıtı: "veliye devamsızlık bildirildi" satırı
-- sonradan öğrenci tarafından yeniden yazılabilir olmamalı. Kolon bazlı yetki
-- ile yazılabilir tek alan okundu_at'e indiriliyor.
-- =============================================================================

revoke update on notifications from authenticated;
grant update (okundu_at) on notifications to authenticated;
