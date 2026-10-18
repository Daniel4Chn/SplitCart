# Implementation log

## 2026-10-16 — Planning draft

Authorization: repository inspection and specification creation only. Application implementation is not approved.

Discovery: workspace empty; no Git metadata, dependencies, application, reusable code, or applicable ancestor AGENTS.md. Node/npm, Python, and PostgreSQL client executable paths found; Tesseract/Docker absent from PATH. No runtime compatibility, database connectivity, installed Python package, or hosting capability claims made.

Delivered: product/MVP requirements, architecture/tradeoffs, image and parsing contracts, deterministic money policy, database and API contracts, acceptance/evaluation strategy, proposed ADRs, eight detailed milestones, AGENTS.md, TASKS.md, README.md.

Validation: documentation completeness, link/requirement traceability, and internal consistency review only. No application tests, OCR experiments, corpus collection, dependency installs, migrations, or infrastructure provisioning performed. No accuracy/performance measurements exist.

Key risks: native deployment/resource bounds; variable receipt layouts and correction effort; money rounding/adjustment ordering; exact graph ownership; DB/file cleanup consistency; missing consented evaluation corpus; OAuth stable-version/provider configuration.

Next recommendation: user approves the plan and authorizes M0; then implement M0 and stop with its evidence report. All ADRs remain proposed until approval is recorded explicitly.

## Future milestone entry template

- Milestone / authorization reference:
- Specifications and acceptance IDs:
- Changes and meaningful decisions:
- Test commands, environment, and results:
- Acceptance evidence and unmet/unrun criteria:
- Specification/ADR/task updates:
- Risks, blockers, and next recommendation:
- Stop/continuation authorization:

## Build authorization — 2026-10-16

User approved the specifications and plan and explicitly authorized continuous M0–M7 implementation without milestone pauses. Material scope/cost changes and externally required permissions still apply.

## 2026-10-17 — Authorized continuation; M0–M3 validation and M4–M6 implementation

Authorization: user explicitly reconfirmed continuous M0–M7 and project-directory-only file access. Stale approval headings updated. Historical planning entries above remain historical.

- M0 / A-FOUND-1: fixed @next/env CommonJS interop; development identity accepts minimal environment objects. Migration ledger applied 001, 002, 003 successfully. Doctor connected PostgreSQL 15.18, imported OpenCV 4.13.0/Pillow 12.2.0, and probed Tesseract 5.5.3. Node 22.18.0/npm 10.9.3/Python 3.14.7. Initial production webpack build passed. Installed Chromium in project-local .data/playwright for browser verification. Clean setup and final build checks ongoing.
- M1 / SPL-01..09 / A-SPL-1,2: 300 seeded allocation cases, independent exhaustive two-weight enumerator, worked 8.91/15.00 vectors, caps/zero/archived/orphan/duplicate/zero-net cases passing. Policy largest-remainder-v1. Additional field-error audit ongoing.
- M2 / A-SPL-3 / A-DB-1,2 / A-API-1,3: real PostgreSQL tests cover rollback, stale writes, cross-owner reads/participant references, concurrent duplicate finalization, immutable graph updates and mismatch failure without snapshot. A discovered item-allocation deletion FK issue fixed via forward migration 002. Mobile Chromium manual flow (390×844) passed entry → preview → finalization → reload → history exact $8.91. UI includes participants, ratios, adjustment eligibility, server preview, component breakdowns and immutable history.
- M3 / IMG-01..08 / A-IMG-1..4: bounded multipart, signature and isolated decode validation, original/display storage, owner/hash uniqueness, advisory-lock capacity, durable deadlines, worker process groups, timeout/overflow/missing-engine failures, cleanup outbox and orphan sweep implemented. Native synthetic image integration passed original byte preservation, private image denial, owner-isolated duplicate handling, edit preservation during OCR, strict result schema and expired-attempt recovery. Worker descendant-kill test passed. Further hostile-image and cleanup fault checks ongoing.
- M4 / PAR-01..07: conservative deterministic parser implemented; five Python tests currently passing (foundation plus four parser groups). Synthetic native OCR recovered the generated $6.00 total. This is a smoke test, not a real-receipt quality benchmark. Corpus/independent ground truth remain absent; A-PAR-3 not passed.
- M5 / A-UX-1..3 / A-DB-3: source image, extraction state, explicit candidate import, line classification, correction, review reset and deletion UI implemented. Native service checks pass; photo browser and cleanup failure tests ongoing.
- M6 / A-API-2 / A-SEC-1: installed Auth.js v4.24.15 source awaits Next.js asynchronous headers/cookies. Provider configuration and owner mapping present; private origin checks and ownership service tests pass. Real Google provider login not verified; credentials/configuration gate remains open.

