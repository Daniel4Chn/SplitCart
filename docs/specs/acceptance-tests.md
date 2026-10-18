# Acceptance and testing strategy

## Railway evidence update — 2026-10-18 / M6–M7

On the user-authorized Railway host, Docker build, checksum migrations 001–004, private volume permissions/nonroot application startup, DB/native readiness, HTTPS homepage/health, signed-out receipt API 401 and Google authorization redirect/state/callback checks pass. Hosted `npm test`: 31/8 files; hosted unittest: 9. Supervised worker fault/descendant tests pass on Linux. `host-smoke.ts create` produced two synthetic OCR items, reviewed source-linked draft, exact 600-cent finalized snapshot and byte-identical private original. Actual service restart plus `verify` preserved finalization ID/snapshot/image and removed synthetic live data. Hosted backup restored into an independent database: 1 receipt, 1 finalization, 1 image; original/display hashes/references and exact shares verified.

These close the listed hosted smoke/recovery checks only. They do not prove completed Google login/logout, physical-phone behavior, real OCR quality/holdout/usefulness, resource-pressure resilience, complete authorization-path coverage, scheduled off-host backups/expiry, or least-privilege DB role deployment. GitHub auto-deploy is not connected; remote CI status is recorded separately. No full M7 or security-compliance claim.

Status: specifications approved; automated tests now run. Executed evidence is recorded below and in the implementation log. Real-receipt OCR measurements remain unavailable.

## Test layers and tooling

Proposed tools: Vitest for TypeScript domain/contract tests, Python stdlib unittest for processor/parser tests, PostgreSQL test database for real constraints/transactions, Playwright for browser workflows. Use real money engine in UI/integration tests; mock OCR only to isolate orchestration faults, never to claim OCR quality. Containerized pinned Tesseract/language data provides repeatable evaluation where available.

## Acceptance coverage map

| Acceptance IDs | Required evidence | Milestone |
|---|---|---|
| A-FOUND-1 | Clean documented setup, locked dependencies, no-op test runner checks, DB connectivity, native binary probe, private dev identity/production refusal | M0 |
| A-SPL-1,2 | Fixed vectors and generated invariant tests for cent parsing, rounding, weights, ordering, caps, discounts, tax eligibility, payer balances | M1 |
| A-SPL-3, A-DB-1,2, A-API-1,3 | Real DB rollback/concurrency/retry tests; manual receipt browser round trip | M2 |
| A-IMG-1..4 | Image fixtures, subprocess contract/fault tests, duplicate/concurrent-edit checks, restart/cleanup injection | M3 |
| A-PAR-1..3 | Frozen TSV fixtures and real corpus evaluation with saved versions, manifest, raw counts, and failure examples | M4 |
| A-UX-1..3, A-DB-3 | Upload/review/import/assign/finalize/history mobile/browser tests; draft edits and delete recovery | M5 |
| A-API-2, A-SEC-1 | Two-owner API/image isolation, signed-out and CSRF failures, secure session and production dev-bypass refusal | M6 |
| A-DB-4, A-REL-1..3 | Target-host native OCR smoke, backup restore, restart recovery, full E2E, corpus usefulness decision | M7 |

A-FOUND-1: Reproducible supported runtime/dependency setup and private scaffold checks pass; no business feature presented as complete.
A-UX-1: A phone-sized browser can upload, review image alongside rows, correct an erroneous price, assign weights, and finalize a reconciled summary.
A-UX-2: Missing price/total, unknown financial line, no assignment, stale version, and mismatched total each show an actionable error and preserve saved edits.
A-UX-3: Finalized history survives reload/restart; draft receipts do not enter spending totals; payer reimbursements and participant shares are distinct.
A-SEC-1: Every receipt/participant/attempt/file/deletion path is covered by cross-owner tests; CSRF and unauthenticated mutation attempts fail; logs contain no receipt body or secrets.
A-REL-1: Clean deploy and migration, bounded processing failure, restart and restore are demonstrated on the chosen host without public storage exposure.
A-REL-2: All preceding acceptance IDs pass; no unrun required checks are labeled passed; no placeholder workflow or fabricated metrics.
A-REL-3: Product owner reviews measured extraction and correction burden and explicitly accepts OCR usefulness or narrows scope before release. This is a real release gate, not a preclaimed accuracy target.

## Monetary cases

Test all worked vectors in expense-splitting.md. Add zero/one cent/maximum bounds; many participants; unequal ratios; stable tie IDs; row reorderings; duplicate participant references; fully discounted items; overlapping discount sets and sequence; separate eligible tax sets; multiple positive fees; decimal quantity conflicts; missing prices; orphan IDs; archived participants; payer own share; and repeated finalization.

