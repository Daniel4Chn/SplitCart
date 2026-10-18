# SplitCart — Evidence-Based Technical Audit for Resume Selection

Audit date: October 17, 2026. Target audience: a Computer Science student applying for Summer 2027 general Software Engineering internships, and a writing assistant selecting exactly three resume bullets. This report recommends themes; it deliberately does not write the final bullets.

## 1. Executive summary

SplitCart is a locally working, full-stack web application that converts a camera-captured grocery or household receipt into editable OCR suggestions, then calculates and saves exact item-level cost splits among named participants. A shorter receipt-free workflow accepts item names, costs, sharing choices, and a payer.

Its strongest engineering contribution is **deterministic financial correctness**, particularly largest-remainder allocation, ordered discounts and taxes, and a capacity-based decomposition that keeps displayed components consistent with final shares. Its next strongest contributions are **transactional PostgreSQL finalization and consistency** and **supervised local image/OCR processing across a validated TypeScript–Python boundary**.

The implementation goes substantially beyond a basic CRUD demonstration: it contains real relational constraints, concurrent-finalization tests, optimistic version checks, immutable snapshots, process-group termination, resource limits, private image handling, deletion recovery, and database-plus-image backup tooling. However, it is **a single-host local application with open release gates**, not a demonstrated production service or scalable OCR platform.

Fresh audit validation passed:

- TypeScript type checking.
- 31 TypeScript tests across 8 files: 24 unit tests, 6 PostgreSQL integration tests, and 1 route-contract test containing multiple scenarios.
- 9 Python unittest tests across 4 files.
- 14 Playwright browser tests across 3 specification files.
- Production webpack build with development authentication disabled.
- Operator readiness checks and a fresh isolated database migration/replay check covering all 4 migrations.

That is **54 passing test cases across the three test runners**, not 54 unit tests or 54 independent production scenarios. Test cases often contain many assertions; several browser cases intentionally mock selected failure or identity responses.

There are **0 documented consented real receipt captures and 0 independently checked real ground-truth receipts**. No real OCR accuracy, processing-latency distribution, correction-time savings, adoption, load capacity, remote CI execution, container build, or hosted deployment is established.

Two additional isolated audit probes confirmed implementation gaps: restoring archived participants can produce **51 active participants despite the intended 50-person cap**, and an image-associated receipt can finalize using a manually supplied reviewed graph with **no OCR source reference**. These qualify claims about hard limits and mandatory source-line review; neither means that exact-cent reconciliation is bypassed.

**Ownership caveat:** repository implementation proves what exists, not who personally built it. Git metadata is absent, and substantial AI assistance is documented in the project context. Confirm personal design, implementation, testing, and debugging contributions before using individual-action claims on a resume.

## 2. Project purpose

The real-world problem is dividing a shared shopping trip fairly when different people share different items, quantities do not necessarily mean additional charges, and discounts/taxes must follow eligible purchases. Simply dividing the receipt total equally cannot handle those cases.

The product supports one organizer account owning one household of participant labels. A participant does not need an account. Each receipt has one payer; nonpayers reimburse that payer for their allocated shares. This is expense calculation and recordkeeping, not payment processing, debt settlement, banking integration, or collaborative household editing.

The camera workflow removes file selection and starts extraction after the shutter action. It still transfers the captured image internally to the server. “No upload” is a UX description only; claiming that receipt bytes never leave the browser would be false. Manual entry provides Groceries/Household items titles, not a separate categorization or inventory subsystem.

Supported intended scope is English-language US retail receipts, USD, one JPEG/PNG image, and nonnegative purchase amounts. HEIC, PDF, multipage receipts, multicurrency, returns, multiple payers, invitations, exports, budgets, notifications, and bank/payment integrations are outside the current implementation.

Evidence: `src/components/workspace.tsx` (`camera`, `capture`, manual flow); `src/domain/split.ts:10` (`splitReceipt`); `docs/specs/product.md`; `docs/decisions/ADR-003-camera-and-simple-manual-entry.md`.

## 3. Complete technology stack

Versions below describe repository pins or the observed local environment, not an independent claim about current upstream support.

| Layer | Technology and version | Evidence / qualification |
|---|---|---|
| Web framework | Next.js 16.4.2, App Router, Node route handlers | `package.json`, `src/app/`; production build uses webpack |
| UI | React / React DOM 19.3.1, TypeScript TSX, authored CSS, SVG icons | `src/components/`, `src/app/globals.css`; no component framework or Tailwind dependency |
| Language/tooling | TypeScript 7.0.2; tsx 4.23.15; strict checking, ES2022 target | `package.json`, `tsconfig.json` |
| Runtime | Node 22.18.0; npm 10.9.3 observed; Node >=22.12.0 declared | Runtime probes, `package.json` engines |
| Validation | Zod 4.6.7 | Shared draft/split/OCR schemas and API inputs |
| Database | PostgreSQL 15.18 observed; node-postgres `pg` 8.23.1 | SQL migrations, `src/server/db.ts`, readiness probe |
| Authentication | `next-auth` 4.24.15, Auth.js/NextAuth library, Google OAuth, JWT sessions | `src/server/auth.ts`; actual provider login remains unverified |
| Image processing | Python 3.14.7 observed; OpenCV headless 4.13.0.92 package / cv2 4.13.0 runtime; Pillow 12.2.0 | `python/requirements.txt`, doctor output |
| Numerical geometry | NumPy, transitively supplied by OpenCV | Used for matrices/images; no direct NumPy pin in requirements |
| Recognition | Tesseract CLI 5.5.3 observed, English traineddata, TSV output, page segmentation mode 6 | `python/splitcart/cli.py`; traineddata SHA-256 recorded per result |
| TS testing | Vitest 5.0.5 | `vitest.config.ts`, `tests/unit`, `tests/integration`, `tests/contracts` |
| Browser testing | Playwright 1.64.1, local Chromium, fake Y4M camera stream | `playwright.config.ts`, `scripts/camera_fixture.py`, `tests/e2e` |
| Python testing | Standard-library unittest | `python/tests/`; not pytest |
| Storage / hashing | Private local filesystem; Node crypto SHA-256 and UUIDs; Python UUIDv5 and hashlib | `src/server/images.ts`, parser/evaluator/backup scripts |
| Operations | `pg_dump`, `pg_restore`, local PostgreSQL cluster scripts, backup/restore/maintenance/restart checks | `scripts/` |
| Packaging | Dockerfile, Node 22.18.0 Debian Bookworm slim base, apt native binaries, nonroot runtime | Provided but not container-built in recorded evidence |
| CI configuration | GitHub Actions; PostgreSQL 15 service; Node/Python/native dependencies and browser checks | `.github/workflows/checks.yml`; no verified remote run |

JavaScript direct dependencies use exact versions and a lockfile (lockfile version 3, 199 package entries including the root/optional-platform entries). This is not equivalent to 199 installed runtime dependencies. Python requirements directly pin OpenCV and Pillow; native apt packages and the Docker base digest are not fully pinned.

No Express, FastAPI, ORM, Redis, message broker, cloud OCR API, object-storage service, LLM extraction, model-training pipeline, or hosted payment API is implemented. Google OAuth is the only external application-service integration wired into the source.

## 4. System architecture

### Components and boundaries

```text
Browser camera / manual editor
          |
          v
Next.js /api/v1 handlers -- Auth.js identity + origin/body/rate guards
          |
          +-- Receipt services -- Pure TypeScript monetary engine
          |          |
          |          +-- PostgreSQL graphs, versions, attempts, snapshots
          |
          +-- Image service -- Private original/display/scratch files
                     |
                     +-- Supervised Python process
                              |
                              +-- Pillow decode / EXIF normalization
                              +-- OpenCV grayscale / deskew / threshold
                              +-- Tesseract TSV
                              +-- Conservative receipt parser
                              +-- Runtime-validated JSON back to Node
```

