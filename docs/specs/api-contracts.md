# HTTP API specification

Requirements API-01..07. Base /api/v1; Node runtime only. Manual and image endpoints implemented locally; acceptance evidence remains tracked separately.

## Common rules

API-01: JSON requests/responses use schemaVersion=1, UUID identifiers, ISO-8601 UTC timestamps, purchase dates YYYY-MM-DD or null, USD, integer-string cents, decimal-string quantity or null, and integer weights. Validate unknown enums, field lengths, collection limits, ownership, and expectedVersion. Never trust client allocations. Success envelope: {schemaVersion:1,data:...}. Error: {schemaVersion:1,error:{code,message,fieldErrors:[{path,code}],requestId}}; safe message, no stack trace/OCR content. Multipart requests carry their schema version as a field.

API-02: Auth required on every hosted endpoint and image response. Ownership mismatch returns 404 without disclosing existence; absent auth returns 401. CSRF/origin checking on all mutations including multipart. All receipt data responses are private/no-store.

## Endpoints

| Method/path | Input | Output/behavior |
|---|---|---|
| GET /household | none | Household and participants, with archived flags. |
| POST /participants | expectedHouseholdVersion, displayName | 201 participant and incremented household version; 409 duplicate active name. |
| PATCH /participants/:id | expectedHouseholdVersion, displayName and/or archived flag | Updated participant and incremented household version; version-aware household mutation; existing history remains snapshotted. |
| POST /receipts | optional merchant/purchasedOn | 201 empty draft version=1; no placeholder money values. |
| GET /receipts | cursor?, from?, to?, limit? | Receipts sorted created_at,id descending; bounded limit up to 50, nextCursor. Date range applies to purchase date, falling back to created date explicitly labeled. |
| GET /receipts/:id | none | Full draft or immutable finalization, image link, version, processing state/candidate, warnings. |
| PUT /receipts/:id/draft | expectedVersion, merchant, purchasedOn, payerParticipantId, reviewedTotalCents, items, adjustments, assignments, review | Atomic complete draft graph replacement; preserve unknown nulls; IDs must belong to current graph or be explicitly new. 200 incremented version. |
| POST /receipts/:id/image | multipart file, expectedVersion | 201 image metadata/new version; only empty image slot in a draft; duplicate bytes 409 with owner-safe existing receipt ID. No client filesystem paths. |
| POST /receipts/:id/process | expectedVersion | Run bounded attempt, persist candidate; 200 receipt/candidate or structured failure. OCR does not change draft item graph or increment graph version; response carries inputVersion. |
| POST /receipts/:id/preview | expectedVersion | Validated allocation breakdown or 422; reads saved graph. Unsaved edits must be saved first. |
| POST /receipts/:id/finalize | expectedVersion | 201 immutable finalization, or 200 existing result for exact retry of same finalized inputVersion; conflict otherwise. |
| GET /receipts/:id/image | variant=display or original | Authorized streaming image, safe content headers, private/no-store; original is download-only attachment. |
| DELETE /receipts/:id | expectedVersion | 202 deletion queued; receipt content no longer readable. data contains deletionId and cleanup status URL. |
| GET /deletions/:id | none | Owner-scoped pending/complete/failed cleanup status; only opaque metadata survives receipt deletion. |

OAuth routes under /api/auth are owned by the selected auth library and not reimplemented. GET /health returns minimal liveness only; readiness is private/operator-only and may check DB/storage/binary presence without exposing paths or credentials.

## Draft contract example

```json
{"schemaVersion":1,"expectedVersion":3,"merchant":"Example Grocer","purchasedOn":"2026-10-16","payerParticipantId":"participant-uuid","reviewedTotalCents":"891","items":[{"id":"item-uuid","description":"Groceries","quantity":null,"unitPriceCents":null,"grossCents":"1000","sourceLineIds":[]}],"adjustments":[{"id":"discount-uuid","sequence":1,"kind":"line_discount","label":"Coupon","amountCents":"100","targetItemIds":["item-uuid"],"eligibilityConfirmed":true},{"id":"discount2-uuid","sequence":2,"kind":"receipt_discount","label":"Store discount","amountCents":"90","targetItemIds":["item-uuid"],"eligibilityConfirmed":true},{"id":"tax-uuid","sequence":3,"kind":"tax","label":"Tax","amountCents":"81","targetItemIds":["item-uuid"],"eligibilityConfirmed":true}],"assignments":[{"itemId":"item-uuid","participantId":"participant-uuid","weight":1}],"review":{"confirmed":true,"sourceAttemptId":null,"lineResolutions":[]}}
```

