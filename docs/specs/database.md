# Database specification

Requirements DB-01..07. PostgreSQL implemented in migrations 001–004; local constraints and transaction checks execute.

## Relationships

User 1 → 1 Household; Household 1 → many Participants and Receipts; Receipt 1 → many Items, Adjustments, ProcessingAttempts; Item many ↔ many Participants through Assignments; Adjustment many ↔ many Items through AdjustmentTargets; Receipt 1 → 0..1 Finalization; Finalization 1 → many ShareRows and ItemAllocationRows.

## Entities

| Entity | Important columns and constraints |
|---|---|
| users | UUID PK, provider, provider_subject; unique provider+subject; display name optional. Never identify ownership by mutable email alone. |
| households | UUID PK, owner_user_id unique FK, name, version positive integer; only one per user in MVP. |
| participants | UUID PK, household_id FK, display_name, archived_at; trim/nonblank, reject case-insensitive duplicate active names within household. Includes organizer label. |
| receipts | UUID PK, household_id FK, payer_participant_id nullable in draft, status draft/finalized, version positive integer, currency USD, merchant/date nullable, reviewed_total_cents BIGINT nullable, review JSONB (confirmation/source attempt/line resolutions), created_at, updated_at. |
| receipt_images | UUID PK, owner_user_id FK, sha256, opaque original/display storage keys, mime, byte_count, dimensions; unique(owner_user_id,sha256). One image belongs to at most one receipt. |
| processing_attempts | UUID PK, receipt_id FK, input_version, state, deadline, start/end, processor/parser/engine versions, candidate JSONB, safe error code; partial unique active attempt per receipt. |
| items | UUID PK, receipt_id FK, sequence, description, quantity NUMERIC(12,3) nullable, unit_price_cents BIGINT nullable, gross_cents BIGINT nullable in draft, source_line_ids JSONB; receipt review JSONB references the shared source attempt and content-version confirmation. |
| adjustments | UUID PK, receipt_id FK, immutable sequence, kind, label, amount_cents BIGINT nullable in draft, eligibility_confirmed boolean. |
| adjustment_targets | adjustment_id FK, item_id FK, composite PK; at least one eligible item required at finalization, line discounts exactly one. |
| assignments | item_id FK, participant_id FK, integer weight 1..10000, composite PK. |
| finalizations | UUID PK, receipt_id unique FK, input_version, policy_version, total_cents BIGINT, reviewed_input JSONB, created_at. |
| share_rows | finalization_id FK, participant_id FK, participant_name_snapshot, final_cents BIGINT, is_payer; composite PK. |
| item_allocation_rows | finalization_id FK, item_id FK, participant_id FK, net_cents, final_cents, adjustment_breakdown JSONB; composite PK. |
| storage_deletions | UUID PK, owner_user_id FK, state pending/complete/failed, opaque keys pending physical deletion, created_at, retry metadata; transactionally created when deleting a receipt. |

## Constraints and consistency

DB-01: Money columns are BIGINT cents, nonnegative and bounded where known; draft null means unknown, never zero by default. JSON money uses integer strings; validate JSONB candidate/snapshot at application boundaries.
DB-02: Composite parent keys/FKs or constraint triggers enforce that payer/assignments belong to the receipt household and adjustment targets/items belong to the same receipt. Services additionally check owner authorization. Simple foreign keys alone are insufficient for cross-household isolation.
DB-03: Update draft graph in one transaction with receipt row lock and expected version; increment exactly once. Finalize in a row-locked transaction validating the persisted graph, reconcile all sums, insert immutable snapshot, set status, and increment version. Rollback leaves no partial shares. Direct draft changes to finalized rows are rejected by repository and DB constraint trigger or restricted mutation procedure; migrations document the chosen mechanism.
DB-04: Archive participants referenced by saved drafts/history rather than delete them. Archived participants may appear in historical snapshots; block new assignments to them. Drafts containing newly archived participants require reassignment. Do not merge participants by display name. Receipt deletion cascades rows and queues file deletion; deleting history is explicit UI behavior.
DB-05: Staged image move + DB transaction has compensating cleanup on failure. Periodic/startup sweep removes unreferenced staged files; storage deletion outbox retries committed deletions. Do not claim filesystem+DB atomicity. Inaccessible image keys yield a recoverable error, not an authorization bypass.
DB-06: Index receipt household+created_at+id for cursor history, all referencing FKs used in reads, active attempts and due cleanup. Add indexes only for actual query paths; no premature analytics warehouse.
DB-07: Numbered migration files with checksum ledger and exclusive migration lock. Apply once, test clean install and restart. Back up DB plus private files consistently, keep credentials out of repo, and demonstrate restore before hosted release. Backup retention/expiry must be chosen at deployment and explained in deletion UI.

## Retention proposal

Keep original image and OCR evidence while its receipt exists, privately. Delete live rows and enqueue file removal when receipt is deleted; cleanup must complete before showing content deletion as complete. Redacted fixtures are opt-in and not harvested from users. No third-party OCR uploads. Operational logs contain IDs/codes/timings only. Backup copies expire according to the deployment policy; no unsupported instantaneous backup-erasure promise.

## Acceptance

A-DB-1: Migrations create all required constraints; malicious cross-household references fail at both API and DB layers.
A-DB-2: Transaction interruption produces no partial finalization; stale writes return conflict; duplicate finalize leaves one snapshot.
A-DB-3: Restart retains receipts/history, archived/renamed participants preserve snapshot names, and delete/sweep recover from injected filesystem failures.
A-DB-4: Backup restore reproduces receipt, authorized image, and exact allocations.

Implementation representation: receipt_images.receipt_id is the unique image relationship (rather than receipts.image_id). Source attempt provenance is stored once in receipts.review.sourceAttemptId for the explicitly imported complete draft, with item source_line_ids; per-item review is covered by content-bound whole-receipt confirmation and source-line resolutions. Latest OCR result and the exact reviewed source result are returned separately, so reruns preserve the review evidence. Finalization/share/allocation guards and image-owner enforcement are migration 004.
