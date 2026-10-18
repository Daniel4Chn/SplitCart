# SplitCart operator runbook — M7 / DB-07 / N-02..07

Local and Railway operational checks exist. Railway deployment was explicitly authorized on 2026-10-18; hosted synthetic OCR, restart and isolated restore are verified. Real Google session/physical-device/corpus/retention acceptance remains open.

Update 2026-10-18: user selected Railway on the existing Hobby account and authorized deployment. Project `SplitCart` contains one application service, private PostgreSQL 15, and persistent application/database volumes. Executed results are recorded in implementation-log.md rather than inferred from provisioning. Older checklist wording below describes the original requirements; current evidence supersedes historical unrun statuses.

## Railway operations

Application URL: https://splitcart-production.up.railway.app. PostgreSQL is private; do not expose a public database TCP proxy. Application volume mounts `/app/.data`; database volume mounts `/var/lib/postgresql/data`. The container initializes only the mounted application root, drops to `node` via gosu, and uses tini to reap orphan processes. Startup refuses missing production configuration, development bypass, or a non-HTTPS auth origin; it applies checksum migrations, sweeps recovery/deletions, and probes DB/native binaries before serving. Maintenance runs single-flight every minute with a 45-second deadline.

Use the existing Git-ignored local environment only for development. Production credentials belong in Railway variables; never run raw variable-list commands in shared logs. Configure Google's exact hosted callback `/api/auth/callback/google` and keep development redirect URIs separately. A recognized provider and Google authorization redirect do not prove completed login/logout.

Deploy project source with `railway up --service splitcart --detach`. The upload honors `.gitignore`; do not use `--no-gitignore`. Confirm deployment status and health before reporting success. Railway currently warns that railway.json is supported only until 2026-12-01; migration to the reviewed infrastructure-as-code format is required before that date. Dry-run migration was inspected, not applied.

GitHub auto-deploy is not connected: Railway rejected source connection to the private repository for lack of repository access. Grant its GitHub integration access to `Daniel4Chn/SplitCart` before claiming push-to-deploy behavior. The current deployment uses CLI upload; GitHub source remains private. The initial runtime database role owns the schema; least-privilege runtime/operator separation is a remaining hardening task. No spending cap, automatic off-host backups or expiry is configured.

Operator checks inside the application container (run as node): `npm run doctor`; `npx tsx scripts/host-smoke.ts create`; restart the app service; `npx tsx scripts/host-smoke.ts verify`. The smoke uses only a generated receipt/test owner, preserves its original/snapshot through restart, and then deletes its synthetic data. Do not use the real Google owner as a test identity. `npm run ops:backup` and isolated restore remain separate recovery checks. A backup on the application volume is not off-host protection; no configured expiry, automated off-host copies, or fixed recovery objective is implied.

## Setup and secrets

See README for native local setup. Production needs Google OAuth client/secret, NEXTAUTH_SECRET, DATABASE_URL, and NEXTAUTH_URL at the actual HTTPS origin. Use provider redirect `/api/auth/callback/google`. Keep secrets in host environment; never bake `.env.local` into an image. Set SPLITCART_DEV_AUTH=0. Production build/start refuses the development bypass. Development household data is never transferred to a new OAuth account.

`Dockerfile` packages Node, Python, OpenCV/Pillow and Tesseract on one persistent host. It is not built here (Docker is unavailable); pin the approved base image digest and resolved native engine/language-data package versions after the target-host smoke. JavaScript/Python packages are locked. Worker results retain engine version and English traineddata hash. An unverified language hash is a release failure, not an accuracy claim.

## Host configuration checklist

- One Node instance only; same PostgreSQL and private persistent `/app/.data/images` volume. Do not mount under public/. Container user must own the volume; private directory mode 0700.
- HTTPS reverse proxy with a fixed trusted Host, public origin matching NEXTAUTH_URL; overwrite forwarding headers. Web app binds container port 3000; expose only through proxy. PostgreSQL is private.
- Reject bodies over 11 MiB at proxy; application independently bounds multipart at 10 MiB + 64 KiB and files at 10 MiB. Proxy request timeout at least 90 seconds, connection/concurrency limits, and per-IP auth throttling. Worker timeout 60 seconds; attempt deadline 75 seconds; 4 MiB stdout and 64 KiB stderr; Linux 2 GiB address-space and 65-second CPU bounds. Set container memory/CPU/process limits with headroom measured on the chosen host. Application advisory lock permits one decoder/OCR process group across Node workers on this database.
- Rate limits in one Node process: 90 mutations/minute/owner, 10 uploads/minute/owner, 5 OCR/minute/owner; auth handler 300 entries/minute globally. Restart resets counters. No SLA is claimed; validate settings on the target host.
- Run migrations before serving traffic: `npm run db:migrate`. Runtime DB role should have only application DML; migrations use a separate operator role. Never grant clients DB access.
- Run `npm run ops:maintenance` on startup and every minute via the chosen host scheduler. Expired attempts become failed; old scratch/orphan directories are removed; deletion outbox failures retried. Reads also expire overdue attempts. Scheduler/provider setup remains unverified.
- Health `/api/health` is minimal liveness; `npm run doctor` is operator-only readiness. Do not expose diagnostics publicly.

## Backup and restore

`npm run ops:backup` writes a private project-local `.data/backups/UUID` with custom PostgreSQL dump, referenced original/display images, and SHA-256 manifest. It holds SHARE locks on public tables while dumping/copying, blocking data mutations to preserve consistency. Use a maintenance window; OCR in flight can finish, but its result write waits. Do not run schema migrations concurrently. Missing referenced images fail the backup. Treat backups as sensitive.

`npm run ops:restore-check -- .data/backups/UUID` creates a NEW `splitcart_restore_UUID` database on the configured cluster and copies evidence under `.data/restore/`. It verifies restored image references/checksums and exact snapshot share sums. It never overwrites live data. Restored DB and files remain for inspection. To switch a host after disaster: stop application writes; restore into a new database/private volume; configure its DATABASE_URL/storage path; migrate if necessary; validate authorized image reads and a native OCR smoke; restart with bypass disabled. Do not run with two divergent active databases.

Backup frequency, encrypted off-host destination, restore objectives, expiry/retention, and disaster recovery permissions require the selected host/budget decision. Receipt deletion removes live rows and attempts, then deletes original/display files through an outbox; failed cleanup remains visible and retryable. Backup copies expire under the selected retention policy. No instantaneous backup-erasure claim.

## Failure handling

OCR_BUSY: retry; no invisible queue. OCR_TIMEOUT/OCR_INTERRUPTED/OCR_FAILED: saved draft stays intact; retry or manually enter. VERSION_CONFLICT: explicitly reload after preserving unsaved work; never auto-overwrite. IMAGE_UNAVAILABLE: restore evidence from a verified backup or retain manual draft. Cleanup `failed`: maintenance retry; inspect permissions without logging content. Logs contain codes/request IDs only.

## Release gates still open

Google real-provider login/sign-out and HTTPS mobile capture; selected host build/native OCR/restart/resource tests; host-specific backup/restore and retention; independent real receipt corpus and locked holdout; correction-time/manual-entry user study; explicit evidence-backed usefulness approval. Local synthetic checks do not satisfy these gates.
