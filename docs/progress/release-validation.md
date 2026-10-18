# M7 release validation

## Hosted update — 2026-10-18

User authorized deployment using the existing Railway Hobby account. https://splitcart-production.up.railway.app is live with one app service, private PostgreSQL 15, and persistent app/database volumes. Docker build/migrations/readiness, HTTPS home/health, signed-out API isolation, configured Google provider and authorization redirect passed. Hosted 31 TypeScript tests/8 files and 9 Python tests passed. Synthetic native camera-independent OCR/service review/finalization preserved 600 cents and original bytes; actual service restart preserved its snapshot ID/image, then cleaned synthetic live data. Backup/isolated restore verified 1 receipt, 1 finalization and 1 image with hashes/reference/share checks.

Real Google consent/session login/logout, physical-phone capture, real corpus/holdout/correction burden/usefulness, resource-pressure checks, automatic off-host backup/retention and runtime DB role hardening remain open. GitHub source access for Railway auto-deploy was rejected; CLI upload is working. Historical unrun host statements below describe the prior 2026-10-17 state. This is a hosted demo, not completed release acceptance.

Remote GitHub Actions run 39096581982 also completed successfully for deployment-preparation commit 7c7464a (migrations, typecheck, TS/Python/browser checks and production build). Earlier remote-CI-unrun statements below are historical.

Status: **not released; external release gates open**. User authorized all independent M0–M7 implementation, but did not supply a target host, paid-service budget, OAuth credentials, or real receipt corpus. No infrastructure provisioned or external messages sent.

Local evidence as of 2026-10-17:

- Clean locked npm install succeeded (100 packages; npm reported zero vulnerabilities at this run).
- TypeScript/domain/service/route/fault tests and Python parser/image tests execute; 26 TypeScript tests and 9 Python tests passed; 3 mobile browser tests passed; exact command evidence in implementation-log.md.
- Mobile Chromium manual and photo correction/finalization/deletion flows passed using synthetic receipts.
- Database migrations 001–004 applied; fresh-database install, no-op migration replay, and ledger reconnect check passed.
- Native Tesseract/OpenCV smoke passed locally, with private original evidence and strict output validation.
- Backup created in `.data/backups/499fc835-2e0c-4d31-afa6-82fc4f35f164`; restore into independent `splitcart_restore_480db46d9b0945f89cdddc3dcf26a1e9` succeeded: 7 receipts, 3 finalizations, 1 referenced image. Both image checksums and exact snapshot share sums verified. Restored project-local files retained under `.data/restore/`. This verifies local recovery, not a chosen host's disaster recovery.
- Dockerfile, maintenance script and operator runbook provided; container build/target-host behavior unverified because Docker/host are unavailable.

Unmet gates: A-PAR-3 real corpus; real Google OAuth browser/provider sign-in/sign-out; A-REL-1 host migration/HTTPS/native process/memory/restart checks; host backup expiry/retention and restore; A-REL-2 all preceding acceptance; A-REL-3 observed correction burden and explicit usefulness approval. No real-receipt accuracy, latency, savings or deployment claim.

Release requires all gates to pass; implemented local work does not turn unrun checks into passes.

Final local production webpack build and typecheck passed after implementation. Real application stop/start preserved the finalized $8.91 summary and finalization ID. Signed-out production receipt API returned 401; health/session/sign-in library routes returned 200; production startup with development bypass enabled exited with an explicit refusal. CI workflow is provided but has not run remotely. All hosted/provider/corpus checks above remain open.

Independent-review follow-up (2026-10-17): local UX/recovery/account fixes validated with 31 TypeScript tests, 9 Python tests, 14 browser tests and a passing production build. Household response now includes safe owner display/mode metadata. This improves local acceptance coverage; it does not close real OAuth, physical-device, real-receipt corpus/usefulness or host release gates. Browser tests own a fresh loopback app process and keep normal production rate limits.
