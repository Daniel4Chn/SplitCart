# ADR-003: Camera capture and simple manual household splitting

Status: accepted through explicit user direction, 2026-10-17.

The user rejected the initial form-heavy UX and requested taking a photo directly, automatic item detection, a substantially improved UI, support for household items as well as groceries, and receipt-free manual entry with only item cost and sharing choices.

The home screen offers Take a receipt photo and No receipt? Add items manually. Camera capture uses browser getUserMedia (environment-facing when available) and a shutter. Taking a photo authorizes private image transfer, OCR, and population of a NEW unreviewed draft; it does not authorize finalization. No file picker, separate extraction button, or separate import button appears in this flow. Browser camera permission and localhost/HTTPS remain genuine platform requirements. Camera tracks stop on capture, cancellation, and unmount. Existing owner-scoped byte-identical photos reopen their existing receipt rather than producing duplicate charges.

Manual entry provides Groceries/Household items labels, an item name and integer-cent cost, sharing name chips, and one payer. Without a physical receipt, its entered total is defined as the sum of entered costs and is computed with BigInt. Unknown costs block preview; this is not an OCR reconciliation adjustment. Photo receipts still require the actual reviewed printed total and exact reconciliation. The labels are receipt titles, not a new accounting/category subsystem.

Human review, explicit charge eligibility confirmation, unresolved-line handling, exact money, server authority, version checks, privacy and explicit finalization remain in place. Source line classifications may be proposed by the UI; review confirmation remains false until the user checks the receipt. Advanced correction details stay expandable. No change to the approved Next.js/PostgreSQL/local Python architecture, paid services, or deployment occurs.

Evidence: browser fake-camera input uses a clearly synthetic receipt video and real native OCR; it verifies capture→automatic extraction→review→sharing→finalization. It does not establish physical phone-camera behavior or real household-receipt accuracy. Those require corpus and device evaluation.

## Independent review fixes — 2026-10-17

User authorized correcting all independent-review findings. New purchases require an explicit payer selection; alphabetical roommate order is never used to infer who paid. Internal navigation saves pending draft edits and aborts navigation on failure; reload/exit warns about unsaved work. Inputs are disabled during saves. No background draft receipt data is written to browser localStorage.

OCR/image/item/adjustment warnings and an exact-cent reconciliation panel are visible. Each tax/discount/fee requires its own eligibility confirmation; the general receipt checkbox does not grant that confirmation. Unknown amounts remain visibly unknown. Mobile review includes an expandable, scrollable/zoomable source image.

History exposes dates, date filters, and cursor pagination. The applied filters are kept with their list/cursor, independently of edited-but-unapplied date fields. OCR can retry the saved photo and automatically recover a successful attempt only into a completely untouched draft. Replacing edited content with suggestions requires explicit confirmation. Manual/review drafts can be deleted immediately with visible cleanup state and retry.

Account controls show the authenticated owner's display name/mode, expose the auth library sign-out route for hosted accounts, explain the local development account accurately, and allow roommate rename/archive/restore. Historical name snapshots remain immutable. No architecture, paid-service, calculation-policy or provider change is introduced.