The architecture is a modular full-stack application with a local native subprocess boundary. It is not a microservice architecture. Python has no database or authentication responsibility; Node owns persistence, authorization, orchestration, and final authoritative calculations.

The home page is prerendered as a shell; the client workspace loads private data from dynamic APIs. Receipt data and image responses use private/no-store caching policies. A single large React workspace coordinates screen states rather than separate URL-addressed workflow pages.

### Camera data flow

1. `camera()` requests an environment-facing video stream. Cancellation-generation checks stop late-arriving streams; capture, cancellation, and unmount stop tracks.
2. `capture()` draws a frame to canvas and encodes JPEG. It creates a draft, submits private multipart image bytes, invokes processing, and saves candidate-derived fields as **unreviewed** input.
3. `upload()` checks ownership/version, byte size, MIME/signature, and duplicate SHA-256; Python independently decodes and normalizes the image.
4. Original bytes and a metadata-stripped display PNG move from private staging to generated storage keys; a transaction records their relationship. Failed staging/commit receives compensating cleanup.
5. `processReceipt()` acquires capacity, persists an attempt and deadline, runs the supervised worker, validates the result graph, and stores success/failure. OCR itself does not replace the draft or increment its graph version.
6. The browser presents prices, warnings, source evidence, adjustment eligibility, and exact reconciliation. Recovery imports only into completely untouched drafts; explicit replacement of edited content asks for confirmation.
7. The browser saves reviewed input and requests server preview. Finalization recomputes from persisted input in a database transaction and records immutable snapshots and allocation rows.

### Manual data flow

Item name + lexical dollar cost + sharing choices + explicit payer → integer-cent draft → total derived from entered costs → server validation/preview → explicit finalization → history. Manual entry does not pretend that a separately printed total exists.

### APIs

All paths below are under `/api/v1`; JSON uses a schema-versioned envelope, UUIDs, canonical integer-string money, ISO dates, and expected versions.

| API | Responsibility |
|---|---|
| `GET /household` | Owner household, participants, safe account display/mode |
| `POST /participants`, `PATCH /participants/:id` | Versioned create/rename/archive/restore |
| `POST /receipts`, `GET /receipts` | Draft creation; cursor history/date filters |
| `GET /receipts/:id` | Draft, finalization, image reference, latest attempt and reviewed source |
| `PUT /receipts/:id/draft` | Atomic complete graph replacement |
| `POST /receipts/:id/image` | Bounded internal multipart transfer and validation |
| `GET /receipts/:id/image` | Owner-authorized display/original response |
| `POST /receipts/:id/process` | Synchronous bounded OCR attempt |
| `POST /receipts/:id/preview` | Authoritative calculated split from saved input |
| `POST /receipts/:id/finalize` | Atomic finalization; exact-version idempotent retry |
| `DELETE /receipts/:id` | Delete live records and create file-deletion outbox record |
| `GET /deletions/:id` | Owner-scoped cleanup status and retry |

`/api/auth/[...nextauth]` delegates OAuth/session routes to the library. `/api/health` is liveness only, not database/native readiness.

### Database model

There are **14 application tables**, plus the migration ledger:

- `users`: unique provider + provider subject; stable owner identity.
- `households`: one unique owner, positive optimistic version.
- `participants`: household-scoped labels; case-insensitive active-name uniqueness; archiving.
- `receipts`: draft/finalized status, version, USD, nullable reviewed money, payer, date, review JSONB.
- `items`: receipt order, description, descriptive decimal quantity, nullable integer-cent prices, source lines.
- `adjustments`: immutable sequence at the service boundary, discount/tax/fee kind, amount, eligibility confirmation.
- `adjustment_targets`: many-to-many adjustment-to-item graph.
- `assignments`: many-to-many item-to-participant graph with positive integer weights.
- `finalizations`: one per receipt, input version, policy version, reviewed-input JSONB and split snapshot.
- `share_rows`: historical participant name, final cents, payer flag.
- `item_allocation_rows`: participant/item net, final cents, adjustment breakdown.
- `receipt_images`: one image per receipt, owner/hash uniqueness, opaque keys and validation metadata.
- `processing_attempts`: state, input version, deadline, result/error; partial unique active attempt.
- `storage_deletions`: pending/failed/completed cleanup and retry metadata.

Composite foreign keys enforce household/receipt consistency for payer, items, assignments, and targets. Migration 004 adds finalization/ledger immutability and image-owner guards. Indexes support household history order, item/adjustment lookup, active attempts/deadlines, and pending deletions. There is no PostgreSQL row-level-security policy; owner checks live in services plus relational safeguards.

Sources: `src/server/{receipts,images,worker,auth,http,db}.ts`; `src/app/api/v1/[...path]/route.ts`; migrations 001–004; ADR-001/002/003.

## 5. Major technical implementations

### Financial domain

`dollarsToCents` parses decimal strings lexically into BigInt cents; it rejects exponent syntax, excess precision, negatives, leading-zero ambiguity, and amounts above the defensive cap. PostgreSQL BIGINT values remain strings across JSON. Floating point is used for geometry/confidence and nonmonetary controls, not monetary arithmetic.

`splitReceipt` validates the graph and business rules, applies line discounts before receipt discounts, distributes reviewed positive charges by eligible net value, allocates final item shares by participant weights, and checks exact equality to the reviewed total. Quantity is descriptive: a printed line total is never multiplied again. Payer reimbursement is total minus the payer's own share.

### Consistency and history

`saveDraft` locks the receipt, checks expected version, verifies sources/active participants/identifier ownership, replaces dependent graph rows transactionally, and increments version once. `finalize` locks the receipt, validates persisted input, inserts reviewed/split snapshots and ledger rows, updates status/version, and returns the previous snapshot for an exact retry. Historical names do not change when participant labels change.

### Recognition and review

Pillow verifies real decoded format, frame count, dimensions, pixels, and EXIF orientation. OpenCV produces grayscale and a bounded adaptive-threshold alternative, with conservative near-horizontal deskew and inverse coordinate mapping. Tesseract returns confidence/geometry; a heuristic selects one candidate by mean token confidence. The parser retains duplicate purchases, handles narrow quantity/wrapped-line patterns, separates taxes/coupons/totals/tender, and preserves uncertainty.

Review helpers keep unknown amounts visibly unknown, calculate exact differences, show warnings, leave eligibility unconfirmed, avoid guessing a payer, and protect edited drafts from automatic recovery. There is no trained receipt model or proven general-purpose document understanding.

### Reliability and security

Native execution uses fixed argv with `shell:false`, an environment allowlist, output/lifetime bounds, and detached process-group termination. Durable attempts permit interrupted-state recovery. Database/file consistency uses staging, compensation, orphan sweeps, and a retriable deletion outbox rather than claiming cross-resource atomicity.

Authorization scopes records to the organizer, origin checks protect non-GET receipt mutations, schemas validate cross-language graphs, image responses are authenticated/private, and logs avoid receipt bodies/secrets. Auth.js handles provider/session mechanics, but real-provider verification is still missing.

### Performance-conscious choices

Indexed keyset history avoids offset pagination; a reused PostgreSQL pool is capped at 10 connections; only one selected OCR candidate becomes rows; native numerical thread counts are limited; one decoder/OCR operation is admitted at a time via a database advisory lock. These are implemented design decisions, **not measured speedups or proven capacity**. Complete draft replacement and per-row SQL inserts can be expensive at maximum graph size.

### Operations

