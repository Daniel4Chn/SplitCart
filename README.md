# SplitCart

Approved M0–M7 implementation in progress. A local camera and simple manual household workflow now works: create roommate labels, take a receipt photo directly or add items and costs manually, automatically populate a review draft from OCR, assign integer ratios, preview exact allocations, finalize an immutable split, and reopen history. Every monetary calculation uses integer cents/BigInt and deterministic largest-remainder rounding. No real-receipt accuracy or hosted release claim is made.

## Local setup

Verified environment: Node 22.18.0, npm 10.9.3, Python 3.14.7, PostgreSQL 15.18, Tesseract 5.5.3, OpenCV 4.13.0, Pillow 12.2.0. npm dependencies are exact pins in package-lock.json; Python pins in python/requirements.txt. Native tools must already be installed and on PATH. Node >=22.12.0 is required. Current Next.js/Auth.js library integration compiles; real Google login remains a release gate.

```sh
npm ci
python3 -m venv .venv
.venv/bin/pip install -r python/requirements.txt
cp .env.example .env.local
npm run db:local
npm run db:migrate
npm run doctor
npm run dev
```

For this existing workspace, `.env.local` and `.venv` already exist: preserve them. For a fresh setup, replace NEXTAUTH_SECRET with a random secret. `db:local` creates only the project `.data/postgres` cluster, loopback port 55432, trust-auth local role `splitcart`; this is development-only. `npm run dev` binds 127.0.0.1:3000. Explicit SPLITCART_DEV_AUTH=1 enables a private local organizer, and refuses non-loopback requests. Never expose that mode publicly. `.env*`, `.data`, `.venv`, and uploads are excluded from source tracking/container context.

## Checks

```sh
npm run typecheck
npm test
npm run test:python
PLAYWRIGHT_BROWSERS_PATH=.data/playwright npx playwright install chromium
npm run test:e2e
SPLITCART_DEV_AUTH=0 npm run build
npm run ops:maintenance
npm run ops:backup
npm run ops:restore-check -- .data/backups/UUID
npx tsx scripts/clean-db-check.ts
```

Database tests create synthetic test users and remove them; a configured local database is required. Browser tests run at a 390×844 mobile viewport and use synthetic receipt data. They exercise real native OCR but do not estimate quality. Test Chromium is stored within the project. No lint command is claimed: TypeScript plus executed unit/contract/integration/browser checks form the current validation workflow.

## Review and privacy

OCR is an untrusted suggestion; import is explicit and cannot silently overwrite saved edits. Every source line and adjustment eligibility must be reviewed. Missing amounts, unassigned items, unresolved financial content, stale versions and exact-total mismatches block finalization. Original image bytes remain private, display PNG strips metadata, and authorized image endpoints use private/no-store. Finalized shares and names are snapshots; deleting a receipt removes live data and queues retriable file deletion.

## Specifications and evidence

- [Task status](TASKS.md), [milestone contracts](docs/specs/milestones.md), [product](docs/specs/product.md)
- [Architecture](docs/specs/architecture.md), [accepted ADRs](docs/decisions/ADR-001-architecture.md), [money policy](docs/specs/expense-splitting.md)
- [API](docs/specs/api-contracts.md), [processing](docs/specs/receipt-processing.md), [parser](docs/specs/receipt-parsing.md), [database](docs/specs/database.md)
- [Acceptance coverage](docs/specs/acceptance-tests.md), [implementation log](docs/progress/implementation-log.md)
- [Operator runbook](docs/operations/runbook.md), [OCR evidence/gaps](docs/progress/ocr-baseline.md), [release gates](docs/progress/release-validation.md)

## Remaining release gates

A consented redacted real receipt corpus with independently checked ground truth; locked holdout evaluation and observed correction burden; Google OAuth credentials/real-provider verification; approved host/budget, HTTPS, backup retention and target-host native/recovery checks; explicit evidence-backed OCR usefulness approval. No paid infrastructure has been provisioned. M4/M6/M7 cannot be called complete while these checks remain unrun. Independent local work continues under the approved architecture: Next.js, PostgreSQL and bounded local Python/OpenCV/Tesseract; no FastAPI or separate OCR service.

Camera opens inside the page and requires browser permission (localhost or HTTPS). Take the photo and extraction starts automatically. Manual entry supports groceries/household items with item name, cost and sharing choices; no separate receipt-total input. See ADR-003 for the user-directed redesign.

Review safeguards: choose the payer explicitly; pending drafts save when navigating within the app and reload/exit warns about unsaved edits. Photo review shows warnings, individual tax/discount eligibility and exact reconciliation. History supports Load more/date filters, and My account supports identity and roommate management. OCR retry/recovery preserves edits. Browser tests must start with port 3000 free: stop `npm run dev` first; Playwright owns a fresh app process so normal per-process OCR/mutation limits are tested without leftovers from previous runs. Synthetic camera bytes are isolated per test.
