# Receipt parsing specification

Requirements PAR-01..07. Supports P-02,03,05,09 and N-06.

## Inputs and outputs

Input: validated OCR tokens/lines, geometry, engine metadata, and schemaVersion=1. No database access. Output: tentative candidate plus warnings and unparsed lines; never a finalized receipt.

Candidate item: {id: UUID, description: string|null, quantity: decimal-string|null, unitPriceCents: integer-string|null, lineTotalCents: integer-string|null, sourceLineIds: string[], warnings: string[]}. Item IDs are stable within an attempt, not across reruns. Quantity is positive with at most three fractional digits; it is descriptive evidence, not a money multiplier. If unit price and quantity conflict with the printed line total, preserve printed values and flag the conflict.

Candidate adjustment: {id:UUID, kind:'line_discount'|'receipt_discount'|'tax'|'fee', label:string, amountCents: nonnegative-integer-string|null, targetItemIds:UUID[]|null, sourceLineIds:string[], warnings:string[]}. Discounts are represented as magnitudes with explicit kinds, not ambiguous negative prices. Unknown tax/discount eligibility is null and must be reviewed. Source item references must exist in the candidate.

## Rules

PAR-01: Parse only exact decimal strings into cents; strip recognized USD separators under a documented grammar, reject ambiguous locale formats, and retain raw text. A price with more than two decimals is ambiguous, not silently rounded. Distinguish weighted-unit prices from line totals.
PAR-02: Group rows using geometry/line order, recognize metadata/totals/tender lines, and distinguish subtotal, tax, discounts, and grand total. Payment/cash/change/loyalty balances are never automatically grocery items. Missing or competing total candidates remain null with warnings.
PAR-03: Recognize explicit quantity/unit price patterns and weighted items, but use the printed line total as the authoritative amount proposal. Do not assume quantity=1 when not observed; unknown quantity may stay null and still be reviewed.
PAR-04: Wrapped descriptions can join a following price row only under conservative adjacency rules. Duplicate descriptions on separate source lines remain separate items. Repeated OCR tokens from candidate preprocessing runs must not become duplicate charges; select one candidate, never concatenate candidates.
PAR-05: Associate a coupon to a line only with sufficient source evidence; otherwise propose a receipt-level discount with unknown eligibility. Preserve separate tax rows. No category/taxability inference or jurisdictional tax calculation.
PAR-06: Unknown rows are retained visibly; never discard suspicious price-like rows silently. No total-driven fabrication of missing items. A reconciliation difference is an error to review, not an automatic adjustment.
PAR-07: Deterministic results for fixed token fixtures and parser version. Low-confidence flags and structural warnings are distinct. Store raw extraction and version to diagnose errors without overwriting edits.

## Review completion

Reviewed items need a nonblank description and nonnegative known line total. Quantity and unit price may remain null. All adjustment amounts and their eligible items must be confirmed. Total must be entered/confirmed. Every unparsed line is marked as resolved, non-purchase metadata, or unsupported; unknown financial content blocks finalization. All remaining warnings require either correction or explicit permitted acknowledgement; mismatched totals, missing amounts, and unsupported negative receipts cannot be acknowledged away.

## Acceptance

A-PAR-1: Frozen fixtures cover wrapped names, quantities, weighted goods, coupons, multiple tax rows, tender/change, duplicate descriptions, missing/ambiguous prices, and missing totals with expected candidate/warnings.
A-PAR-2: No unknown price is represented as zero; no inferred item hides a mismatch.
A-PAR-3: Evaluation reports per-store and image-quality results against independent ground truth, with all failures inspectable. Accuracy claims remain blocked until evaluated; see acceptance-tests.md.