The migration runner checks SHA-256 against its ledger under an advisory lock and applies each migration transactionally. Backup holds SHARE locks on public tables while dumping the database and copying referenced images with checksums. Restore creates a new database, checks image references/hashes and snapshot share totals, and retains the isolated result. Deployment packaging/CI/runbook exist, but host and remote-run evidence do not.

## 6. Top 10 engineering accomplishments, ranked

### 1. Deterministic exact-cent allocation and consistent component decomposition

**Built:** A pure TypeScript/BigInt monetary engine with largest-remainder rounding, ordered discounts/taxes, weighted sharing, payer reimbursements, and exact reconciliation.

**Problem solved:** Independent rounding can lose cents, create inconsistent explanations, or allocate a displayed component beyond a person's final share. Discount order and tax eligibility add nontrivial dependencies.

**Internals:** Integer quotient/remainder allocation uses immutable-ID tie breaking. Final participant shares are computed first; net is decomposed using final shares as weights, then positive components consume remaining capacities. This addresses the inconsistency exposed by largest-remainder nonmonotonicity when amounts change.

**Why meaningful:** It separates financial policy from OCR/UI and makes correctness reproducible and explainable across server operations.

**Evidence/impact:** 1,250 exhaustive small two-weight inputs match an independently enumerated reference; 300 seeded receipt cases check exact conservation/component sums/reordering. Worked totals include 891 cents split 446/445 with 405/405 net and 41/40 tax. These are finite correctness tests, not formal verification or measured financial-loss reduction.

**Status:** Implemented and locally validated. **Proof:** `src/domain/money.ts:29` (`allocate`), `src/domain/split.ts:10` (`splitReceipt`), `tests/unit/money.test.ts:26`, `tests/unit/split.test.ts:48,98,209`; SPL-01..09.

### 2. Transactional, versioned, idempotent financial finalization

**Built:** Receipt graph mutations and immutable finalization snapshots backed by real PostgreSQL transactions, row locks, optimistic versions, unique constraints, and triggers.

**Problem solved:** Two finalization requests or stale edits must not create duplicate expenses, partial ledgers, or overwrite newer input.

**Internals:** Receipt row locking serializes mutation/finalization. The server reloads and recalculates saved input, inserts snapshot/share/allocation records, then transitions status atomically. Exact-input-version retries return the existing result. Database triggers reject later graph/ledger modification while permitting explicit parent deletion.

**Why meaningful:** Demonstrates consistency reasoning across API semantics, application transactions, and database constraints rather than relying on disabled buttons.

**Evidence/impact:** Two concurrent finalization calls produce one created result and one retry result sharing the same finalization ID. Stale updates, tampering, mismatch, and injected rollback scenarios are exercised. This establishes a tested two-call race, not high-concurrency throughput or universal exactly-once execution.

**Status:** Implemented/local tests passing; read and participant-state concurrency qualifications remain in section 9. **Proof:** `src/server/receipts.ts:269,403`; `src/server/db.ts:7`; migrations 001/002/004; `tests/integration/receipts.test.ts:72,108`.

### 3. Bounded native OCR orchestration with descendant termination

**Built:** A Node-to-Python-to-Tesseract execution pipeline with fixed arguments, a restricted environment, bounded output/deadlines, persisted attempts, and a database-backed capacity gate.

**Problem solved:** Untrusted image workloads can hang, exhaust resources, leak secrets through subprocess environments, or leave orphan recognition processes.

**Internals:** `supervise` starts a detached process group with shell disabled, watches stdout/stderr, validates expected failures/attempt identity, and SIGKILLs the group on timeout/abort/failure/completion. Python applies CPU/file/descriptor limits and a Linux address-space limit. A PostgreSQL advisory lock permits one validation/OCR operation on the configured database; expired attempts become recoverable failures.

**Why meaningful:** Native process lifecycle and cross-runtime failure containment are richer than wrapping an OCR library call.

**Evidence/impact:** Tests cover missing executables, malformed JSON, oversized output, nonzero exits, structured error identity, hangs, and descendant termination. Configured 60-second timeout and one-operation capacity are safeguards, not observed latency/throughput.

**Status:** Implemented and tested locally; Linux/container bounds and hard crashes remain unverified. **Proof:** `src/server/worker.ts:6,116`; `src/server/images.ts:211,234`; `python/splitcart/cli.py:14`; `tests/unit/worker.test.ts:4,27`.

### 4. Private image ingestion, exact-byte deduplication, and recoverable cleanup

**Built:** Bounded image ingestion, independent decoder validation, original preservation, sanitized display derivatives, owner-scoped hashing, private serving, and deletion recovery.

**Problem solved:** Images introduce malformed content, metadata exposure, traversal, duplicate charges, and database/filesystem inconsistency.

**Internals:** Stream/file bounds precede decoding; signature, MIME, and decoded format agree. UUID keys ignore user filenames. Original bytes are SHA-256 hashed and preserved; EXIF orientation is applied and metadata removed from the display PNG. Staging/compensation handle failure; a transactional outbox records file cleanup and retries failed deletion.

**Why meaningful:** Recognizes that SQL transactions cannot atomically commit local filesystem changes and implements recovery explicitly.

**Evidence/impact:** Native integration compares original bytes, tests same-owner duplicate rejection/other-owner isolation and edit preservation, and exercises failed cleanup followed by successful retry. Python tests reject truncation, excess dimensions/bytes, multiple frames, and MIME mismatch, and verify metadata removal.

**Status:** Implemented/local validation; no malware sandbox, perceptual deduplication, encrypted storage, or backup-erasure guarantee. **Proof:** `src/server/images.ts:30,56,176,323,349`; migration 003/004; `python/splitcart/cli.py:28`; `python/tests/test_images.py`; integration tests at 157/256.

### 5. Conservative computer-vision preprocessing and traceable receipt parsing

**Built:** Two bounded preprocessing candidates, conservative deskew, source-coordinate preservation, deterministic parsing, and explicit warnings/unknowns.

**Problem solved:** Recognition confidence and receipt meaning differ; tender rows, duplicate names, malformed prices, quantities, and coupons can otherwise become incorrect charges.

**Internals:** Canny/Hough line evidence and median angle/deviation gate deskew. Inverse affine mapping restores token boxes to display coordinates. Grayscale and adaptive Gaussian threshold runs compete by mean confidence; only one is parsed. Regex/adjacency rules produce source-linked items/adjustments and UUIDv5 IDs stable within an attempt. Conflicting totals remain null; unknown rows stay available for review.

**Why meaningful:** Couples CV provenance with conservative semantic handling instead of forcing extracted numbers to match a total.

**Evidence/impact:** Actual local Tesseract extracts the synthetic 600-cent total; frozen parser groups cover duplicates, wraps, quantity conflicts, separate tax rows, coupons, tender, malformed prices, and competing totals. No real accuracy or improvement is measured. Merchant/date extraction currently stays null.

**Status:** Pipeline implemented; practical recognition quality partially validated and real corpus acceptance incomplete. **Proof:** `python/splitcart/preprocess.py:5,24`; `cli.py:42,57`; `parser.py:9,17`; `src/domain/ocr-contract.ts`; `python/tests/test_parser.py`.

### 6. Layered validation and household ownership constraints

**Built:** Runtime schemas, owner-scoped services, same-household composite foreign keys, image-owner/ledger guards, origin checks, and production development-bypass refusal.

**Problem solved:** Valid identifiers alone do not prevent attaching another owner's participant/item/image or accepting malformed native results.

**Internals:** Zod validates money/reference graphs and worker geometry. `ownedRow` joins receipt to owner household; composite keys protect nested relationships independently of API validation. Auth maps stable provider subjects to users; local identity requires explicit opt-in/loopback and refuses production.

**Why meaningful:** Defense at both service and relational boundaries demonstrates practical backend security reasoning.

