# Product specification

Status: approved by the user on 2026-10-16, reconfirmed 2026-10-17. Requirement IDs in this document are stable references.

## Problem and users

Primary user: a college student who pays for a grocery or household shopping trip and needs to tell roommates what they owe. Roommates are named participants, including the payer; they do not need accounts in the MVP. A single organizer owns and edits each receipt. One owner-managed household per account is sufficient initially.

The valuable outcome is a trustworthy, explainable split with less transcription. OCR automation alone is insufficient: an incorrectly extracted price must never silently become a debt.

## MVP requirements

- P-01: Upload one JPEG or PNG photo per receipt, including mobile camera/file input. English-language US retail receipts for groceries and household purchases and USD only. Clearly explain unsupported HEIC, PDF, multipage, returns, and other currencies.
- P-02: Improve image readability and extract tentative descriptions, quantities, line totals, subtotal, taxes, discounts, and total, retaining source lines and warnings.
- P-03: Show image and editable extraction together. Add/delete/edit items and adjustments, enter missing values, and correct store/date/total. Manual receipt entry remains available when OCR fails.
- P-04: Maintain roommate names; include the payer; assign each item to one or more participants using equal shares or positive integer relative weights. Bulk assign equally is allowed, but explicit review is required.
- P-05: Allocate line and receipt discounts and taxes using the policies in expense-splitting.md. Require the reviewed amounts to reconcile exactly before finalization.
- P-06: Display each participant's share, payer reimbursement amounts, and a breakdown explaining rounding and adjustments. The payer's own share is not an amount owed to themselves.
- P-07: Save drafts and finalized splits, reopen them, and browse history. History shows finalized receipt totals and participant shares, filterable by date; exclude drafts and never sum reimbursement amounts as grocery spending.
- P-08: Hosted users sign in; their receipts, images, roommates, and history are private. Organizer can delete receipts. No publicly accessible unauthenticated deployment.
- P-09: Handle failures visibly, preserve saved manual edits, detect exact-byte duplicate images within an owner's account, and prevent duplicate finalization.
- P-10: Use usable mobile forms, labeled controls, keyboard access, visible progress, actionable errors, and a clear distinction between extracted and reviewed data.

## Core user stories

U-01 (P-01..03): As the shopper, I upload a receipt and correct its proposed rows while viewing the source.
U-02 (P-04..06): As the payer, I assign personal groceries to individuals and shared groceries by relative shares, then see the exact reimbursements.
U-03 (P-03,09): As a user with an unreadable receipt, I enter items manually without losing the receipt or draft.
U-04 (P-07,08): As an organizer, I find my prior splits after signing in on another device and delete sensitive receipts.

## Ideal workflow

Sign in → select/create roommate names → upload → visible processing → review rows and receipt total → resolve warnings and reconciliation difference → assign participants → preview exact breakdown → confirm → saved summary/history. The review page identifies unparsed rows, unknown amounts, and total mismatch. Image-only processing failure leads to retry or manual entry, never a dead end. Saving a draft does not imply correctness or finalization.

## Scope boundaries

Defer roommate logins/invitations, collaborative editing, settlement tracking, payments, bank integrations, notifications, exports, budgets/charts, category prediction, barcode/catalog matching, multiple payers, multiple households, multicurrency, native mobile apps, PDF/HEIC support, handwritten receipts, returns/negative final receipts, and AI/LLM extraction. No social features or model training pipeline.

MVP supports weighted goods by using the printed line total; it does not infer taxability or reconstruct prices from ambiguous weights. Coupons and taxes are explicitly reviewed. Unsupported fees can be recorded as named, reviewed positive adjustments with stated eligible items.

## Nonfunctional requirements

N-01: Money and allocation reconciliation are exact; all finalized receipts have an explanation and immutable calculation-policy version.
N-02: Uploads and computation have configured resource bounds; users receive timeout/busy failures and retain drafts. Bounds are design safeguards, not performance claims.
N-03: API and subprocess outputs are versioned and validated; failures use consistent structured errors.
N-04: Private ownership is enforced on all reads and writes, including images and nested objects.
N-05: Restart preserves committed data; failed finalization cannot leave partial allocations. Backup/restore is demonstrated before hosted release.
N-06: No OCR accuracy or speed promise is published without corpus evidence. Evaluation and a product usefulness gate precede release.
N-07: Store only data needed for the workflow; receipt deletion removes associated content and temporary files. Explain backup expiry separately.

## Approved scope and remaining operational assumptions

A-01: USD/English/single-image US retail receipts for groceries and household purchases are acceptable initial constraints.
A-02: One signed-in organizer manages roommate labels and is the sole payer for each receipt; roommates receive results outside the app.
A-03: Taxes use reviewed eligible items and proportional net item value, not inferred tax law. Unknown eligibility defaults to all items with a visible warning and explicit confirmation.
A-04: A persistent single-host deployment and external PostgreSQL are acceptable; hosting provider/budget selection is deferred until deployment, with no paid provisioning authorized by this plan.
A-05: Real receipt fixtures require consent/redaction; no corpus is currently available.

## User-directed UX/scope update — 2026-10-17

Camera capture is the primary entry, with automatic extraction and unreviewed draft population. No file-selection/extract/import steps in the main UI. Household purchases are supported alongside groceries. Receipt-free manual entry asks for item name, cost and sharing participants; its total is computed from entered costs and needs no separate printed-total field. Photo totals still require exact reviewed reconciliation. See ADR-003. Broader real-store/household receipt quality remains unmeasured and must be included in corpus acceptance.
