# SplitCart implementation plan

Status: specifications approved; autonomous M0–M7 implementation authorized. Local implementation and validation are in progress; release gates remain open.

| ID | Objective | Dependencies | Effort estimate | Status |
|---|---|---|---|---|
| M0 | Reproducible private scaffold, contracts/test harness, corpus protocol | Approved plan | 1–2 engineering days | Local foundation validated; see acceptance evidence |
| M1 | Exact allocation domain and monetary validation | M0 | 2–3 days | Exact domain validated; acceptance evidence recorded |
| M2 | Saved manual receipt → reviewed split → history | M1 | 3–5 days | Local manual workflow validated, including app restart |
| M3 | Secure image upload and bounded processing lifecycle | M2 | 2–4 days | Local image/worker checks passing; host bounds remain a release gate |
| M4 | Receipt parser and measured OCR baseline | M3 | 3–5 days | Parser/evaluator implemented; real corpus acceptance blocked |
| M5 | Integrated image review/correction workflow | M4 | 2–4 days | Local photo/correction/deletion checks passing; M4 quality gate open |
| M6 | Hosted organizer authentication and owner isolation | M5 | 2–3 days | Owner/CSRF/production checks passing; real Google login unverified |
| M7 | Deployment, recovery, holdout/user validation, release gate | M6 | 2–4 days | Railway deployment authorized and in progress; corpus/usefulness gates remain open |

Total: approximately 17–30 focused engineering days, plus contingency of 20–30% (roughly 21–39 days total). These are planning estimates, not measured AI productivity. Part-time calendar time depends on availability. Receipt collection, OAuth configuration, feedback, approval, and host access can extend elapsed time. No hosting price estimate without provider/budget selection.

Detailed per-milestone steps, files, tests, acceptance, risks, and definitions of done: [milestones.md](docs/specs/milestones.md).

## Delivery boundaries

- M0–M2: first working local vertical slice; enter a receipt manually, assign roommates, finalize exact allocations, and reload history. This is not the OCR MVP and must remain loopback/private.
- M3–M5: complete local receipt-photo workflow with mandatory human review.
- M6–M7: private-account hosted OCR MVP with validated operations and evidence-backed usefulness acceptance.

Start with M0 under the recorded approval. M1 immediately follows because arithmetic correctness underpins every later slice. Do not begin with styling or OCR-only demos.

## Approved decisions

1. Product: one organizer, roommate labels, one payer, USD/English JPEG/PNG receipts; no roommate collaboration/payments.
2. Architecture: full-stack Next.js, PostgreSQL/explicit SQL, local Python/OpenCV/Tesseract subprocess, persistent single-host storage; no FastAPI/service queue.
3. Business rules: reviewed eligibility; proportional net-value taxes/discounts; integer-weight item sharing; largest-remainder rounding; immutable finalized receipts; no auto-balancing mismatch.
4. Validation: collect real redacted fixtures; establish baseline and propose numeric OCR targets at M4; evidence-backed usefulness decision at M7. No invented accuracy promises.
5. Workflow: autonomous M0–M7 implementation without milestone pauses; report evidence and preserve external release gates.

Deployment provider/budget and OAuth credentials are needed later, not to approve the plan. Auth library stable-version compatibility is a prerequisite check in M0; a material substitute requires an ADR.

## Completion checklist for each milestone

- [ ] Relevant specifications read and dependencies verified.
- [ ] All linked acceptance IDs supported by executed evidence.
- [ ] Tests/checks pass; unrun checks and risks explicitly documented.
- [ ] Specifications, task status, and progress log synchronized.
- [ ] Completion report recorded; continue within M0–M7 authorization.

## Build authorization — 2026-10-16

User approved the specifications and plan and explicitly authorized continuous M0–M7 implementation without milestone pauses. Material scope/cost changes and externally required permissions still apply.

## User-directed M2/M5 UX update — 2026-10-17

Primary camera→automatic extraction→simple review flow; household purchases; short receipt-free item/cost/sharing entry. ADR-003 records the explicit user authorization. Redesign implemented; new camera/manual/mobile/desktop browser checks pass. Release corpus/provider/host gates remain unchanged, with household receipt coverage now required.

## Independent-review fixes — M2/M3/M5/M6, 2026-10-17

User authorized addressing all seven findings. Implemented protected draft navigation, explicit payer choice, visible OCR uncertainty/individual eligibility/exact reconciliation, history pagination/date filters, saved-photo retry and untouched-candidate recovery, inline mobile source viewing and manual draft deletion, account identity/sign-out UI and roommate rename/archive/restore. Independent read-only re-review confirmed the seven areas and identified a pagination/filter edge case, now fixed with regression coverage. Final checks and remaining release gates are recorded in the implementation log.