**Evidence/impact:** Two-owner tests reject receipt/image/deletion access and cross-household payer references; database FK errors and origin/body/auth guards are checked. This is selected negative-test coverage, not a completed penetration test or comprehensive authorization proof.

**Status:** Implemented; real Google lifecycle unverified, and section 9 identifies provenance/limit gaps. **Proof:** `src/server/auth.ts:36`; `dev-identity.ts:1`; `receipts.ts:142`; `http.ts:16,21`; domain schemas; migrations 001/004; contract/integration suites.

### 7. Fault-oriented automated validation spanning three runtimes/layers

**Built:** Pure-domain/reference tests, real database tests, worker faults, Python image/parser/evaluator tests, and browser camera/manual/recovery workflows.

**Problem solved:** Mock-only happy paths would miss SQL constraints, native process leaks, financial edge cases, and lost-response user flows.

**Internals:** Vitest checks domain/service/route behavior; unittest exercises real validation subprocesses and fixed parser cases; Playwright supplies a synthetic video device while the app calls real local OCR. Selected network faults are injected deliberately. A per-document synthetic byte nonce separates duplicate identities across camera tests while repeats within a test remain identical.

**Why meaningful:** Uses appropriate real components while keeping quality claims separate from test mechanics.

**Evidence/impact:** Fresh 31 TS + 9 Python + 14 browser tests pass, along with typecheck/build/clean migrations. No coverage percentage, mutation score, real-device matrix, or CI reliability trend exists.

**Status:** Implemented and locally executed; remote CI configured only. **Proof:** `vitest.config.ts`, `playwright.config.ts`, all `tests/` and `python/tests/`, `.github/workflows/checks.yml`.

### 8. Consistent database-plus-image backup and isolated restore validation

**Built:** Operator tooling for migration integrity, consistent backups, isolated restores, maintenance, and actual app restart checks.

**Problem solved:** Restoring database rows without their receipt evidence—or copying images while references change—can leave an unusable application.

**Internals:** Backup holds SHARE locks on public tables while `pg_dump` and image copying run, then writes a checksum manifest. Restore uses a new database, checks referenced images and snapshot share sums, and retains output. Migration checksums detect changed applied SQL; replay is a no-op.

**Why meaningful:** Treats recovery as a verifiable application property with explicit write-availability tradeoffs.

**Evidence/impact:** Fresh clean install/replay/reconnect confirms four migrations. Historical recorded restore verified 7 receipts, 3 finalizations, and 1 referenced image; historical stop/start retained an 891-cent summary and identical finalization ID. Restore/restart were inspected but not rerun in this audit.

**Status:** Implemented and locally demonstrated; no target-host disaster recovery, RPO/RTO, encrypted off-host backup, or retention automation verified. **Proof:** `scripts/{migrate,backup,restore-check,clean-db-check,restart-check,maintenance}.ts`; runbook; release-validation log.

### 9. Recoverable human-review workflow that preserves edits

**Built:** Explicit payer selection, visible OCR uncertainty, individual adjustment eligibility, exact reconciliation, saved navigation, lost-import recovery, and guarded scan replacement.

**Problem solved:** A correct backend still fails users if OCR overwrites corrections, failed saves navigate away, or a general checkbox implicitly confirms unknown tax eligibility.

**Internals:** Pure helpers distinguish untouched graphs; latest extraction and reviewed source remain separate. Dirty refs/pending amount edits guard navigation; failed saves retain the screen and inputs; beforeunload warns. Native fieldsets disable editing during saves. New OCR imports remain unreviewed and version checked.

**Why meaningful:** Handles asynchronous state and recovery with financial consequences rather than treating OCR success as completion.

**Evidence/impact:** Browser tests reproduce busy→retry, rereading after edits, completed OCR after failed candidate save, failed navigation save, explicit payer, unknown amounts, and unload prompts. No measured reduction in manual effort or usability-study outcome exists.

**Status:** Implemented/local validation; source-review enforcement and content-confirmation trust remain qualified below. **Proof:** `src/domain/review.ts:4,18,72,123`; workspace `save`, `persistBeforeNavigation`, `reopen`, `retryReading`, `useScan`; `tests/e2e/review-fixes.spec.ts`.

### 10. Indexed cursor history with versioned participant lifecycle

**Built:** Deterministic keyset pagination, purchase/creation date filtering, applied-filter/cursor coordination, participant archive/restore, and stable historical names.

**Problem solved:** Offset-like UI assumptions can make older records unreachable; unapplied date edits can invalidate cursors; mutable participant names can rewrite apparent history.

**Internals:** History orders `(created_at,id)` descending and requests `limit+1`; its index matches household/order. Client applied filters stay separate from unsent input changes. Finalized names are snapshots, while live participants remain versioned labels.

**Why meaningful:** More interesting than CRUD because ordering, cursor state, and historical identity semantics are explicit.

**Evidence/impact:** Real PostgreSQL traversal returns 20+1 records with 21 unique IDs; browser fixtures exercise pagination/date behavior. No large-dataset query plan or measured speedup exists. Restore does not enforce the active-count limit.

**Status:** Implemented with the cap defect noted. **Proof:** `src/server/receipts.ts:84,454`; migration 001 history/name indexes; integration test at 293; browser regression at 113.

## 7. Verified and unverified metrics

### Directly supported measurements and finite correctness evidence

| Classification | Value | Calculation / supporting evidence | Limitations |
|---|---|---|---|
| VERIFIED — fresh | 31 TS tests / 8 files | `npm test`: 24 unit + 6 integration + 1 route case | Cases contain multiple scenarios; no coverage percentage |
| VERIFIED — fresh | 9 Python tests / 4 files | `npm run test:python`, unittest discovery | One is runtime foundation; image/parser/evaluation checks are synthetic |
| VERIFIED — fresh | 14 browser tests / 3 files | `npm run test:e2e`, fresh app process | Chromium fake camera; selected faults/identity/history mocked |
| VERIFIED — derived from fresh runs | 54 total runner test cases | 31 + 9 + 14 | Do not call these 54 unit tests or all acceptance criteria |
| VERIFIED — fresh cases | 1,250 exhaustive allocator inputs | 50 amounts (0–49) × 5 first weights × 5 second weights; `money.test.ts:26` | Small two-participant domain only |
| VERIFIED — mathematical count of test work | 31,875 reference candidate splits | 25 × sum(1..50) from inner enumeration | Not additional test cases or a performance benchmark |
| VERIFIED — fresh cases | 300 seeded receipt iterations | Fixed PRNG seed 42, `split.test.ts:98` | One-item positive-charge generated family, not all receipt topologies |
| VERIFIED — fresh | 2 concurrent calls → 1 snapshot | Integration test `Promise.all`; one `created:true`, one false, matching IDs | Not load testing or exactly-once native processing |
| VERIFIED — fresh | 21 unique history records across 20+1 pages | Real database integration test | Tiny dataset, not pagination performance |
| VERIFIED — fresh | 4 migrations; 2 apply passes; reconnect ledger 4 | `npx tsx scripts/clean-db-check.ts` creates/drops isolated database | Current check hardcodes four; no hosted migration proof |
| VERIFIED — fresh | Synthetic OCR total 600 cents | Native integration and camera browser test; fixture 349 + 200 + 51 | Single 800×650 generated receipt; no accuracy denominator |
| VERIFIED — fresh | Manual 891-cent two-person flow | `tests/e2e/manual.spec.ts` | Functional example, not volume or user impact |
| VERIFIED — historical documented execution | Restore: 7 receipts, 3 finalizations, 1 image | `docs/progress/release-validation.md`, implementation log; restore code inspected | Not rerun here; local dataset, no RPO/RTO |
| VERIFIED — historical documented execution | Restart preserves 891-cent snapshot and ID | `scripts/restart-check.ts`, recorded log | Not rerun here; not high availability |
| VERIFIED — repository absence evidence | 0 documented real corpus / 0 independent truth | Empty example manifest and `ocr-baseline.md` | Does not rule out receipts outside this repository; none supplied as evidence |
| VERIFIED — audit probes | 51 active participants after restore | Isolated synthetic create/archive/restore probe | Confirms cap defect, not supported capacity |
| VERIFIED — audit probes | Image-associated finalization succeeds without source ID | Isolated synthetic image metadata + reviewed manual graph; source ID null | Shows provenance is conditional; exact monetary checks still apply |
| VERIFIED — historical targeted measurements | Text contrast 4.80:1, 4.66:1, 4.51:1 vs prior 2.78:1 | Representative color pairs in acceptance-tests.md and current CSS | Not rerun here or a full accessibility audit; weak resume metric |

