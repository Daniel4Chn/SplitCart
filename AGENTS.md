# SplitCart engineering instructions

## Approval boundary

The user approved the specifications and authorized continuous M0–M7 implementation on 2026-10-16, reconfirmed on 2026-10-17. Documentation and implementation within that scope are authorized. Approval comes from the user conversation; this file records it.

Implement M0–M7 in dependency order and report each milestone; continuous authorization removes milestone pauses. Do not silently broaden scope or alter approved business rules. Record architectural changes in an ADR and request approval for material scope, cost, or architecture changes.

## Required workflow per milestone

1. Read TASKS.md and all linked specifications and ADRs.
2. Verify prerequisite milestones, installed tools, supported package versions, and assumptions.
3. Create meaningful tests for the current behavior before or alongside implementation.
4. Implement the smallest complete slice described by the milestone.
5. Run relevant unit, integration, contract, and end-to-end checks; fix failures.
6. Validate every linked acceptance criterion with evidence; blocked or unrun checks are not passes.
7. Synchronize specifications and update TASKS.md and docs/progress/implementation-log.md.
8. Report changes, tests, remaining risks, and the next suggested milestone, continue through authorized milestones.

## Design rules

- Keep money as integer cents; use BigInt for arithmetic intermediates, integer weights, and deterministic largest-remainder allocation. Never parse money through floating-point arithmetic.
- Keep calculation logic pure in TypeScript, image work in Python, and authorization/persistence in server modules. Server output is authoritative.
- Treat OCR as untrusted suggestions. Require explicit review and exact reconciliation before finalization.
- Validate every API input and Python result at runtime. Contract changes update docs/specs/api-contracts.md and receipt-processing.md together.
- Parameterize SQL. Scope every record and file access by authenticated owner. Multirow mutations use transactions and optimistic version checks.
- No shell interpolation for uploads or subprocess arguments; no user paths or URLs passed to OCR. Bound input size, process duration, memory, output, and concurrency.
- Do not log receipt content, uploaded image bytes, OAuth tokens, or secrets. Use synthetic or consented redacted fixtures.
- Add dependencies only for a stated need. No FastAPI or separate services without an ADR explaining a measured benefit.
- No generated benchmark claims or placeholder features described as working. Preserve the original receipt evidence and explicit uncertainty.
- Prefer rg for repository discovery. Do not read unrelated sibling projects. Do not install tools or provision paid hosting during planning.

## Traceability

Every implementation task, test group, and completion entry references milestone IDs and requirement/acceptance IDs. Acceptance coverage is maintained in docs/specs/acceptance-tests.md. Missing tests and unmet criteria keep the milestone incomplete.

## Build authorization — 2026-10-16

User approved the specifications and plan and explicitly authorized continuous M0–M7 implementation without milestone pauses. Material scope/cost changes and externally required permissions still apply.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
