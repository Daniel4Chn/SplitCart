# M7 deployment proposal — Vercel and Railway

Prepared 2026-10-18; user subsequently requested deployment on the existing Railway Hobby account. The Railway-only topology below is selected and provisioning is underway. This preserves ADR-001. The alternative Vercel split remains unselected; see the implementation log for executed deployment results.

## Recommended: complete application on Railway

Deploy the Docker-based Next.js application, including its local Python/OpenCV/Tesseract subprocess, as one Railway service. Use one Railway PostgreSQL 15 service and a persistent private application volume. The application keeps its same-origin API and Google authentication routes. This preserves ADR-001 rather than introducing a second backend interface.

Concrete resources:

- Application service: repository `Daniel4Chn/SplitCart`, Dockerfile build, one replica, public HTTPS Railway domain, health path `/api/health`.
- PostgreSQL service: private connectivity from the application; new hosted database, with no automatic transfer of local receipt/account data.
- Application volume: persist `/app/.data` so image evidence and explicitly configured local backup artifacts survive application replacement. Actual size and retention require budget approval. Backups on this volume alone are not off-host disaster recovery.
- Migration step: run `npm run db:migrate` with hosted database access before serving the new release. Maintenance must run with the mounted volume available, including periodic deletion/expired-attempt cleanup.

Runtime variables:

```text
DATABASE_URL=<Railway private PostgreSQL connection, supplied privately>
NEXTAUTH_URL=https://<actual-application-domain>
NEXTAUTH_SECRET=<fresh generated production secret>
GOOGLE_CLIENT_ID=<configured privately>
GOOGLE_CLIENT_SECRET=<configured privately>
SPLITCART_DEV_AUTH=0
SPLITCART_STORAGE_DIR=/app/.data/images
SPLITCART_PYTHON=/app/.venv/bin/python
```

Register the exact production Google callback `https://<actual-application-domain>/api/auth/callback/google`. Do not upload `.env.local` or put credentials in source control, build arguments, command-line arguments, or this document.

Preparation required before deployment: verify Docker/native builds; resolve mounted-volume permissions while preserving the intended nonroot runtime; verify Railway's assigned port/start command; add provider-specific migration/maintenance configuration; choose memory/CPU/storage settings and a budget policy. The existing Dockerfile's build-time chown does not establish ownership of a subsequently mounted volume. Railway documents nonroot-volume permission concerns; do not silently switch the whole app to root as a workaround.

## Alternative requested: Vercel UI with Railway backend

This can use Vercel for the web UI while Railway owns authenticated APIs, PostgreSQL, private files, and native OCR. It requires an approved update to ADR-001 and concrete design/testing of the API origin, Google callback, cookie/session boundaries, mutation origin checks, image access, and request routing.

The existing relative `/api/v1` calls and `/api/auth` links assume one origin. Merely importing the same repository into both hosts would not establish correct authentication, private storage, or OCR execution. A same-origin proxy versus direct cross-origin backend must be evaluated against current upload/body/timeout and cookie requirements before implementation. No proxy/upload-limit compatibility is claimed yet.

Standard Vercel Functions have a read-only filesystem with temporary `/tmp` space; that does not provide the app's persistent receipt volume. Vercel's available runtimes, including newer container capabilities, do not by themselves establish compatibility with the existing same-host storage/process design. A backend split or storage redesign must be intentional.

## Cost and approval boundary

Railway's published Hobby subscription is $5/month with that amount credited toward resource usage; resource usage can make the total higher. This is not a $5 total-cost estimate for two services and storage. Account credits, existing subscription, actual memory/CPU usage, egress, storage, and backup policy need review before provisioning. Ask the user for the desired topology and monthly budget; any spending limit must be checked for its actual enforcement semantics, not represented as a guaranteed bill cap without evidence.

The user previously reserved material architecture changes and paid services for explicit approval, then explicitly requested deployment using the existing Railway Hobby account. This authorizes the two-service Railway topology; no plan upgrade or unrelated service is included. The user was informed that usage may exceed the included $5. No fixed monthly total or guaranteed billing cap is claimed. Production OAuth completion and real OCR quality remain separate verification gates.

## Hosted acceptance checks

1. Build native dependencies and application without secret injection into the image; run type/domain/database checks and migrations against isolated hosted test data.
2. Verify mounted-volume access, original/display privacy, native OCR, output/deadline bounds, and actual resource use.
3. Verify Google sign-in/sign-out, owner isolation, origin guards, and production development-bypass refusal.
4. Exercise camera capture on HTTPS with an actual phone, manual splitting, reviewed extraction, exact finalization, duplicate retry, and history.
5. Restart/redeploy and verify retained image references and finalization snapshots; inject processing and cleanup failures and demonstrate recovery.
6. Demonstrate a consistent database-plus-image backup and isolated restore; configure retention and off-host handling before claiming disaster recovery.
7. Keep real-corpus/holdout/usefulness acceptance open until measured. A hosted demo does not complete all M4/M7 release criteria.

Sources checked 2026-10-18:

- [Vercel function runtimes and filesystem](https://vercel.com/docs/functions/runtimes)
- [Railway persistent volumes and permissions](https://docs.railway.com/volumes/reference)
- [Railway pricing](https://docs.railway.com/pricing)
- Existing [ADR-001](../decisions/ADR-001-architecture.md) and [operator runbook](runbook.md)