Commands executed: npm run typecheck (pass); npm test (18 tests pass); npm run test:python (5 tests pass); npm run test:e2e (1 mobile manual test pass); npm run db:migrate (pass); npm run doctor (pass); initial npm run build (pass). Later changes will require final regression run. No deployment, real OCR accuracy, user-burden or provider verification claimed. Continuing autonomous authorized work.

## 2026-10-17 — Final local validation and external release gates

Authorization: continuing the same approved M0–M7 scope, without milestone pauses. All project file reads/writes stayed in the project; installed tools used normally. No sub-agents, external messaging, paid services or credential printing.

- M0 / A-FOUND-1: `npm ci --cache .data/npm-cache` succeeded (100 packages, npm audit reported 0 vulnerabilities). `.venv/bin/pip check` reported no broken requirements. `npx tsx scripts/clean-db-check.ts` created a separate empty database, applied all four migrations, replayed migrations as no-op, reconnected and verified four ledger entries, then removed that isolated setup database. Doctor passed. Native fresh-host installation/container build remain unverified M7 checks.
- M1 / A-SPL-1,2: all worked vectors and invalid graph/seeded/exhaustive allocation groups pass. Extended printed quantity=2, line price=349 case passes. Business-rule failures include field paths and actionable zero-net eligibility guidance. Pure policy remains largest-remainder-v1.
- M2 / A-SPL-3 / A-DB-1,2 / A-API-1,3: real DB and mobile manual workflows pass; `npx tsx scripts/restart-check.ts` actually stopped/restarted the Next.js process and reopened the identical finalized $8.91 summary and finalization ID, then deleted its synthetic receipt. Stale saves and missing/mismatched amounts preserve saved graph.
- M3 / A-IMG-1..4: native worker/image checks pass locally; strict expected-error schema and attempt-ID validation fixed error mapping (IMAGE_UNREADABLE=422, OCR_FAILED=502). Runtime candidates/drafts/snapshots validated on read. Source-line IDs validated within the referenced attempt. Host Linux memory/resource/engine-package pinning and actual hard-crash/container checks remain M7 release gates, not claimed executed locally.
- M4 / A-PAR-1,2: parser fixtures and evaluator denominator regression pass. `python/splitcart/evaluate.py` reports raw grouped counts from independently aligned saved predictions, rejects split leakage/absent consent/empty corpus, and does not infer human burden. `ocr-baseline.md` records 0 real receipts and all unmeasured quantities. A-PAR-3 remains blocked on corpus/ground truth; no numeric quality target fabricated.
- M5 / A-UX-1..3 / A-DB-3: mobile native photo import/correction/eligibility/source-line review/finalize/delete pass. Immutable historical names survive participant rename; injected directory-as-file deletion failure becomes failed and retries to complete. `reviewSource` remains the exact saved attempt when newer OCR runs exist. History filters/pagination, source download, unit-price correction, manual fallback and cleanup retry are functional. Screenshot `.data/screenshots/photo-final.png` visually inspected: readable mobile forms and exact $6.00 synthetic summary. M4 real quality gate remains open.
- M6 / A-API-2 / A-SEC-1: signed-out actual production API returned 401 UNAUTHENTICATED; health/auth session/sign-in routes returned 200. Production startup with SPLITCART_DEV_AUTH=1 explicitly refused. Two-owner/CSRF/contract tests pass. Real Google sign-in/sign-out is NOT verified and M6 remains incomplete pending credentials/provider setup. Development household is never silently transferred.
- M7 / A-DB-4 / A-REL-1..3: consistent local backup and isolated restore passed: 7 receipts, 3 finalized snapshots, 1 referenced image; original/display SHA-256 and exact share sums verified. Restore retained at splitcart_restore_480db46d9b0945f89cdddc3dcf26a1e9 and project-local .data/restore/. Maintenance sweep passed. Dockerfile, CI configuration, backup/restore/maintenance/restart tools and runbook delivered. Docker/remote CI/target-host deployment are unrun; host/budget, HTTPS, retention, real OAuth, corpus/holdout/user review and explicit usefulness approval remain required. M7 NOT COMPLETE.

