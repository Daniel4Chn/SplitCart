# ADR-002: Local OCR with conservative parsing and mandatory review

Status: accepted by user approval on 2026-10-16. Date: 2026-10-16.

## Context

Receipt images vary in lighting/layout and often contain quantities, weights, coupons, totals, and payment lines. OCR correctness and receipt semantic correctness are different problems; monetary safety cannot depend on recognition confidence.

## Alternatives

- OpenCV + Tesseract: no external receipt sharing or per-image API bill, inspectable geometry; may require more correction for faded/complex layouts.
- Cloud receipt/document extraction: potentially stronger structure; cost, credentials, network availability, retention/privacy, and vendor coupling.
- Vision LLM extraction: flexible layout handling; nondeterministic/missing/fabricated fields and additional validation/cost surface.
- Manual-only entry: reliable baseline/fallback with no recognition savings; insufficient as the final proposed product but useful for the first vertical slice.

## Accepted decision

Local OpenCV preprocessing plus Tesseract TSV; deterministic Python geometry-aware parser. Preserve unknowns and source lines, require user review, and enforce integer-cent reconciliation independently in TypeScript. Keep manual entry permanently available. Collect consented representative fixtures and compare baseline/preprocessing before choosing aggressive transformations. Publish no performance/accuracy claim without measured results.

## Consequences and revisit triggers

More review effort is acceptable initially only if measured usefulness supports it. Confidence is not correctness probability. Do not correct numbers by forcing totals to match. If corpus evaluation shows poor benefit, first narrow supported layouts or improve preprocessing/parser; evaluate paid OCR only with explicit cost/privacy approval and an ADR. Numeric OCR release targets are evidence-based proposals at M4, not invented planning claims.

Reference: [Tesseract image-quality guidance](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html). Acceptance/evaluation details: ../specs/acceptance-tests.md.
