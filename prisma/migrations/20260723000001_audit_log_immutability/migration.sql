-- ============================================================================
--  AUDIT LOG IMMUTABILITY — docs/10-security.md §10
--
--  Ikki qatlamli himoya (ikkalasi ham SHART):
--   1. Trigger  — ilova bug'idan himoya (har qanday UPDATE/DELETE rad etiladi)
--   2. REVOKE   — SQLi yoki buzilgan hisobdan himoya (huquqning o'zi yo'q)
--
--  Halol cheklov: DB superuser trigger'ni o'chira oladi — to'liq WORM
--  saqlash keyingi bosqich masalasi.
-- ============================================================================

CREATE OR REPLACE FUNCTION reject_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs jadvali IMMUTABLE — UPDATE/DELETE taqiqlanadi (docs/10-security.md §10)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW
  EXECUTE FUNCTION reject_audit_mutation();

-- Ledger ham immutable — xato teskari yozuv bilan tuzatiladi,
-- o'chirish bilan emas. docs/09-payments-and-billing.md §6
CREATE TRIGGER ledger_entries_no_update
  BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW
  EXECUTE FUNCTION reject_audit_mutation();

-- RatingHistory hech qachon UPDATE qilinmaydi — yangi qator qo'shiladi.
-- docs/06-rating-system.md §8 (DELETE recompute uchun ruxsatli emas emas —
-- qayta hisoblash yangi generation yozadi, eski qator qoladi).
CREATE TRIGGER rating_history_no_update
  BEFORE UPDATE ON "rating_history"
  FOR EACH ROW
  EXECUTE FUNCTION reject_audit_mutation();