Final executed checks: `npm run typecheck` pass; `npm test` 26 tests across 7 files pass; `npm run test:python` 9 tests pass; `npm run test:e2e` 3 mobile Chromium tests pass; `SPLITCART_DEV_AUTH=0 npm run build` pass; targeted M1 rerun 11 tests pass after field-message refinement. Migration/doctor/clean DB/restart/maintenance/backup/restore evidence above. Formatting used a pinned one-shot Prettier 3.6.2 without adding a project dependency. A TypeScript-printer formatting attempt was unavailable in installed TS7 and made no edits; no functional impact.

Specifications, acceptance map, task statuses and README synchronized. Local implementation is delivered and independently executable work is validated; no claim that all M0–M7 acceptance or hosted release is complete. Next required inputs: consented real corpus/independent truth, Google OAuth configuration, and approved host/budget/HTTPS/retention. Continue those release gates when inputs are available under the existing authorization; material architecture/cost changes still require approval.

Final scope audit: unknown candidate adjustment eligibility visibly defaults to all proposed items, with eligibilityConfirmed=false until explicit review (approved product A-03); unsupported formats/currencies and rounding explanation are explicit in the UI. Mobile workflow and build rechecked after this adjustment.

Metadata audit: explicitly clear normalized Pillow image info after EXIF orientation, preventing PNG save from carrying residual EXIF. Added a JPEG orientation/metadata-removal regression; original bytes remain untouched. Native image integration and Python suites rechecked.

## 2026-10-17 — User-directed camera and household/manual redesign (M2/M5)

User explicitly requested a substantially simpler, better UI: take the photo directly and find items automatically; support household items, and allow receipt-free manual item/cost/sharing entry. ADR-003 records the decision; product/API/processing/task documentation synchronized. Approved architecture and exact monetary rules remain.

Replaced the form-heavy homepage with a responsive camera/manual choice, calm olive/cream design, illustrative receipt, compact review rows and sharing name chips. No file-input, separate extraction button or separate import button in the main flow. A shutter captures the browser camera, sends the JPEG privately, invokes real local OCR and stores a source-linked unreviewed draft automatically. Review and explicit finalization remain required. Same-byte duplicate captures reopen existing receipts and remove the unused empty draft. Camera permission failures are actionable; tracks stop on capture/cancel/unmount, including canceled pending requests. No external font/image dependency was added.

Manual entry now supports Groceries/Household items labels, item name, dollar cost and who to share with, plus the payer. No receipt, printed-total entry, source-line classification or separate review step is required for this receipt-free route. Its displayed and persisted total is derived solely from known entered integer-cent costs via BigInt; missing names/costs/sharing block preview. Photo receipt totals still reconcile against reviewed evidence and are never auto-balanced.

Validation: TypeScript checks pass; existing 26 TypeScript tests pass. New browser regressions use a project-local synthetic Y4M camera stream and actual OCR, covering automatic capture flow, corrected $6.00 photo split, receipt-free $8.91 household split across two named participants, missing item/cost error, history reload, duplicate-photo reopen, denial and camera-track cancellation, plus desktop overflow. Screenshots home-desktop/home-mobile/review-mobile/manual-mobile/camera-summary in .data/screenshots visually inspected. Final browser/build outcomes recorded after completion. This does not claim real physical-camera verification or real receipt accuracy.

Release gates still require consented real receipts (including household retail layouts), OAuth verification and approved host/HTTPS/retention/usefulness acceptance. Local UI work continues under existing authorization without milestone approval pauses.

Redesign final validation: `npm run typecheck` passed; `npm test` 26 passed; current `npm run test:e2e` 5 passed (household manual, automatic camera/OCR/correction/duplicate reuse, permission denial, desktop layout, camera track shutdown); `SPLITCART_DEV_AUTH=0 npm run build` passed. Mobile and desktop screenshots inspected. Development app restarted at 127.0.0.1:3000 for user review. No physical phone camera or real household-receipt accuracy claim; external release gates remain open.