Fresh Vitest wall time was 2.84 seconds; Python reported 0.944 seconds; Playwright reported 15.5 seconds. These are single local suite executions, sensitive to warm caches/machine conditions. They are recorded for reproducibility, **not application latency or improvement metrics**. Production build passed; its individual compile-phase timing likewise does not establish user-facing performance.

### Configured limits, not achieved results

| Classification | Value | Source / qualification |
|---|---|---|
| CONFIGURED | 100,000,000 cents per field/receipt ($1,000,000) | Money/schema/domain bounds; not transaction volume |
| CONFIGURED | Up to 500 items, 100 adjustments, 25,000 assignments | `draftSchema`; maximum-size end-to-end performance not tested |
| CONFIGURED, incompletely enforced | Intended 50 active participants | Create path checks it; restore bypass confirmed |
| CONFIGURED | Integer weights 1–10,000 | Schema and SQL check; not percentage precision |
| CONFIGURED | 10 MiB image; multipart 10 MiB + 64 KiB | Stream/file bounds; not processing throughput |
| CONFIGURED | 25 million pixels; max dimension 12,000 | Decoder/schema limits; not tested quality at maximum resolution |
| CONFIGURED | 60-second Node deadline; 75-second persisted deadline | Worker and processing service; not processing speed |
| CONFIGURED | Tesseract run timeout 25 seconds per candidate | Python CLI; two sequential OCR candidates |
| CONFIGURED | 4 MiB worker stdout; 64 KiB stderr | Node supervisor; Python's inner subprocess buffering qualification below |
| CONFIGURED | Linux 2 GiB address space; 65 CPU seconds; 16 MiB file limit; 64 descriptors | Python RLIMITs; address-space bound absent on macOS; target host untested |
| CONFIGURED | One admitted decoder/OCR operation | PostgreSQL advisory lock 713205; no queue; not one request/second |
| CONFIGURED | Pool max 10 connections | `src/server/db.ts`; no measured connection-capacity benchmark |
| CONFIGURED | 90 mutations, 10 image transfers, 5 OCR calls per owner/minute | In-process rate maps; resets on restart; not distributed |
| CONFIGURED | 300 auth entries/minute globally | Auth handler limiter; not per-IP abuse protection |
| CONFIGURED | History default 20, max 50 | API schema; no large-history benchmark |
| CONFIGURED | Scratch/orphan age 120 seconds; maintenance batch 100 deletions | Recovery/script bounds; scheduler not provisioned |
| CONFIGURED | JWT session max age 7 days | Auth options; real provider/logout lifecycle unverified |
| CONFIGURED | Two preprocessing variants, PSM 6, low-confidence threshold 60 | Heuristics, not measured accuracy thresholds |
| CONFIGURED | Deskew: >=5 lines, 0.5–5° rotation, <=0.6° median deviation | `preprocess.py`; not measured skew tolerance |

### Estimated, planned, and unverified quantities

- **ESTIMATED/planning only:** 17–30 engineering days plus 20–30% contingency, approximately 21–39 days in TASKS.md. Not actual time spent or AI productivity.
- **PLANNED, not collected:** 24 consented captures from at least 3 stores, with grouped holdout and quality coverage. Household retail coverage was subsequently added; no resulting dataset exists.
- **UNVERIFIED:** Real line detection precision/recall, exact price/total/quantity recovery, real reconciliation rate, timeout/error rate, p50/p95 latency, throughput, memory peak, correction burden, manual-entry savings, number of users, production uptime, cost savings, accessibility compliance, remote CI, container build, hosted deployment, and real Google login/logout.
- Historical npm audit reporting zero vulnerabilities is a time-specific dependency-tool result, not a security certification or evidence that no vulnerabilities exist now.

### Realistic next benchmarks

1. Collect consented, redacted grocery and household receipt groups; independently transcribe readable prices/totals/quantities and source alignment. Freeze holdout groups before tuning. The existing 24-capture target is a pilot, not enough to claim broad generalization.
2. Save baseline, threshold, and selected outputs for each input; run the evaluator by store/quality. Report raw numerators/denominators and missed rows, not confidence averages as accuracy. The current CLI returns the selected candidate; an experiment harness must save both alternatives for a true comparison.
3. Instrument decode, preprocessing, each Tesseract pass, parsing, total request duration, timeout/failure counts, and peak RSS on a documented target host. Repeat runs with warm/cold conditions separated and enough observations for percentiles.
4. Benchmark money graphs across item/participant/adjustment counts; verify invariants while timing. Benchmark database saves/finalization and keyset history on synthetic larger datasets; use EXPLAIN ANALYZE and record indexes/hardware.
5. Test simultaneous edits/finalization/archive, OCR capacity rejection, disconnect/restart, and process resource exhaustion. Report admitted/rejected work separately from completed throughput.
6. Observe counterbalanced OCR-review versus manual-entry sessions on comparable receipts; report correction counts/time distributions and participant/sample size. Do not infer savings from fewer visible inputs.
7. Repeat backup/restore at growing database/image sizes; measure write blocking, backup duration, verified restore duration, and storage size before setting RPO/RTO.

## 8. Most impressive algorithms and technical decisions

### Largest remainder with deterministic ties

For amount A and integer weights wi, the primitive computes `qi = floor(A*wi/sum(w))` and `ri = A*wi mod sum(w)`, then assigns remaining cents by descending ri and ascending immutable IDs. The result sums exactly to A. For k recipients, the implemented sorting makes a single allocation O(k log k), ignoring BigInt operand cost. No full-engine asymptotic performance benchmark exists.

### Capacity-based explanation

Largest-remainder allocations can change nonmonotonically when the total changes, so independently rounding net and taxes by original weights can disagree with final shares. The implementation instead calculates final shares first, allocates net against those shares, and allocates each positive adjustment against remaining capacities. This is the best interview topic because it combines a subtle counterexample, an invariant, a concrete design, and tests.

### Explicit policy over inferred tax law

Line discounts precede receipt discounts; receipt discounts use current eligible net values; reviewed taxes/fees use post-discount eligible net values. Taxability is an explicit reviewed set. This is deterministic financial policy, not jurisdictional tax calculation.

### Stable identity and snapshots

Participant IDs decide rounding ties; display names never decide financial identity. Finalized names, inputs, and policy version are snapshots. Duplicate finalization is idempotent for the recorded input version, distinct from general exactly-once request execution.

### Preserve evidence rather than force reconciliation

Unknown prices remain null, quantity is descriptive, repeated names are retained, and one selected OCR run supplies rows. A mismatched total causes review failure rather than invented balancing charges. This provides a credible correctness boundary even when recognition is imperfect, subject to the source-provenance limitations below.

### Deliberate single-host boundary