Generated tests use seeded valid integer inputs and assert sum(participant final)=reviewed total; sum(each component)=component magnitude; net/adjustment/final display reconciliation; no negative final shares; deterministic output; and rejection of invalid graphs. A second small reference enumerator validates small allocation cases rather than duplicating production code. Counterexample: equal sharing of 1000 cents must be 334/333/333, never 333/333/333.

## OCR corpus and honest metrics

Before collecting data, create an evaluation manifest and consent/redaction rules. Proposed initial collection plan: 24 consented receipt captures from at least three grocery stores, deliberately including clear, skewed, faded/glare, and cropped/blurred conditions. This is a data collection target, not an accuracy benchmark or claim of representativeness. Link repeated captures of the same underlying receipt into one group; never split a group's images between development and holdout. Reserve whole receipt groups for holdout and do not tune on them. If corpus coverage cannot be obtained, document the gap and seek release-scope approval.

Ground truth is manually transcribed from legible evidence and independently checked: ordered items, descriptions, quantities when printed, line totals, adjustments, eligible sets when knowable, and receipt total. Ambiguous human-unreadable fields are explicitly excluded from accuracy denominators and reported as unreadable; they remain failure/retake cases. Redaction must not erase fields used for evaluation. Synthetic fixtures supplement, never replace, real captures.

Report actual counts and denominators, grouped by store/quality:

- Item-line detection precision = correctly matched predicted purchase lines / predicted purchase lines; recall = matched ground-truth purchase lines / readable ground-truth purchase lines. Matching is one-to-one in source order with annotated source-line alignment; duplicate names remain distinct.
- Exact line-price accuracy = detected matched lines with correct cents / matched lines with readable ground-truth prices. Also report end-to-end price recovery = correct line-price matches / all readable ground-truth purchase lines, so missed lines cannot inflate quality.
- Total extraction accuracy = receipts with exact correct proposed total / receipts with readable total; unknown proposals count as failures.
- Quantity exact accuracy uses only explicitly printed, readable quantities; unknown outputs count as misses.
- Uncorrected reconciliation rate = candidates whose complete financial rows equal the ground-truth total / evaluated receipts. A coincidental sum is not proof of correct rows; report alongside line metrics.
- Review burden = observed edits/additions/deletions per receipt and correction time from recorded user review sessions. Compare against observed manual entry on comparable receipts with a counterbalanced order; do not assert savings before measurement.
- Processing duration, timeout count, and failure rate on the documented machine/runtime/corpus. These are measurements, not an SLA.

M4 establishes baseline vs preprocessing results on development groups, records holdout plan, and proposes any numeric release targets from evidence for approval. M7 evaluates locked holdout once; thresholds cannot be lowered silently after seeing outcomes. No arbitrary accuracy percentage is imposed in advance. Release requires deterministic safety/correctness criteria regardless of OCR quality, plus explicit evidence-backed usefulness acceptance (A-REL-3). If review is slower than manual entry or unsupported formats dominate, improve or narrow scope rather than claim success.

## Reliability/security cases

Malformed signatures, MIME mismatch, image bombs, excessive dimensions, traversal names, unsupported HEIC/PDF, duplicate bytes, owner-isolated hashes, missing engine, bad JSON, nonzero exits, stderr overflow, process timeout/descendants, simultaneous attempts, process restart, disconnect, stale candidate import, concurrent finalize, DB rollback, missing files, storage deletion retries, malicious source IDs, unauthenticated access, cross-owner nested writes, CSRF, and production development bypass.

## Execution gates

Each milestone runs its relevant tests plus affected prior tests, lint/type checks for TypeScript, and Python checks when changed. M7 runs the complete suite and real target-host smoke/evaluation. Record command, environment, result, and limitations in implementation-log.md. Do not require expensive live OCR for every pure-money change. Failing required checks keep the milestone open.

## Executed coverage — 2026-10-17

Evidence refers to actual commands in implementation-log.md; “local” does not mean target-host or real-corpus acceptance.

