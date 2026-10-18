-- M2/M6 DB-02,03: protect snapshots and enforce nested ledger ownership at DB boundary.
CREATE FUNCTION guard_finalization() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' OR (TG_OP='DELETE' AND EXISTS(SELECT 1 FROM receipts WHERE id=OLD.receipt_id)) THEN
  RAISE EXCEPTION 'Finalization is immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM receipts WHERE id=NEW.receipt_id AND status='draft' AND version=NEW.input_version) THEN
  RAISE EXCEPTION 'Invalid finalization version' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER immutable_finalization BEFORE INSERT OR UPDATE OR DELETE ON finalizations FOR EACH ROW EXECUTE FUNCTION guard_finalization();
CREATE FUNCTION guard_ledger_row() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE receipt uuid; household uuid;
BEGIN
 IF TG_OP='DELETE' THEN
  IF EXISTS(SELECT 1 FROM finalizations WHERE id=OLD.finalization_id) THEN RAISE EXCEPTION 'Ledger is immutable' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Ledger is immutable' USING ERRCODE='23514'; END IF;
 SELECT r.id,r.household_id INTO receipt,household FROM receipts r JOIN finalizations f ON f.receipt_id=r.id WHERE f.id=NEW.finalization_id AND r.status='draft';
 IF receipt IS NULL OR NOT EXISTS(SELECT 1 FROM participants WHERE id=NEW.participant_id AND household_id=household) THEN
  RAISE EXCEPTION 'Invalid ledger household' USING ERRCODE='23514';
 END IF;
 IF TG_TABLE_NAME='item_allocation_rows' THEN
  IF NOT EXISTS(SELECT 1 FROM items WHERE id=NEW.item_id AND receipt_id=receipt) THEN RAISE EXCEPTION 'Invalid ledger item' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_share BEFORE INSERT OR UPDATE OR DELETE ON share_rows FOR EACH ROW EXECUTE FUNCTION guard_ledger_row();
CREATE TRIGGER immutable_allocation BEFORE INSERT OR UPDATE OR DELETE ON item_allocation_rows FOR EACH ROW EXECUTE FUNCTION guard_ledger_row();
CREATE FUNCTION guard_image_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM receipts r JOIN households h ON h.id=r.household_id WHERE r.id=NEW.receipt_id AND h.owner_user_id=NEW.owner_user_id) THEN RAISE EXCEPTION 'Invalid image owner' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER image_owner BEFORE INSERT OR UPDATE ON receipt_images FOR EACH ROW EXECUTE FUNCTION guard_image_owner();