Local subprocess OCR avoids a second HTTP service and third-party receipt handling. Its costs are request occupancy, native packaging, finite capacity, host-specific limits, and persistent storage. The ADRs explain when measured demand would justify a queue/service/storage redesign. This is sensible scope discipline, not proof of horizontal scalability.

### Recovery over false atomicity

Database finalization is atomic. Image staging/deletion uses compensation/outbox recovery. Backup obtains consistent referenced files by blocking writes. These distinct mechanisms address distinct failure boundaries and make useful system-design discussion.

## 9. Technical limitations and claim verification

### Confirmed or directly observable implementation gaps

1. **Participant restore bypasses the active-count cap.** `participant()` checks active count only when creating, not restoring. The audit created 50 active labels after archiving the initial label, restored it, and observed 51 active labels. This can conflict with the 50-share response schema. Do not advertise a uniformly enforced 50-person boundary. Source: `src/server/receipts.ts:84`, especially create-only check at 108–117; `splitSchema` share limit.
2. **Mandatory OCR source-line review is conditional on a client-supplied source reference.** `saveDraft()` verifies every source line only when `review.sourceAttemptId` is nonnull. It accepts a source-free manually reviewed graph associated with an image; the audit finalized such a synthetic graph. This may be desirable for manual fallback, but the API does not distinguish an explicit fallback transition from silently dropping OCR provenance. Say “source-aware review workflow,” not “the server guarantees every image's OCR lines are reviewed.” Source: `receipts.ts:274–310`; audit probe.
3. **Content-bound confirmation is primarily a UI convention.** `edit()` resets review and adjustment eligibility on changes; the API accepts a new complete graph with confirmation true rather than requiring a separate server-issued content acknowledgment. A boolean confirms client intent, not that a human read evidence. Exact monetary checks remain server enforced.
4. **Multi-query reads lack a consistent snapshot by default.** `getReceipt()` performs multiple independent SELECTs using the pool outside callers' transactions. A concurrent graph save can yield mixed versions/rows; `preview()` also loads household separately. This is a static concurrency risk, not a reproduced failure in this audit. Consider a consistent read transaction or single-query graph fetch. Finalize's receipt lock/transaction is stronger than ordinary reads.
5. **Participant mutation is not serialized with finalization.** Participant changes lock the household, while finalize locks the receipt and reads household/participants without matching that lock. Archive-versus-finalize semantics merit race tests; FK ownership is enforced, but active-state consistency is an application rule. Static review concern, not a measured race result.
6. **Not all caps are tested end to end.** Full graph saves execute individual SQL statements for rows/targets/assignments. 500 items × 50 assignments can create 25,000 assignments; the 2 MiB JSON bound may reject some schema-maximum payloads. Configured collection maxima are not proven usable maxima.
7. **Parser scope is narrow.** Merchant and purchase date are always null from `parse`; wrapping uses line order/adjacency rather than a general geometric layout engine. Coupons default to receipt discounts with unknown eligibility. No perspective correction or robust blur/glare/crop classifier exists. Tesseract supplies recognition; the project did not build/train the OCR engine.
8. **Confidence selection is uncalibrated.** Higher average token confidence may prefer a candidate that omitted difficult rows. There is no development comparison establishing improved extraction. Traineddata hashes are recorded, but native packages/data are not enforced against approved pinned hashes in code.
9. **Native limits are not a complete sandbox.** Python is not denied network access by an OS sandbox. Linux gets an address-space RLIMIT; macOS does not. Inner `subprocess.run(capture_output=True)` buffers Tesseract output before Python checks its length. Resource bounds and filesystem permissions require target-host verification.
10. **Operational scripts trust operator-owned artifacts.** Backup/restore path checks use resolved lexical paths, not comprehensive symlink containment; restore manifest handling is not the full runtime schema validation used by APIs. They should not be presented as safely accepting hostile backup packages.

### Release, security, and scalability limitations

- Real Google credentials/provider redirects/sign-in/sign-out are unverified. A mocked hosted account label and sign-out link are not provider authentication evidence. JWT logout/revocation behavior is not established by the suite.
- Local development uses a loopback trust-auth PostgreSQL cluster and an opt-in local organizer. These are development conveniences, not production security configuration.
- Owner checks and relational constraints exist, but no row-level security, role deployment verification, independent security audit, penetration test, encryption-at-rest implementation, or complete authorization-path coverage is demonstrated.
- The route-contract cross-owner loop accepts 422 invalid-contract responses as well as 404. Some branches therefore establish rejection before ownership lookup rather than testing a valid foreign request all the way through. Cross-owner multipart upload, every nested attack, and all valid unauthorized route shapes are not exhaustively tested.
- Rate limiting is process-local; the auth limit is global, not per-IP. A production reverse proxy must supply trusted origin/host configuration, HTTPS, body/time limits, and abuse protection.
- Advisory locking gives database-wide admission control but no durable work queue, fairness, automatic busy retries, horizontal storage sharing, or measured multi-instance capacity. One admitted operation is a concurrency bound, not scalable parallel OCR.
- Docker packaging is provided but unbuilt; native apt packages/base digest are not fully reproducible. The image installs development dependencies and is not an optimized multistage runtime image.
- Remote GitHub Actions execution, real hosting, physical phone capture, HTTPS, backup retention/expiry, encrypted off-host storage, target-host memory/process/restart/restore checks, and usefulness acceptance remain open.
- The React workspace is approximately 2,092 lines with numerous UI/orchestration responsibilities and manual client response types. It is functional but would benefit from smaller workflow components/hooks, centralized response contracts, and clearer state transitions.
- No continuous crash-proof autosave exists: internal navigation saves; unload warns. Browser/process crash can lose unsaved work. No full accessibility, Safari/Firefox, physical-device, or real-user study is verified.
- Some documentation is historical or stale: prior upload/import UX, graceful termination/escalation language (code directly uses SIGKILL), “geometry-aware” parsing, old test counts, unit-price correction references, and pinned language-data expectations need qualification. Current code and fresh runs take precedence. No compose file exists despite the original proposed layout mentioning one.
- Specifications list reliability cases more broadly than implemented tests: explicit stderr overflow, actual hard-kill recovery, maximum memory pressure, many-target overlapping discounts, large graph performance, and complete immutable-ledger tampering coverage need additional tests. No coverage percentage or formal proof is available.

### Hiring-manager assessment

| Question | Evidence-based assessment |
|---|---|
| Single most impressive accomplishment? | Exact financial allocation with capacity-consistent decomposition |
| Strongest problem solving? | Recognizing that independent component rounding can contradict final shares, then designing invariant-preserving decomposition |
| Strongest backend evidence? | Row-locked/versioned finalization, relational ownership constraints, idempotent retries, immutable snapshots |
| Strongest algorithmic evidence? | BigInt largest remainder, stable ties, ordered eligible adjustments, independent exhaustive reference checks |
| Strongest system design? | Clear TS/Python/database boundaries and explicit DB/filesystem/process failure models |
| Strongest correctness evidence? | Real SQL concurrency/rollback tests plus reference/generated monetary invariants |
| Different from common student apps? | Money invariants and native process/recovery engineering have meaningful edge cases beyond ordinary CRUD |
| Technically shallow features? | Landing-page illustration, account labels, category titles, ordinary create/read forms, sign-out link presence |
| Redundant accomplishments? | Exact rounding/reconciliation/BigInt are one theme; transactions/idempotency/immutability are another; CV/parser/OCR are one pipeline |
| Strongest interview material? | Rounding counterexample, concurrent finalization, subprocess descendants, file/database compensation, evaluation denominator design |

Do not turn each related safeguard into a separate resume bullet. Three cohesive technical stories are stronger than three overlapping correctness claims.