| IDs / milestone | Executed evidence | Remaining gate |
|---|---|---|
| A-FOUND-1 / M0 | npm ci; doctor; clean DB install + no-op replay + reconnect; production dev-bypass refusal; worker contract schemas; TypeScript/Python runners | Fresh target-host native environment is M7, unverified |
| A-SPL-1,2 / M1 | money/split unit groups: all worked vectors, independent exhaustive small enumerator, 300 seeded cases, caps/zero/ratios/invalid graphs and component capacities | None identified for local pure domain |
| A-SPL-3, A-DB-1,2, A-API-1,3 / M2 | Real PostgreSQL rollback/stale-write/concurrent finalize/cross-household/immutability tests; route contract guards; mobile exact manual workflow; real app stop/start exact summary | Hosted environment not claimed |
| A-IMG-1,2,4 / M3 | Native PNG upload/OCR, original byte preservation, strict schema, owner-isolated duplicate hashes, private image reads and concurrent draft edits; malformed/truncated/oversized/multiframe/MIME/dimension Python tests | Target Linux/container resource behavior unrun |
| A-IMG-3 / M3 | Missing executable, malformed JSON, output overflow, nonzero/error schema/identity, deadline and descendant-kill tests; persisted expired-attempt recovery | Real target-host hard crash/resource smoke unrun |
| A-PAR-1,2 / M4 | Frozen synthetic line cases: wrap/quantity/weighted/coupon/tax/tender/duplicates/unknown prices/ambiguous totals; deterministic results | No real quality acceptance from these cases |
| A-PAR-3 / M4 | Evaluator raw-denominator regression test; zero-real-corpus limitation report | Real consented corpus, independent alignment/truth, per-store/quality development measurements absent; NOT PASSED |
| A-UX-1..3, A-DB-3 / M5 | 390×844 Chromium real native upload/import/price-correction/review/finalize/delete; missing price/mismatch/stale saves; original-vs-latest source separation; snapshot rename test; failed file cleanup/retry; actual app restart | Real phone camera/HTTPS and usefulness verification unrun; M4 quality gate still open |
| A-API-2, A-SEC-1 / M6 | Two-owner service/route isolation; private original/display responses; deletion-status isolation; origin guards; unauthenticated production API 401; production bypass refusal | Real Google sign-in/sign-out and provider configuration unverified; M6 NOT COMPLETE |
| A-DB-4 / M7 | Consistent DB+private-image backup restored into separate local DB; 7 receipts, 3 finalizations, 1 image, hashes and share totals verified | Chosen-host restore/retention and authorized hosted image smoke unrun |
| A-REL-1..3 / M7 | Dockerfile/CI/runbook/tooling present, local build/restart/restore evidence recorded | Host, HTTPS, credentials, corpus/holdout, observed review burden and explicit usefulness approval absent; NOT PASSED |

No percentage OCR accuracy, observed review-time savings, real provider verification, container build, remote CI or hosted deployment is inferred from these local checks.

## Camera/manual redesign regression — 2026-10-17 (M2/M5, ADR-003)

Current browser suite replaces the old upload/import form tests. It exercises synthetic live-video capture through getUserMedia and real native OCR, automatic unreviewed draft population, price correction, shared-item review, preview, finalization, same-photo reopening without a second charge, manual household item/cost/name selection without a receipt-total field, missing manual inputs, history reload, camera denial, camera cancellation/track stop, and desktop overflow. Mobile/desktop screenshots are visually inspected. Physical phone-camera behavior and real household-store OCR accuracy remain unverified. Existing 26 domain/contract/DB/fault tests retain server validation/isolation coverage.

## Independent-review fixes regression — M2/M3/M5/M6, 2026-10-17

Added pure review tests for safe untouched-draft recovery, no alphabetical payer guess, unknown eligibility remaining unconfirmed, exact differences/unknown amounts, and visible warnings. Real PostgreSQL coverage adds 21-receipt cursor traversal and purchase-date filtering, plus safe owner account display metadata.

Browser regressions cover save-before-navigation, failed saves retaining work, disabled editing during saves, unload warnings, incomplete manual draft deletion, explicit payer selection after an alphabetically earlier roommate is added, individual adjustment eligibility, known/unknown reconciliation amounts, inline mobile source image/zoom, 20+ history pagination/date filters (including edited-but-unapplied dates), identity/rename/archive/restore and native dialog focus. Hosted identity/sign-out-link visibility uses a clearly synthetic UI fixture; actual Google session invalidation remains unverified. OCR fault injection covers busy→retry, edited drafts surviving rereading, and completed attempts recovered after failed draft import using the real local OCR engine and synthetic camera stream.

Representative text contrast measured against #faf9f5: new #65735b=4.80:1, #63774e=4.66:1, #667951=4.51:1. Previous muted #929a84 was 2.78:1. Critical secondary text was darkened; small interactive mobile controls were enlarged toward 44px, and amount/text inputs use 16px mobile fonts to avoid automatic input zoom. These are targeted checks, not a complete accessibility certification. Device/real-provider/corpus/host release gates remain open.
