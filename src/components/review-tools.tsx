"use client";
import { useState } from "react";
import type { Draft } from "@/domain/contracts";
import type { OCRResult } from "@/domain/ocr-contract";
import { reconciliation, reviewWarnings } from "@/domain/review";
import { formatMoney } from "@/domain/money";
function signed(n: bigint) {
  return (n < 0n ? "-" : n > 0n ? "+" : "") + formatMoney(n < 0n ? -n : n);
}
export function Reconciliation({ draft }: { draft: Draft }) {
  const r = reconciliation(draft);
  return (
    <section
      className={
        "reconciliation " + (r.difference === 0n ? "balanced" : "needs-check")
      }
      aria-label="Receipt reconciliation"
    >
      <h3>Check the total</h3>
      <dl>
        <div>
          <dt>Items subtotal</dt>
          <dd>
            {r.itemsComplete ? formatMoney(r.subtotal) : "Missing item prices"}
          </dd>
        </div>
        <div>
          <dt>Discounts</dt>
          <dd>
            {r.discountsComplete
              ? "−" + formatMoney(r.discounts)
              : "Missing discount amount"}
          </dd>
        </div>
        <div>
          <dt>Tax & fees</dt>
          <dd>
            {r.chargesComplete
              ? formatMoney(r.charges)
              : "Missing tax / fee amount"}
          </dd>
        </div>
        <div>
          <dt>Calculated total</dt>
          <dd>
            {r.calculated === null
              ? "Unknown"
              : signed(r.calculated).replace(/^\+/, "")}
          </dd>
        </div>
        <div>
          <dt>Printed total</dt>
          <dd>
            {draft.reviewedTotalCents === null
              ? "Enter below"
              : formatMoney(draft.reviewedTotalCents)}
          </dd>
        </div>
        <div className="difference">
          <dt>Difference</dt>
          <dd data-testid="receipt-difference">
            {r.difference === null ? "Needs amounts" : signed(r.difference)}
          </dd>
        </div>
      </dl>
      <p>
        {r.difference === 0n
          ? "Matches your printed total."
          : r.difference === null
            ? "Enter every price, charge and the printed total."
            : "Correct the items or charges until the difference is $0.00. We never add a balancing charge."}
      </p>
    </section>
  );
}
export function OCRWarnings({ source }: { source: OCRResult }) {
  const warnings = reviewWarnings(source);
  return warnings.length ? (
    <section className="ocr-warnings" aria-label="Scan warnings">
      <h3>A few things to check</h3>
      <ul>
        {warnings.map((w) => (
          <li key={w.key}>{w.text}</li>
        ))}
      </ul>
    </section>
  ) : null;
}
export function MobileReceipt({ url }: { url: string }) {
  const [zoom, setZoom] = useState(1);
  return (
    <details className="mobile-source">
      <summary>View receipt photo</summary>
      <div className="photo-zoom-controls">
        <button
          type="button"
          disabled={zoom === 1}
          aria-label="Zoom receipt out"
          onClick={() => setZoom(Math.max(1, zoom - 0.5))}
        >
          −
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          disabled={zoom === 3}
          aria-label="Zoom receipt in"
          onClick={() => setZoom(Math.min(3, zoom + 0.5))}
        >
          +
        </button>
        <a href={url} target="_blank" rel="noreferrer">
          Full-size ↗
        </a>
      </div>
      <div
        className="mobile-photo"
        tabIndex={0}
        role="region"
        aria-label="Scrollable receipt photo"
      >
        <img
          src={url}
          alt="Receipt evidence for checking the items"
          style={{ width: zoom * 100 + "%" }}
        />
      </div>
    </details>
  );
}