## 2026-10-17 — Independent review findings corrected (M2/M3/M5/M6)

Authorization: user explicitly requested a subagent's independent review, then directed fixing the findings. The independent subagent reviewed read-only with no edits; its follow-up confirmed all seven original areas addressed and flagged an unapplied-date/pagination edge case, fixed with a targeted browser regression.

- Saved work / A-UX-2, A-API-3: internal navigation persists current draft refs and blocks leaving on a failed save. Reload/exit has a native unsaved-work warning. Editing is disabled with a native fieldset during saves; failed saves retain inputs. No receipt content is cached in browser localStorage. Latest versions remain authoritative; conflicts are not blindly retried/overwritten.
- Payer / SPL-08: removed alphabetical/default-first payer selection. New manual/photo drafts require an explicit payer choice, tested after adding a roommate whose name sorts before You. No user/organizer identity is inferred from mutable participant names.
- Review / PAR-06, SPL-07, A-UX-1,2: visible image/item/adjustment uncertainty, separate eligibility confirmation per adjustment, and exact BigInt subtotal/discount/fee/printed-total/difference breakdown. The general receipt checkbox no longer confirms eligibility. Missing costs/adjustment amounts remain unknown rather than displayed as zero. Server finalization rules unchanged.
- History / A-UX-3: Load more, dates/date-source labels and date filters; applied filters stay paired with the current cursor independently of unapplied edits. A real PostgreSQL 21-receipt test verifies cursor/date behavior; browser fixtures cover the paging UI and unapplied-date sequence.
- Scan recovery / IMG-07,08, A-IMG-3,4: saved-photo Retry reading/Refresh; successful attempts automatically recover only completely untouched drafts; rereading preserves edited graphs and explicit replacement asks for confirmation. A duplicate capture also recovers a completed untouched draft instead of reopening it empty. Native OCR tests inject busy and interrupted-import failures using a synthetic camera feed, without claiming real accuracy.
- Mobile/deletion / A-UX-1, A-DB-3: expandable inline photo with zoom/scroll; unfinished manual/review drafts can be deleted immediately. Deletion cleanup state and retry are visible, with no false complete claim. Critical small-screen text darkened, touch targets enlarged, and mobile text/amount inputs set to 16px; measured representative contrast pairs recorded in acceptance-tests.md. Review/account screenshots visually inspected. No full accessibility certification claimed.
- Account/household / P-08, A-API-2: owner-scoped household account display metadata, accurate local/hosted/signed-out identity, hosted auth-library sign-out link, native focus-trapped account dialog, and participant rename/archive/restore. Active participants appear first; archived names are folded away. Historical name snapshots retain their existing DB protection. Real Google provider/session invalidation remains an external release gate.

Implementation helpers extracted into src/domain/review.ts and src/components/review-tools.tsx/account-people.tsx. No new dependency, architecture, paid service or calculation policy introduced. API/processing specs, ADR-003, TASKS, acceptance coverage and README synchronized.

Validation progression: 31 TypeScript tests across 8 files and 9 Python tests passed; expanded 13-test browser suite passed. Later repeated browser runs against the same existing dev process hit the intentional OCR limit, and stale identical synthetic-camera bytes exposed the duplicate-recovery path described above. The test harness now requires a fresh app process (reuseExistingServer=false), uses distinct synthetic byte nonces per test while keeping repeat captures in one test identical, and leaves production rate limits unchanged. Final 14-test browser/build results follow after the clean run. Provider/device/corpus/host gates remain unverified; no blanket release-completion claim.

Independent-review fixes final evidence: `npm run typecheck` passed; `npm test` 31 tests/8 files passed; `npm run test:python` 9 passed; clean `npm run test:e2e` 14 passed; `SPLITCART_DEV_AUTH=0 npm run build` passed. Latest review/account mobile screenshots visually inspected, including active people first and archived people collapsed. Independent follow-up found no new security/allocation blocker in its static review; its unapplied-filter pagination finding was corrected and the exact sequence now passes. Actual Google provider/session invalidation, physical phones and real corpus/target-host release gates are still unrun. Local development app restarted for user review.
