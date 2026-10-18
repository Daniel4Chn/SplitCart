# Milestone contracts

User approved autonomous M0–M7 implementation. Paths describe milestone deliverables; consult TASKS.md and the implementation log for actual evidence. Common definition of done (DoD): linked acceptance IDs pass; relevant prior checks remain green; no placeholder behavior; specs/tasks/log updated with evidence; completion summary recorded; continue through authorized milestones. Complexity estimates are relative and assume one developer using AI assistance.

## M0 — Reproducible private foundation

Objective: establish a minimal runnable private scaffold and test/evaluation conventions without implementing product behavior.
Specifications: architecture.md; API-01; N-02..06; acceptance-tests.md A-FOUND-1.
Dependencies: approved plan and authorization; verify supported Node/Python/PostgreSQL/Tesseract and auth-library versions. Docker absence may be handled with documented native setup, not silent installation.
Expected files: package.json/lock, tsconfig, minimal src/app/, src/server/dev-identity, Python environment pins, test configs, migration-runner skeleton, .env.example, .gitignore, fixture manifest schema, README.
Steps: check runtime compatibility; choose and pin supported dependencies; create minimal scaffold; configure TS/Python tests and DB connectivity; document native prerequisites; define consent/ground-truth/holdout protocol; refuse development identity in production and bind local mode to loopback. Initialize Git only if authorized as part of this milestone, never overwrite a later-existing repo.
Acceptance: A-FOUND-1; fresh setup instructions work; test runners execute; DB and Tesseract probes are honest; no product-completion claim; secrets not tracked.
Automated tests: dev-identity production refusal, subprocess schema validator smoke, config/DB connectivity checks. Empty test suites alone do not satisfy acceptance.
DoD: common DoD plus documented exact versions and setup limitations. If stable auth compatibility is unavailable, report/propose ADR before adding a substitute.
Complexity/effort: low–medium, 1–2 days.
Risks: missing native dependencies, incompatible auth version, no Docker/server access, no consented receipt corpus.

## M1 — Exact monetary domain

Objective: pure, deterministic receipt validation/allocation independent of UI/database/OCR.
Specifications: SPL-01..09; N-01; API-01; A-SPL-1,2.
Dependencies: M0.
Expected files: src/domain/{money,receipt-validation,allocate,split}.ts; tests/unit/money and split; contract schemas.
Steps: lexical cents parsing/formatting and caps; reviewed graph validation; largest remainder primitive; ordered discounts/taxes; participant capacities/breakdowns; payer reimbursements; fixed and generated tests.
Acceptance: all worked vectors, generated reconciliation invariants, invalid-graph errors, stable ID ties and decimal input rejection pass.
Automated tests: seeded property-style cases, independent small reference enumerator, max bounds, zero-net eligibility, overlapping discount order, participant adjustment decomposition.
DoD: common DoD plus allocation-policy version documented; no Number/float monetary path.
Complexity/effort: medium, 2–3 days.
Risks: discount order ambiguity, double multiplication of quantity, rounding components independently so displayed subtotals disagree.

## M2 — Persisted manual end-to-end slice

Objective: enter a receipt manually, review, assign, preview, finalize, reload summary/history.
Specifications: P-03..07; DB-01..04,06,07; API-01,03,04,06; SPL-07..09; A-SPL-3; A-DB-1,2; A-API-1,3.
Dependencies: M1. Development identity remains private only; model real ownership now even though OAuth arrives later.
Expected files: db/migrations/core; src/server/{repositories,services}; manual-entry/assignment/summary/history pages; route handlers; tests/integration and e2e/manual-receipt.
Steps: migrate owner/household/participant/receipt graph; repositories with owner scoping; draft save/version checks; manual editor; assignment and server preview; transactional finalization snapshot; immutable history; participant archiving and name snapshots.
Acceptance: exact $8.91 example survives reload/restart; mismatch blocks finalize; payer balances are correct; failed transaction leaves no partial state; concurrent finalize yields one snapshot; stale writes cannot overwrite; cross-household relational constraints enforced.
Automated tests: real PostgreSQL constraints, rollback and concurrent requests, route contract tests, Playwright manual flow and reload.
DoD: common DoD; this is a usable local manual splitter, explicitly not OCR-enabled or public-ready.
Complexity/effort: medium, 3–5 days.
Risks: broad UI scope, draft-vs-final review semantics, transactional race conditions, immature setup instructions.