UUID labels above illustrate references; actual requests must supply valid UUIDs. New IDs are generated in the client as UUIDs or by a server creation helper and validated; an existing ID from another receipt is rejected, never moved.

## State/error semantics

API-03: Draft may contain missing values and be saved. Preview/finalization requires all rules in receipt-parsing.md and expense-splitting.md. Review confirmation is bound to content version; editing substantive input resets review. Importing candidate data is an explicit PUT draft with sourceAttemptId and expectedVersion; importing stale candidate requires renewed review of resulting graph.
API-04: Graph mutations require expectedVersion. 409 VERSION_CONFLICT offers reload; never auto-overwrite. Image upload increments graph version; attempts are separate records. Concurrent process calls for same receipt return PROCESSING_ACTIVE; global capacity failure returns 429 OCR_BUSY with Retry-After.
API-05: Failure classes: 400 MALFORMED_REQUEST; 401 UNAUTHENTICATED; 404 NOT_FOUND; 409 VERSION_CONFLICT, DUPLICATE_IMAGE, FINALIZED, PROCESSING_ACTIVE; 413 UPLOAD_TOO_LARGE; 415 UNSUPPORTED_IMAGE; 422 INVALID_FIELDS, UNRECONCILED, REVIEW_REQUIRED, IMAGE_UNREADABLE; 429 RATE_LIMITED/OCR_BUSY; 503 OCR_UNAVAILABLE; 504 OCR_TIMEOUT; 500 INTERNAL_ERROR. Unexpected engine/contract failure maps to 502 OCR_FAILED. Save errors never masquerade as success.
API-06: Duplicate finalization uses stored finalization inputVersion, not current incremented receipt version, for retry matching. Row locks + unique receipt finalization ensure concurrent retries cannot create duplicate ledger rows. POST draft creation is not auto-retried without user action; byte-hash upload detection prevents duplicate images even if a new empty draft was created after a lost response.
API-07: Rate limit sign-in, uploads, processing, and mutation bursts; exact settings are deployment configuration validated in M7. Limit body and output sizes separately. Deletion status records retain owner ID and opaque keys only; user-facing errors contain no file paths.

## Acceptance

A-API-1: Contract tests reject invalid money/IDs/enums, return stable codes, and validate Python output.
A-API-2: Cross-owner reads, nested mutations, image streaming, and deletion status lookups never reveal data.
A-API-3: Stale edits and lost-response retries preserve user work and finalization uniqueness.

## Implementation details (2026-10-17)

Receipt responses include `image: {url}|null` and latest `processing: {id,inputVersion,state,result,errorCode}|null`. `result` follows the receipt-processing contract with parserVersion and selectionReason in engine metadata. Imported drafts reference a successful same-receipt attempt and explicitly classify every source line before review confirmation. Image validation uses the same worker with `mode=validate`; this internal result is never a candidate. Original evidence is unchanged; normalized display is PNG.

`reviewSource` is the validated OCR result referenced by the saved draft (or null), independently of latest `processing.result`. Reruns may produce a newer candidate without changing that source or edited draft. Persisted drafts, candidates and finalization snapshots are runtime-validated on response.

Camera UX (ADR-003): the shutter action sequentially creates a draft, sends captured JPEG internally to /image, calls /process and PUTs suggestions with review.confirmed=false. Existing API contracts and version checks remain. This automatic NEW-draft population replaces the previous separate UI import action at the user’s request; it never automatically finalizes or overwrites a user-edited graph. Manual receipt-free totals are the sum of known entered costs.

Household response refinement (M5/M6 independent-review fixes): `data.account` contains `{displayName:string, mode:'development'|'google'}` derived from the authenticated household owner. It does not include provider subject IDs, credentials, tokens, or another owner's identity. Household fields and ownership enforcement remain unchanged. History clients must pair a nextCursor with the same applied from/to filters.