## 10. Top 3 recommended resume bullet themes

These are theme specifications, not final bullet sentences. Ranking prioritizes general Big Tech SWE recruiting and defensible implementation depth.

| Rank | Theme | Action → implementation → result structure |
|---|---|---|
| 1 | Deterministic financial allocation | Implement/design → BigInt largest remainder + ordered adjustments + capacity decomposition → exact, reproducible participant/component reconciliation |
| 2 | Transactional backend consistency | Design/build → PostgreSQL row locks + optimistic versions + immutable snapshots + idempotent finalization → prevent tested stale writes/duplicate snapshots/partial graph mutations |
| 3 | Reliable local receipt-processing pipeline | Build/integrate → OpenCV/Tesseract through supervised Python subprocesses + validated contracts + durable attempts → camera-to-review automation with bounded failures and edit preservation |

### Theme 1 details

- **Accomplishment:** Exact-cent weighted splitting and mathematically consistent explanations.
- **Technical details worth mentioning:** BigInt, deterministic largest-remainder rounding, discount/tax ordering; capacity decomposition if it fits or is reserved for interviews.
- **Strongest metric:** 1,250 exhaustive small allocation inputs plus 300 seeded receipt cases; conservation to the cent in tested cases. Choose a compact metric rather than squeezing both into one line.
- **Action verbs:** Implemented, designed, validated. Use “designed” only if personal design ownership is confirmed.
- **ATS:** TypeScript, algorithms, BigInt, deterministic allocation, financial calculations, automated testing.
- **Recruiter value:** Demonstrates precision, edge-case reasoning, and verifiable problem solving.
- **Omit:** Dollar defensive cap, ordinary input widgets, vague “100% accuracy,” invented error reduction, formal-proof language, every adjustment type.

### Theme 2 details

- **Accomplishment:** Reliable authoritative finalization and historical integrity under retries/concurrent calls.
- **Technical details worth mentioning:** PostgreSQL transactions, row locking, optimistic concurrency, unique constraints, snapshots/idempotency.
- **Strongest metric:** Two simultaneous finalization calls yield one immutable snapshot and the same saved ID; this is correctness evidence, not a scalability number. The six integration cases can support discussion, but table/test counts are weaker than the behavior.
- **Action verbs:** Engineered, implemented, designed, enforced.
- **ATS:** PostgreSQL, SQL, transactions, concurrency control, idempotency, REST APIs, data integrity, relational database design.
- **Recruiter value:** Shows backend work beyond CRUD and an understanding of races, retries, and persistent state.
- **Omit:** 14-table count as the headline, claims of zero duplicate transactions in production, “distributed database,” “exactly-once system,” or proven high throughput.

### Theme 3 details

- **Accomplishment:** Integrated camera capture, preprocessing, conservative extraction, and supervised native execution while preserving reviewed edits.
- **Technical details worth mentioning:** Python, OpenCV, Tesseract, process-group timeouts, versioned/runtime-validated JSON, persisted attempt recovery. Choose two or three; one resume line cannot carry the complete pipeline.
- **Strongest metric:** 14 browser workflow tests, with real native OCR in selected synthetic camera cases, or the specific tested timeout/descendant-recovery behavior. There is **no strong real-world OCR quality/latency metric yet**. Configured bounds may describe implementation if explicitly labeled, but are weaker than measured outcomes.
- **Action verbs:** Built, integrated, orchestrated, hardened, validated.
- **ATS:** Python, OpenCV, OCR, Tesseract, image processing, subprocess supervision, fault recovery, runtime validation, Playwright.
- **Recruiter value:** Distinctive cross-language integration and operating-system reliability work.
- **Omit:** Model training, “AI-powered” as a substitute for specifics, cloud API claims, invented accuracy/speed/manual-work savings, or production deployment.

For three one-line bullets, do not repeat the entire stack in every line. Let theme 1 establish algorithms/TypeScript, theme 2 database/backend consistency, and theme 3 image/native integration. Keep test counts as supporting evidence rather than making all three bullets about testing. Backup/restore is an excellent interview extension or alternate theme if the student personally owned it more deeply than OCR integration.

## 11. Relevant ATS keywords

**Directly supported:** TypeScript, JavaScript, Python, React, Next.js, Node.js, PostgreSQL, SQL, REST API, Zod, runtime validation, BigInt, integer arithmetic, largest-remainder allocation, deterministic algorithms, transactions, optimistic concurrency control, row-level locking, idempotency, foreign keys, database constraints, immutable snapshots, OAuth integration, Auth.js, OpenCV, Tesseract, OCR, image preprocessing, SHA-256, subprocess supervision, process groups, fault recovery, unit testing, integration testing, contract testing, end-to-end testing, Vitest, Playwright, unittest, database migrations, backup/restore.

**Use only with qualification:** Docker packaging, GitHub Actions configuration, CI pipeline configuration, security hardening, resource limits, camera capture, single-host architecture, Google authentication integration.

**Avoid as accomplishments without new evidence:** Kubernetes, AWS/GCP/Azure deployment, Redis, Kafka, microservices, serverless OCR, distributed job processing, horizontal scalability, production monitoring, model training, machine learning research, payment processing, high availability, WCAG compliance, real-user adoption, measured latency/accuracy improvement.

## 12. Potential interview talking points

1. Derive largest-remainder allocation and explain stable UUID ties. Why can equal shares differ by one cent, and why is that deterministic?
2. Show the failure mode of independently rounding net/tax and explain remaining-capacity decomposition. Which invariants does it preserve, and which “fairness” interpretation is a policy choice?
3. Walk through the two concurrent finalization calls. Where is the lock acquired, which version is recorded, and why does an exact retry return 200 instead of creating another result?
4. Explain why the server ignores client-calculated shares and recomputes from persisted input. Contrast preview reads with finalization's transaction and discuss the read-consistency gap honestly.
5. Explain composite foreign keys for same-household references and why owner lookup is still required. Identify what SQL triggers enforce versus application checks.
6. Describe killing an entire process group instead of only Python. Discuss aborts, pipes, output bounds, native descendants, and Linux-versus-macOS memory limits.
7. Describe a crash between file move and SQL commit, then between SQL deletion and file deletion. Explain staging/compensation versus outbox recovery.
8. Explain EXIF normalization, bounded deskew, inverse box mapping, and candidate selection. Acknowledge why confidence does not establish semantic accuracy.
9. Discuss repeated items, quantities, tender lines, ambiguous totals, and why forcing the total to reconcile would conceal errors.
10. Explain matched-price accuracy versus end-to-end price recovery. Why must missed rows count in a denominator, and why group repeated receipt captures together for holdout?
11. Discuss why a single-host subprocess was chosen over FastAPI/queues, what busy responses mean, and what measured evidence would trigger a redesign.
12. Explain backup SHARE locks and their write-availability cost. What must be measured before promising recovery objectives?
13. Explain the confirmed participant-cap and provenance gaps and propose small, testable fixes. Identifying boundaries candidly is more defensible than claiming flawless security.
14. Describe how AI assistance was used, what was independently verified, and which concrete changes/debugging decisions were personally owned.

## 13. Questions requiring clarification from the student