## M3 — Secure images and processing lifecycle

Objective: upload/store/view a receipt privately and run supervised native OCR returning source tokens as a candidate. Structured parsing belongs to M4.
Specifications: IMG-01..08; DB-05; API-02,04,05,07; A-IMG-1..4.
Dependencies: M2; native OpenCV/Tesseract available; configure resource limits.
Expected files: src/server/{storage,ocr-adapter}; image/process routes; python/splitcart/{cli,preprocess,tesseract}; image/attempt migrations; tests/contracts and python/tests; storage cleanup module.
Steps: streaming validation/hash; bounded image decode; staging and private display derivative; subprocess contract; baseline/threshold candidates; attempt state/deadline; capacity guard; process-tree cleanup; duplicate/retry/status behavior; cleanup fault recovery. Candidate has empty structured items until M4 and must not be presented as completed parsing.
Acceptance: A-IMG-1..4; valid private preview and token evidence; malformed inputs rejected; timeout kills Python and Tesseract; restart resolves stale state; edits preserved; exact duplicates owner-isolated.
Automated tests: malformed/oversized/multiframe fixtures, fake process contract failures plus real Tesseract smoke, timeout descendants, simulated DB/file failure, concurrency/hash tests.
DoD: common DoD; no leaked original/temporary files or indefinite running attempts.
Complexity/effort: medium–high, 2–4 days.
Risks: hostile decoder memory use, orphan processes, native packaging, request budget, filesystem/DB inconsistency.

## M4 — Conservative parsing and baseline evaluation

Objective: structured item/adjustment proposals with source evidence and measurable real-data limitations.
Specifications: PAR-01..07; ADR-002; N-06; A-PAR-1..3; OCR evaluation section of acceptance-tests.md.
Dependencies: M3; consented corpus and independently checked ground truth. Corpus absence blocks quality acceptance, not permission to fabricate fixtures/results.
Expected files: python/splitcart/parser modules; frozen TSV/expected JSON fixtures; evaluation manifest and runner; docs/progress/ocr-baseline.md; contract schemas.
Steps: geometric row classification; price/quantity patterns; wrapped descriptions; coupon/tax/total/tender rules; unknown retention; deterministic parser fixtures; baseline vs preprocessing evaluation on development groups; lock holdout groups; report raw counts and review-burden observations; propose evidence-backed targets for approval.
Acceptance: A-PAR-1..3; no silent zero/made-up prices; every unknown price-like line exposed; documented per-store/quality failures, versions, corpus size, and coverage gaps. Holdout not used for tuning.
Automated tests: annotated TSV/JSON cases and real OCR evaluation runner, including repeated descriptions and weighted items.
DoD: common DoD plus baseline report; no unmeasured percentage claim. Any numeric usefulness gate proposed from evidence requires user approval before release enforcement.
Complexity/effort: high, 3–5 days plus collection/feedback latency.
Risks: poor layout generalization, noisy ground truth, false positives from tender lines, overfitting tiny corpus.

## M5 — Integrated review and correction

