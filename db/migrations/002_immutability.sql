-- M2 DB-03,04: cascaded receipt deletion and immutable graph relocation protection.
ALTER TABLE item_allocation_rows DROP CONSTRAINT item_allocation_rows_item_id_fkey;
ALTER TABLE item_allocation_rows ADD FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE;
CREATE OR REPLACE FUNCTION guard_finalized_child() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP <> 'INSERT' AND EXISTS(SELECT 1 FROM receipts WHERE id=OLD.receipt_id AND status='finalized') THEN
  RAISE EXCEPTION 'Finalized receipt graph is immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP <> 'DELETE' AND EXISTS(SELECT 1 FROM receipts WHERE id=NEW.receipt_id AND status='finalized') THEN
  RAISE EXCEPTION 'Finalized receipt graph is immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