1. Which modules/algorithms did you personally design and implement, versus direct, review, or accept from an AI assistant? Which bugs did you diagnose and fix yourself?
2. Can you explain and reproduce the capacity-based rounding argument and concurrency behavior without relying on generated text?
3. Have actual roommates/users tried the app? If so, how many, when, on which devices, and where is consented usage evidence?
4. Do real consented/redacted grocery or household receipts and independently checked truth exist outside the supplied repository? No such corpus can be assumed here.
5. Is there a real hosted instance, successful Google sign-in/sign-out, remote CI run, or container build whose logs can be supplied? Current source/docs do not establish them.
6. Have correction time, manual entry time, native latency, failure rate, memory usage, or backup/restore time been measured under a documented protocol?
7. What date range and actual effort reflect your personal contribution? TASKS estimates do not answer that question.
8. Was the project built alone or with collaborators, and what attribution is appropriate? Git/commit evidence is absent in this directory.
9. Should manually replacing a photo's extraction explicitly preserve an audited fallback transition? The current provenance behavior needs a product/security decision before an absolute review guarantee.
10. Which of the three technical themes best reflects work you can defend in depth? Ownership may justify changing the ranking for your particular resume.

These questions are not prerequisites for documenting repository facts, but answers are necessary for personal-impact and authorship claims.

## 14. File/function evidence index and audit method

### High-value implementation references

| Claim | Primary implementation | Supporting test / documentation |
|---|---|---|
| Lexical exact-money handling | `src/domain/money.ts:3,10,23` | `tests/unit/money.test.ts:4`; expense-splitting specification |
| Largest remainder and stable ties | `src/domain/money.ts:29` | `money.test.ts:11,26` |
| Ordered adjustments / decomposition / payer | `src/domain/split.ts:10` | `tests/unit/split.test.ts:39,48,98,139,175,209,236` |
| Draft/snapshot runtime contracts | `src/domain/contracts.ts` (`draftSchema`, `splitSchema`) | `tests/unit/http.test.ts`; API/database specs |
| OCR graph and geometry validation | `src/domain/ocr-contract.ts` (`ocrSchema`, `validatedSchema`, `workerErrorSchema`) | HTTP/worker/native integration cases |
| SQL transaction helper / pool | `src/server/db.ts:7` | Real database integration suite |
| Owner establishment and lookup | `src/server/receipts.ts:13,48,142` | Contract/integration owner tests |
| Versioned graph replacement | `src/server/receipts.ts:269` (`saveDraft`) | Integration at 72/108; browser failed-save scenarios |
| Authoritative preview/finalization | `src/server/receipts.ts:397,403` | Integration concurrency/immutability/mismatch cases |
| Cursor history | `src/server/receipts.ts:454` | Integration at 293; browser at 113 |
| Participant lifecycle / cap gap | `src/server/receipts.ts:84` | Account browser case; isolated audit probe |
| Authentication / local refusal | `src/server/auth.ts:36`, `dev-identity.ts:1`, `next.config.ts` | Dev identity tests; historical production checks |
| Origin/body/error/rate guards | `src/server/http.ts:16,21,44,110` | `tests/unit/http.test.ts` |
| HTTP endpoint dispatch/contracts | `src/app/api/v1/[...path]/route.ts` (`handle`) | `tests/contracts/routes.test.ts:63` |
| Auth/library routing and liveness | `src/app/api/auth/[...nextauth]/route.ts`, `src/app/api/health/route.ts` | Provider limitation in release-validation.md |
| Private bounded image lifecycle | `src/server/images.ts:30,56,176` | Native integration at 157; `python/tests/test_images.py` |
| Durable attempt recovery / capacity | `src/server/images.ts:211,234` | Integration at 242; browser busy/recovery cases |
| Retriable physical deletion | `src/server/images.ts:323,349` | Integration at 256 |
| Native supervision | `src/server/worker.ts:6,116` | `tests/unit/worker.test.ts` |
| Actual decode / native OCR | `python/splitcart/cli.py:28,42,57` | Python image suite; synthetic native integration/browser cases |
| Deskew / inverse geometry | `python/splitcart/preprocess.py:5,24` | Pipeline source; no dedicated comprehensive geometry regression suite |
| Conservative parser | `python/splitcart/parser.py:9,17` | `python/tests/test_parser.py` |
| Evaluation counts and split guards | `python/splitcart/evaluate.py:18,38` | `python/tests/test_evaluation.py`; empty manifest; ocr-baseline.md |
| Review/recovery helpers | `src/domain/review.ts:4,18,72,123` | `tests/unit/review.test.ts` |
| Camera/manual/navigation orchestration | `src/components/workspace.tsx` (`camera`, `capture`, `save`, `reopen`, `retryReading`, `useScan`) | Manual/photo/review-fixes browser suites |
| Reconciliation/warnings/mobile evidence | `src/components/review-tools.tsx` | Photo workflow tests |
| Account controls / styling | `src/components/account-people.tsx`, `src/app/globals.css`, `src/app/layout.tsx` | Account/focus/layout browser checks; metadata still grocery-focused |
| Relational/immutability enforcement | `db/migrations/001_core.sql`, `002_immutability.sql`, `003_images.sql`, `004_snapshot_guards.sql` | Real SQL tests; clean migration script |
| Migration integrity | `scripts/migrate.ts` | `scripts/clean-db-check.ts`; fresh audit run |
| Backup/restore integrity | `scripts/backup.ts:44`, `scripts/restore-check.ts` | Historical release-validation/log; runbook |
| Restart/recovery operations | `scripts/restart-check.ts`, `scripts/maintenance.ts`, `scripts/doctor.ts`, `scripts/local_db.py` | Fresh doctor; historical restart/maintenance evidence |
| Reproducible synthetic camera fixture | `scripts/synthetic_receipt.py`, `scripts/camera_fixture.py`, `tests/e2e/camera-fixture.ts` | `tests/fixtures/synthetic-receipt.png`, Playwright config |
| Dependency/tool/build configuration | `package.json`, `package-lock.json`, `python/requirements.txt`, `tsconfig.json`, test configs, `next.config.ts`, `next-env.d.ts` | Fresh typecheck/build/native probes |
| Deployment/CI intentions | `Dockerfile`, `.github/workflows/checks.yml`, `.dockerignore`, `.gitignore`, `.env.example` | Runbook and explicit unrun release gates |
| Milestone/status/architecture rationale | `AGENTS.md`, `TASKS.md`, README, all specs/ADRs/progress files | Actual code/tests take precedence over historical wording |

Line numbers are snapshot navigation aids, not permanent identifiers; function and test names are more stable.

### Audit scope

Reviewed authored source, SQL migrations, scripts, unit/integration/contract/browser/Python tests, fixture generation/manifest, dependency manifests/lock metadata, build/test/container/CI configuration, specifications, ADRs, progress records, and runbook. Generated dependency trees, caches, binary build artifacts, PostgreSQL internals, private runtime receipts, and secret environment values were not treated as source to reproduce. All project access stayed inside the requested directory; installed system tools were used normally.

Fresh commands on October 17, 2026:

```text
npm run typecheck                  PASS
npm test                           PASS: 31 tests, 8 files
npm run test:python                PASS: 9 tests
npm run test:e2e                   PASS: 14 tests
SPLITCART_DEV_AUTH=0 npm run build  PASS
npm run doctor                    PASS: DB, OpenCV, Pillow, Tesseract
npx tsx scripts/clean-db-check.ts  PASS: four migrations, no-op replay, reconnect
git rev-parse --is-inside-work-tree No Git repository present
```

The browser run owned a fresh local server to avoid accumulated process-local rate counters; the development server was restarted afterward. The audit's isolated synthetic database probe cleaned up its user/household/participants/receipt metadata and did not touch user receipts. Its reproduction script remains project-local at `.data/resume-audit-check.ts` (ignored runtime artifact); its two outputs are recorded in this report. No application code was changed to hide the findings. Backup/restore, real production-start auth checks, and actual application restart results are attributed to existing historical evidence, not falsely presented as freshly rerun.

The most defensible three-theme selection is financial algorithms, transactional backend integrity, and reliable local OCR integration. Final wording must reflect the student's confirmed ownership and must not convert synthetic correctness tests or configured limits into real-world performance claims.
