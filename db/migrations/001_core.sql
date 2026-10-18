CREATE TABLE users (
 id uuid PRIMARY KEY, provider text NOT NULL, provider_subject text NOT NULL, display_name text,
 UNIQUE(provider,provider_subject)
);
CREATE TABLE households (
 id uuid PRIMARY KEY, owner_user_id uuid NOT NULL UNIQUE REFERENCES users(id), name text NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version>0)
);
CREATE TABLE participants (
 id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id), display_name text NOT NULL CHECK(length(trim(display_name)) BETWEEN 1 AND 80),
 archived_at timestamptz, UNIQUE(id,household_id)
);
CREATE UNIQUE INDEX participant_active_name ON participants(household_id,lower(display_name)) WHERE archived_at IS NULL;
CREATE TABLE receipts (
 id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id),
 payer_participant_id uuid, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','finalized')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), currency text NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
 merchant text, purchased_on date, reviewed_total_cents bigint CHECK(reviewed_total_cents BETWEEN 0 AND 100000000),
 review jsonb NOT NULL DEFAULT '{"confirmed":false,"sourceAttemptId":null,"lineResolutions":[]}',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,household_id), FOREIGN KEY(payer_participant_id,household_id) REFERENCES participants(id,household_id)
);
CREATE INDEX receipt_history ON receipts(household_id,created_at DESC,id DESC);
CREATE TABLE items (
 id uuid PRIMARY KEY, receipt_id uuid NOT NULL REFERENCES receipts(id) ON DELETE CASCADE, household_id uuid NOT NULL,
 sequence integer NOT NULL, description text NOT NULL, quantity numeric(12,3) CHECK(quantity>0),
 unit_price_cents bigint CHECK(unit_price_cents BETWEEN 0 AND 100000000),
 gross_cents bigint CHECK(gross_cents BETWEEN 0 AND 100000000), source_line_ids jsonb NOT NULL DEFAULT '[]',
 UNIQUE(id,receipt_id,household_id), UNIQUE(receipt_id,sequence),
 FOREIGN KEY(receipt_id,household_id) REFERENCES receipts(id,household_id) ON DELETE CASCADE
);
CREATE TABLE adjustments (
 id uuid PRIMARY KEY, receipt_id uuid NOT NULL REFERENCES receipts(id) ON DELETE CASCADE, household_id uuid NOT NULL,
 sequence integer NOT NULL, kind text NOT NULL CHECK(kind IN ('line_discount','receipt_discount','tax','fee')),
 label text NOT NULL, amount_cents bigint CHECK(amount_cents BETWEEN 0 AND 100000000), eligibility_confirmed boolean NOT NULL DEFAULT false,
 UNIQUE(id,receipt_id,household_id), UNIQUE(receipt_id,sequence),
 FOREIGN KEY(receipt_id,household_id) REFERENCES receipts(id,household_id) ON DELETE CASCADE
);
CREATE TABLE adjustment_targets (
 adjustment_id uuid NOT NULL, item_id uuid NOT NULL, receipt_id uuid NOT NULL, household_id uuid NOT NULL,
 PRIMARY KEY(adjustment_id,item_id),
 FOREIGN KEY(adjustment_id,receipt_id,household_id) REFERENCES adjustments(id,receipt_id,household_id) ON DELETE CASCADE,
 FOREIGN KEY(item_id,receipt_id,household_id) REFERENCES items(id,receipt_id,household_id) ON DELETE CASCADE
);
CREATE TABLE assignments (
 item_id uuid NOT NULL, participant_id uuid NOT NULL, receipt_id uuid NOT NULL, household_id uuid NOT NULL,
 weight integer NOT NULL CHECK(weight BETWEEN 1 AND 10000), PRIMARY KEY(item_id,participant_id),
 FOREIGN KEY(item_id,receipt_id,household_id) REFERENCES items(id,receipt_id,household_id) ON DELETE CASCADE,
 FOREIGN KEY(participant_id,household_id) REFERENCES participants(id,household_id)
);
CREATE TABLE finalizations (
 id uuid PRIMARY KEY, receipt_id uuid NOT NULL UNIQUE REFERENCES receipts(id) ON DELETE CASCADE,
 input_version integer NOT NULL, policy_version text NOT NULL, total_cents bigint NOT NULL CHECK(total_cents BETWEEN 0 AND 100000000),
 reviewed_input jsonb NOT NULL, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE share_rows (
 finalization_id uuid NOT NULL REFERENCES finalizations(id) ON DELETE CASCADE,
 participant_id uuid NOT NULL REFERENCES participants(id), participant_name_snapshot text NOT NULL,
 final_cents bigint NOT NULL CHECK(final_cents>=0), is_payer boolean NOT NULL,
 PRIMARY KEY(finalization_id,participant_id)
);
CREATE TABLE item_allocation_rows (
 finalization_id uuid NOT NULL REFERENCES finalizations(id) ON DELETE CASCADE,
 item_id uuid NOT NULL REFERENCES items(id), participant_id uuid NOT NULL REFERENCES participants(id),
 net_cents bigint NOT NULL CHECK(net_cents>=0), final_cents bigint NOT NULL CHECK(final_cents>=net_cents),
 adjustment_breakdown jsonb NOT NULL, PRIMARY KEY(finalization_id,item_id,participant_id)
);
CREATE FUNCTION guard_finalized_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status='finalized' THEN RAISE EXCEPTION 'Finalized receipt is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_receipt BEFORE UPDATE ON receipts FOR EACH ROW EXECUTE FUNCTION guard_finalized_receipt();
CREATE FUNCTION guard_finalized_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent uuid;
BEGIN
 IF TG_OP='DELETE' THEN parent=OLD.receipt_id; ELSE parent=NEW.receipt_id; END IF;
 IF EXISTS(SELECT 1 FROM receipts WHERE id=parent AND status='finalized') THEN
  RAISE EXCEPTION 'Finalized receipt graph is immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER immutable_items BEFORE INSERT OR UPDATE OR DELETE ON items FOR EACH ROW EXECUTE FUNCTION guard_finalized_child();
CREATE TRIGGER immutable_adjustments BEFORE INSERT OR UPDATE OR DELETE ON adjustments FOR EACH ROW EXECUTE FUNCTION guard_finalized_child();
CREATE TRIGGER immutable_assignments BEFORE INSERT OR UPDATE OR DELETE ON assignments FOR EACH ROW EXECUTE FUNCTION guard_finalized_child();
CREATE TRIGGER immutable_targets BEFORE INSERT OR UPDATE OR DELETE ON adjustment_targets FOR EACH ROW EXECUTE FUNCTION guard_finalized_child();
CREATE INDEX items_receipt ON items(receipt_id);
CREATE INDEX adjustments_receipt ON adjustments(receipt_id);
CREATE INDEX assignments_participant ON assignments(participant_id);
