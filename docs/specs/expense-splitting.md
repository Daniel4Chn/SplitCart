# Expense splitting specification

Requirements SPL-01..09. Supports P-04..07 and N-01,05.

## Amounts and invariants

SPL-01: USD integer cents only. API JSON uses canonical base-10 integer strings, e.g. "349"; no exponent or decimal point. UI parses dollar input lexically, never with parseFloat. Store PostgreSQL BIGINT and use BigInt for all arithmetic and multiplication intermediates. Nonnegative item/adjustment amounts, bounded to 100,000,000 cents per field and receipt total (approved defensive cap); reject aggregate overflow/cap violations. No JS Number arithmetic for money.

SPL-02: Each item has a reviewed line gross total. Quantity does not multiply this amount again. Assignment contains distinct participant IDs and positive integer weights 1..10000, maximum 50 participants. Equal sharing sets each weight to 1. Ratios such as 1:2 are supported; arbitrary decimal percentages are deferred. Participant IDs, not names or UI order, decide stable ties. Zero-cost items still require assignment for clarity.

## Allocation primitive

SPL-03: To allocate nonnegative A cents across weights w[i], calculate q[i]=floor(A*w[i]/sum(w)), r[i]=(A*w[i]) mod sum(w). Distribute A-sum(q) remaining cents to descending remainder, then ascending immutable participant/item UUID string for ties. Output sums exactly to A. Negative adjustments are allocated by magnitude and subtracted afterward. Zero weight sum is invalid except for a zero amount, which allocates zero to each eligible entity. Use item IDs for item allocation and participant IDs for participant allocation. Persist the policy version ('largest-remainder-v1').

## Ordered adjustment policy

SPL-04: Start with each item's gross amount. Apply line discounts in immutable adjustment sequence to their single target item; total line discounts cannot exceed that item's remaining value. Then apply receipt discounts sequentially across explicitly eligible items in proportion to their current net amounts, using SPL-03. A receipt discount cannot exceed the eligible net sum. All-item eligibility is allowed only after visible review confirmation. Discounts on zero eligible value must be zero or rejected.

SPL-05: Compute taxes/positive fees after all discounts. Each reviewed tax or fee amount is distributed proportionally across its explicit eligible net items. If all eligible items have zero net value and the adjustment is positive, require a corrected eligible set or reject; do not invent an allocation. The user provides actual receipt tax amounts, not tax rates. Mixed taxability is handled by explicit eligible sets. Multiple tax rows allocate independently.

SPL-06: Allocate each item's final payable cents (net plus its allocated taxes/fees) to its participant weights with SPL-03. For a transparent breakdown, first compute final participant shares using the original assignment weights. Decompose those final shares by allocating the item's net amount using the final participant shares as weights, then allocate each positive adjustment using the remaining final-share capacities as weights, sequentially reducing capacities. This decomposition cannot assign a component beyond a final share. Do not independently allocate net using the original weights: largest-remainder allocation can exhibit the Alabama paradox when the amount changes. Thus displayed participant net + adjustments equals final share, and every adjustment row reconciles. If a component is zero skip it; final capacities sum to all remaining positive adjustments by construction. Store item-level gross/discount/net and participant net/tax/fee/final breakdown; do not imply gross participant shares have a unique independent rounding interpretation.

## Reconciliation and lifecycle

SPL-07: expectedTotal=sum(gross)-sum(line discounts)-sum(receipt discounts)+sum(taxes)+sum(fees). Must equal the explicitly reviewed printed total, exactly; block finalization for any cent mismatch. Reviewed subtotal, when present, is defined as gross before separate discounts and taxes; preserve ambiguous printed subtotal as source-only metadata until classified. Every item must be assigned, payer must be an active participant, and all references must belong to the same receipt/owner household.

SPL-08: One payer paid the whole receipt. Each nonpayer owes their final share to the payer. Payer reimbursement=sum(other participants' shares)=total-payer share. Never report that each person owes the full receipt or that the payer owes themselves. Sum(shares)=receipt total, not sum(reimbursements).

SPL-09: Preview and finalization use the same server-authoritative function and input version. Finalize atomically records reviewed inputs, policy version, and allocation snapshot. Finalized content is immutable; MVP permits deletion, not editing/reopening finalized calculations. Drafts remain editable. Retrying finalization for the same already-finalized version returns the saved snapshot rather than creating another expense.

## Worked test vectors

1. A=1000, weights A:B:C=1:1:1, IDs ordered A<B<C → 334,333,333.
2. A=1001, weights A:B=1:2 → 334,667.
3. Two items 1000 and 500; receipt discount 100 → discounts 67,33; net 933,467. Tax 100 over both → 67,33; final item amounts 1000,500. First belongs to A, second to B: shares 1000,500; total 1500.
4. Milk gross 349, quantity 2 displayed → still 349 unless reviewer changes the line total.
5. Gross 1000, line discount 100, receipt discount 90, tax 81 → total 891. Two equal participants ordered A<B → final shares 446,445; net 405 each; tax 41,40.
6. Receipt total 892 for vector 5 → reconciliation mismatch 1; finalization blocked.
7. Positive tax on a fully discounted zero-net eligible set → error, not division by zero.

## Acceptance

A-SPL-1: All vectors and generated invariant cases reconcile exactly; deterministic tie outcomes persist across reorderings and restarts.
A-SPL-2: Invalid weights, orphan references, excess discounts, missing assignments, overflow, mismatches, and unsupported negative amounts fail with field-specific errors.
A-SPL-3: Final participant and adjustment breakdowns reconcile independently, and duplicate finalization produces one immutable snapshot.