Objective: complete photo → candidate → reviewed graph → exact split → saved history locally.
Specifications: P-01..07,09,10; PAR review completion; API-03,04; DB-03..05; A-UX-1..3; A-DB-3.
Dependencies: M4.
Expected files: upload/review/progress UI; source image component; candidate-import service; history/delete UI and cleanup status routes; tests/e2e/photo-receipt.
Steps: image capture/file selection; visible progress/failure; compare source/candidate; explicit import/version check; edit/add/delete rows; resolve unknown lines; tax/discount eligibility review; reset confirmation after edits; manual fallback; assign/preview/finalize; history and explicit deletion with cleanup status.
Acceptance: A-UX-1..3; correcting a planted OCR error yields exact expected allocation; mismatches/unresolved finance block finalize; rerun cannot overwrite corrections; delete removes live records and cleans files with recoverable retries.
Automated tests: browser correction and mobile viewport flow, stale candidate import, failure/manual fallback, archive/rename snapshots, delete outbox failures/recovery, relevant domain/DB regressions.
DoD: common DoD; complete local OCR workflow with all underlying actions functional.
Complexity/effort: medium, 2–4 days.
Risks: confusing confidence/review labels, stale autosaves, large forms, unsupported mobile image formats.

## M6 — Organizer accounts and ownership boundary

Objective: enable private hosted use with one organizer account per household and no roommate invitation system.
Specifications: P-08; N-04; DB ownership constraints; API-02,07; A-API-2; A-SEC-1.
Dependencies: M5 and Google OAuth app credentials/redirect configuration; library stability verified in M0. No paid service provisioning implied.
Expected files: src/server/auth; /api/auth routes; sign-in UI; session-to-user mapping; ownership tests; environment/deployment docs.
Steps: configure library/provider; stable provider-subject identity; secure cookie/session handling; create household and organizer participant on first sign-in transactionally; route/file ownership audit; CSRF/origin protection; remove dev identity from hosted configuration; safe rate limits/logging. Development receipts are not automatically assigned to arbitrary first sign-in users.
Acceptance: A-API-2 and A-SEC-1; two test users cannot access or mutate each other's graphs/images/deletion status; signed-out requests fail; production refuses bypass; sign-out expires access as defined by the auth library.
Automated tests: route-by-route authorization matrix and session/CSRF tests with test-only identities; browser auth flow using local test harness plus real-provider manual smoke. No real credentials in CI.
DoD: common DoD; documented manual provider check and secret handling; private hosted boundary ready for M7.
Complexity/effort: medium, 2–3 days.
Risks: OAuth setup delay, library version drift, missing nested-resource checks, accidental dev-data migration.

## M7 — Operational and product release gate

Objective: release a deployable, recovered-from-failure, evidence-validated MVP.
Specifications: N-01..07; DB-07; A-DB-4; A-REL-1..3; all previous acceptance IDs.
Dependencies: M6; user-approved host/budget, DNS/HTTPS, persistence/backup retention, and corpus usefulness targets where proposed. No deployment or purchase without required authorization.
Expected files: Dockerfile/deployment config as needed; README and operations runbook; backup/restore/cleanup scripts; CI configuration; docs/progress/release-validation.md and OCR holdout report.
Steps: package native binaries/language data; deploy HTTPS reverse proxy with compatible request limits; apply migrations; run real OCR smoke; demonstrate restart, lost-response recovery, storage cleanup, DB+image backup restore; audit secrets/logs; run full suite; evaluate locked holdout; observe user correction vs manual entry; request evidence-based usefulness/release acceptance.
Acceptance: A-DB-4, A-REL-1..3; all previous criteria pass. Report actual host/corpus results and unresolved limitations. Failure to meet approved OCR usefulness criteria means improve/narrow scope and retest, not silently declare release.
Automated tests: full suite, target-host health/native OCR smoke, restoration verification, resource/rate-limit checks and fault recovery. Human review session and mobile camera/provider smoke documented separately.
DoD: common DoD plus approved release usefulness and runnable operations instructions. No invented throughput, accuracy, SLA, or production-readiness claim.
Complexity/effort: medium–high, 2–4 days plus feedback/hosting latency.
Risks: target-host mismatch, volume loss, cost, noisy holdout outcome, correction burden defeating the product value.
