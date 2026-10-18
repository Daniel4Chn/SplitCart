"use client";
import { useEffect, useRef, useState } from "react";
import type { Draft, Participant, Split } from "@/domain/contracts";
import type { OCRResult } from "@/domain/ocr-contract";
import {
  candidateDraft,
  isUntouchedDraft,
  reconciliation,
} from "@/domain/review";
import { AccountPeople } from "./account-people";
import { Reconciliation, OCRWarnings, MobileReceipt } from "./review-tools";
import { dollarsToCents, formatMoney } from "@/domain/money";
type Receipt = {
  merchant?: string | null;
  date?: string;
  dateSource?: string;
  id: string;
  version: number;
  status: string;
  draft: Draft;
  image?: { url: string } | null;
  processing?: { id: string; result: OCRResult | null; state: string } | null;
  reviewSource?: OCRResult | null;
  finalization: Split | null;
};
type Household = {
  version: number;
  participants: Participant[];
  account?: { displayName: string; mode: "development" | "google" };
};
async function api(path: string, method = "GET", body?: unknown) {
  const r = await fetch("/api/v1/" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const v = await r.json();
  if (!r.ok)
    throw Object.assign(Error(v.error.message), { code: v.error.code });
  return v.data;
}
function dollars(v: string | null) {
  return v === null
    ? ""
    : `${BigInt(v) / 100n}.${(BigInt(v) % 100n).toString().padStart(2, "0")}`;
}
function Icon({
  kind = "camera",
}: {
  kind?: "camera" | "arrow" | "receipt" | "close";
}) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "camera" ? (
        <>
          <path d="M8 5l1-2h6l1 2h4v15H4V5z" />
          <circle cx="12" cy="12" r="4" />
        </>
      ) : kind === "arrow" ? (
        <>
          <path d="M4 12h16M14 6l6 6-6 6" />
        </>
      ) : kind === "close" ? (
        <path d="M6 6l12 12M18 6L6 18" />
      ) : (
        <>
          <path d="M6 3l3 2 3-2 3 2 3-2v18l-3-2-3 2-3-2-3 2z" />
          <path d="M9 9h6M9 13h6" />
        </>
      )}
    </svg>
  );
}
function Amount({
  value,
  label,
  onChange,
}: {
  value: string | null;
  label: string;
  onChange: (v: string | null) => void;
}) {
  return (
    <input
      aria-label={label}
      className="amount-input"
      inputMode="decimal"
      key={value ?? "unknown"}
      defaultValue={dollars(value)}
      placeholder="—"
      onBlur={(e) => {
        try {
          const next = e.target.value ? dollarsToCents(e.target.value) : null;
          e.target.setCustomValidity("");
          if (next !== value) onChange(next);
        } catch {
          e.target.setCustomValidity(
            "Enter a dollar amount with up to two decimal places.",
          );
          e.target.reportValidity();
        }
      }}
      onInput={(e) => e.currentTarget.setCustomValidity("")}
    />
  );
}
export default function Workspace() {
  const [step, setStep] = useState<
      | "home"
      | "camera"
      | "reading"
      | "review"
      | "split"
      | "done"
      | "history"
      | "manual"
    >("home"),
    [house, setHouse] = useState<Household | null>(null),
    [receipt, setReceipt] = useState<Receipt | null>(null),
    [draft, setDraftState] = useState<Draft | null>(null),
    [result, setResult] = useState<Split | null>(null),
    [history, setHistory] = useState<Receipt[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [name, setName] = useState(""),
    [ready, setReady] = useState(false);
  const [pendingInput, setPendingInput] = useState(false),
    [notice, setNotice] = useState(""),
    [accountOpen, setAccountOpen] = useState(false),
    [nextCursor, setNextCursor] = useState<string | null>(null),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [deletion, setDeletion] = useState<{ id: string; state: string } | null>(
      null,
    );
  const appliedHistoryFilters = useRef({ from: "", to: "" });
  const draftRef = useRef<Draft | null>(null),
    accountDialog = useRef<HTMLDialogElement>(null);
  function setDraft(next: Draft | null) {
    draftRef.current = next;
    setDraftState(next);
  }
  const dirty =
    !!draft &&
    receipt?.status === "draft" &&
    (JSON.stringify(draft) !== JSON.stringify(receipt.draft) || pendingInput);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty || busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, busy]);
  useEffect(() => {
    if (accountOpen) accountDialog.current?.showModal();
    else accountDialog.current?.close();
  }, [accountOpen]);
  useEffect(() => {
    document.querySelector<HTMLElement>("section h1")?.focus();
  }, [step]);
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null);
  const cameraGeneration = useRef(0);
  useEffect(() => {
    api("household")
      .then(setHouse)
      .catch((e) => setError(e.message));
    return () => {
      cameraGeneration.current++;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  function stopCamera() {
    cameraGeneration.current++;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setReady(false);
  }
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function camera() {
    stopCamera();
    const generation = cameraGeneration.current;
    setStep("camera");
    setError("");
    setReady(false);
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error("Your browser needs HTTPS or localhost to use the camera.");
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1600 },
          height: { ideal: 2400 },
        },
        audio: false,
      });
      if (generation !== cameraGeneration.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      if (video.current) {
        video.current.srcObject = media;
        await video.current.play();
        if (generation === cameraGeneration.current) setReady(true);
      }
    } catch (e) {
      if (generation !== cameraGeneration.current) return;
      stopCamera();
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Allow camera access in your browser, then tap Try camera again."
          : e instanceof Error
            ? e.message
            : "Camera unavailable. Try another device or enter your receipt manually.",
      );
    }
  }
  const people = house?.participants.filter((p) => !p.archived) ?? [];
  function edit(next: Draft) {
    const previous = draftRef.current;
    const adjustments = next.adjustments.map((a) => {
      const old = previous?.adjustments.find((x) => x.id === a.id);
      return old &&
        JSON.stringify([old.kind, old.amountCents, old.targetItemIds]) !==
          JSON.stringify([a.kind, a.amountCents, a.targetItemIds])
        ? { ...a, eligibilityConfirmed: false }
        : a;
    });
    setDraft({
      ...next,
      adjustments,
      review: { ...next.review, confirmed: false },
    });
    setResult(null);
  }
  function open(r: Receipt) {
    setReceipt(r);
    setDraft(r.draft);
    setPendingInput(false);
    setResult(r.finalization);
    setStep(
      r.status === "finalized"
        ? "done"
        : !r.image && r.draft.adjustments.length === 0
          ? "manual"
          : "review",
    );
  }
  async function save(d: Draft) {
    if (
      document.querySelector(
        '.flow input:invalid:not([aria-label="Roommate name"])',
      )
    )
      throw Error("Correct the highlighted amount first.");
    const r: Receipt = await api(`receipts/${receipt!.id}/draft`, "PUT", d);
    setReceipt(r);
    if (JSON.stringify(draftRef.current) === JSON.stringify(d)) {
      setDraft(r.draft);
      setPendingInput(false);
    } else if (draftRef.current)
      setDraft({ ...draftRef.current, expectedVersion: r.version });
    setNotice("Draft saved.");
    return r;
  }
  async function persistBeforeNavigation() {
    if (draftRef.current && receipt?.status === "draft" && dirty)
      await save(draftRef.current);
    stopCamera();
  }
  async function loadHistory(
    cursor?: string,
    filters = appliedHistoryFilters.current,
  ) {
    const requested = { ...filters };
    const query = new URLSearchParams({
      ...(requested.from ? { from: requested.from } : {}),
      ...(requested.to ? { to: requested.to } : {}),
      ...(cursor ? { cursor } : {}),
    });
    const list = await api("receipts?" + query);
    setHistory((old) => (cursor ? [...old, ...list.receipts] : list.receipts));
    if (!cursor) appliedHistoryFilters.current = requested;
    setNextCursor(list.nextCursor);
  }
  async function reopen(r: Receipt) {
    if (
      r.status === "draft" &&
      r.processing?.result &&
      isUntouchedDraft(r.draft)
    ) {
      try {
        r = await api(
          `receipts/${r.id}/draft`,
          "PUT",
          candidateDraft(r.draft, r.processing.result, people),
        );
      } catch (e) {
        if ((e as { code?: string }).code !== "VERSION_CONFLICT") throw e;
        r = await api(`receipts/${r.id}`);
      }
    }
    open(r);
  }
  async function retryReading() {
    await persistBeforeNavigation();
    const current: Receipt = await api(`receipts/${receipt!.id}`);
    if (!current.image)
      throw Error(
        "There is no saved photo. Take another photo or enter items manually.",
      );
    setReceipt(current);
    setDraft(current.draft);
    setStep("reading");
    setProgress("Reading the saved photo");
    const processed: Receipt = await api(
      `receipts/${current.id}/process`,
      "POST",
      { schemaVersion: 1, expectedVersion: current.version },
    );
    await reopen(processed);
    if (!isUntouchedDraft(current.draft))
      setNotice("New scan ready. Your saved edits were kept.");
  }
  async function useScan() {
    if (!receipt?.processing?.result) return;
    await persistBeforeNavigation();
    const current: Receipt = await api(`receipts/${receipt.id}`);
    if (
      !isUntouchedDraft(current.draft) &&
      !confirm(
        "Replace the current items with unreviewed scan suggestions? Your original photo stays saved.",
      )
    )
      return;
    const saved: Receipt = await api(
      `receipts/${current.id}/draft`,
      "PUT",
      candidateDraft(current.draft, current.processing!.result!, people),
    );
    open(saved);
  }
  async function removeReceipt() {
    if (
      !receipt ||
      !confirm(
        "Delete this receipt and its live photo? Backup copies expire under the host retention policy.",
      )
    )
      return;
    const d = await api(`receipts/${receipt.id}`, "DELETE", {
      schemaVersion: 1,
      expectedVersion: receipt.version,
    });
    setDeletion({ id: d.deletionId, state: d.state });
    setReceipt(null);
    setDraft(null);
    setPendingInput(false);
    setResult(null);
    setStep("home");
    setNotice(
      d.state === "complete"
        ? "Receipt and live photo deleted."
        : "Receipt removed. Photo cleanup is " + d.state + ".",
    );
  }
  async function changePerson(p: Participant, rename = false) {
    const body: {
      schemaVersion: 1;
      expectedHouseholdVersion: number;
      displayName?: string;
      archived?: boolean;
    } = { schemaVersion: 1, expectedHouseholdVersion: house!.version };
    if (rename) {
      const text = prompt("Roommate name", p.displayName);
      if (!text) return;
      body.displayName = text;
    } else {
      if (
        !p.archived &&
        !confirm(
          `Archive ${p.displayName}? Existing saved splits stay unchanged. Drafts may need reassignment.`,
        )
      )
        return;
      body.archived = !p.archived;
    }
    setHouse(await api("participants/" + p.id, "PATCH", body));
    setNotice(rename ? "Name updated." : "Roommate updated.");
  }
  async function capture() {
    await action(async () => {
      if (!video.current || !ready) return;
      const canvas = document.createElement("canvas");
      canvas.width = video.current.videoWidth;
      canvas.height = video.current.videoHeight;
      if (!canvas.width || !canvas.height)
        throw Error("The camera is still starting. Try again in a moment.");
      canvas.getContext("2d")!.drawImage(video.current, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(Error("Could not take the photo."))),
          "image/jpeg",
          0.92,
        ),
      );
      stopCamera();
      setStep("reading");
      setProgress("Saving your photo");
      let r: Receipt = await api("receipts", "POST", { schemaVersion: 1 });
      setReceipt(r);
      setDraft(r.draft);
      const form = new FormData();
      form.set("schemaVersion", "1");
      form.set("expectedVersion", String(r.version));
      form.set("file", blob, "camera.jpg");
      const response = await fetch(`/api/v1/receipts/${r.id}/image`, {
        method: "POST",
        body: form,
      });
      const body = await response.json();
      if (!response.ok) {
        if (body.error.code === "DUPLICATE_IMAGE") {
          const existingId = String(body.error.message).match(
            /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
          )?.[0];
          if (existingId) {
            const existing: Receipt = await api(`receipts/${existingId}`);
            await api(`receipts/${r.id}`, "DELETE", {
              schemaVersion: 1,
              expectedVersion: r.version,
            });
            await reopen(existing);
            return;
          }
        }
        throw Error(body.error.message);
      }
      r = body.data;
      setReceipt(r);
      setDraft(r.draft);
      setProgress("Finding items and prices");
      r = await api(`receipts/${r.id}/process`, "POST", {
        schemaVersion: 1,
        expectedVersion: r.version,
      });
      setReceipt(r);
      setDraft(r.draft);
      const ocr = r.processing?.result;
      if (!ocr)
        throw Error(
          "We could not read this receipt. Try another photo or enter the items.",
        );
      const d = candidateDraft(r.draft, ocr, people);
      const saved = await api(`receipts/${r.id}/draft`, "PUT", d);
      open(saved);
    });
  }
  const source = draft?.review.sourceAttemptId
    ? receipt?.reviewSource?.attemptId === draft.review.sourceAttemptId
      ? receipt.reviewSource
      : receipt?.processing?.id === draft.review.sourceAttemptId
        ? receipt.processing.result
        : null
    : null;
  const totals = draft ? reconciliation(draft) : null;
  const missingEligibility =
    draft?.adjustments.some((a) => !a.eligibilityConfirmed) ?? false;
  const inactiveReferences =
    !!draft &&
    (draft.assignments.some(
      (a) => !people.some((p) => p.id === a.participantId),
    ) ||
      (!!draft.payerParticipantId &&
        !people.some((p) => p.id === draft.payerParticipantId)));
  const unresolved =
    draft?.review.lineResolutions.filter(
      (l) => l.resolution === "unsupported",
    ) ?? [];
  return (
    <main
      className="app-shell"
      onInputCapture={(e) => {
        if ((e.target as HTMLElement).classList.contains("amount-input"))
          setPendingInput(true);
      }}
    >
      <header className="topbar">
        <button
          className="wordmark"
          disabled={busy}
          onClick={() =>
            action(async () => {
              await persistBeforeNavigation();
              setStep("home");
            })
          }
        >
          <span className="logo-mark">
            s<span>c</span>
          </span>
          splitcart<span className="wordmark-dot">.</span>
        </button>
        <nav>
          <button
            disabled={busy}
            className={step === "history" ? "nav-active" : ""}
            onClick={() =>
              action(async () => {
                await persistBeforeNavigation();
                await loadHistory();
                setStep("history");
              })
            }
          >
            Past splits
          </button>
          <button
            className="account-link"
            disabled={busy}
            onClick={() =>
              action(async () => {
                await persistBeforeNavigation();
                setAccountOpen(true);
              })
            }
          >
            My account <span>↗</span>
          </button>
        </nav>
      </header>
      {error && !accountOpen && (
        <div className="error-banner" role="alert">
          {error}
          {step === "reading" && (
            <>
              <button disabled={busy} onClick={() => action(retryReading)}>
                Retry reading
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    if (receipt)
                      await reopen(await api(`receipts/${receipt.id}`));
                    else {
                      const r = await api("receipts", "POST", {
                        schemaVersion: 1,
                      });
                      open(r);
                    }
                  })
                }
              >
                Continue manually
              </button>
            </>
          )}
        </div>
      )}
      {notice && !accountOpen && (
        <p className="save-notice" role="status">
          {notice}
        </p>
      )}
      {deletion && deletion.state !== "complete" && (
        <button
          className="text-link"
          disabled={busy}
          onClick={() =>
            action(async () => {
              const d = await api("deletions/" + deletion.id);
              setDeletion({ id: deletion.id, state: d.state });
              setNotice("Photo cleanup: " + d.state + ".");
            })
          }
        >
          Retry photo cleanup
        </button>
      )}
      {step === "home" && (
        <>
          <section className="hero">
            <div className="hero-copy">
              <span className="pill">
                <span />
                FOR EVERYTHING YOU SHARE
              </span>
              <h1 tabIndex={-1}>
                A shared home.
                <br />
                Fair <em>shares.</em>
              </h1>
              <p>
                Groceries, cleaning supplies, or things for the house.
                <br className="desktop-break" /> Snap a receipt, or add items
                and pick who’s sharing.
              </p>
              <button
                className="primary camera-cta"
                disabled={!house || busy}
                onClick={camera}
              >
                <Icon />
                Take a receipt photo
                <Icon kind="arrow" />
              </button>
              <span className="camera-note">
                Opens your camera · No file picking
              </span>
              <button
                className="manual-cta"
                onClick={() =>
                  action(async () => {
                    const r = await api("receipts", "POST", {
                      schemaVersion: 1,
                    });
                    open(r);
                    const id = crypto.randomUUID();
                    setDraft({
                      ...r.draft,
                      merchant: "Household items",
                      payerParticipantId: null,
                      items: [
                        {
                          id,
                          description: "",
                          quantity: null,
                          unitPriceCents: null,
                          grossCents: null,
                          sourceLineIds: [],
                        },
                      ],
                      assignments: people.map((p) => ({
                        itemId: id,
                        participantId: p.id,
                        weight: 1,
                      })),
                    });
                    setStep("manual");
                  })
                }
              >
                No receipt? Add items manually <span>↗</span>
              </button>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="art-orbit orbit-one" />
              <div className="art-orbit orbit-two" />
              <span className="float-label label-top">
                <span className="mini-check">✓</span> Receipt, sorted.
              </span>
              <div className="paper-receipt">
                <div className="paper-logo">
                  the corner
                  <br />
                  <strong>market</strong>
                  <span>FRESH FINDS, FAIR SHARES</span>
                </div>
                <div className="paper-divider" />
                <div className="paper-row">
                  <span>Dish soap</span>
                  <b>$4.50</b>
                </div>
                <div className="paper-row">
                  <span>Oat milk</span>
                  <b>$3.00</b>
                </div>
                <div className="paper-row">
                  <span>Paper towels</span>
                  <b>$5.50</b>
                </div>
                <div className="paper-divider" />
                <div className="paper-row paper-total">
                  <span>Total</span>
                  <b>$13.00</b>
                </div>
                <div className="paper-barcode" />
                <small>ILLUSTRATIVE RECEIPT</small>
              </div>
              <div className="split-bubble">
                <div className="avatar-stack">
                  <i>A</i>
                  <i>J</i>
                  <i>M</i>
                </div>
                <div>
                  <strong>Fair shares. Zero drama.</strong>
                  <span>Every cent accounted for.</span>
                </div>
              </div>
              <span className="art-spark spark-one">✳</span>
              <span className="art-spark spark-two">✦</span>
            </div>
          </section>
          <section className="how-it-works">
            <div>
              <span>01</span>
              <h2>Snap it</h2>
              <p>One photo. We’ll handle the typing.</p>
            </div>
            <div>
              <span>02</span>
              <h2>Check it</h2>
              <p>We find the items. You give them a look.</p>
            </div>
            <div>
              <span>03</span>
              <h2>Split it</h2>
              <p>Pick your people. Get the exact shares.</p>
            </div>
          </section>
        </>
      )}
      {step === "camera" && (
        <section className="camera-screen">
          <div className="flow-heading">
            <div>
              <span className="eyebrow">STEP 1 / SNAP</span>
              <h1 tabIndex={-1}>Get the whole receipt.</h1>
              <p>Lay it flat, find good light, and keep every edge in view.</p>
            </div>
            <button
              className="icon-button"
              aria-label="Close camera"
              onClick={() => {
                stopCamera();
                setStep("home");
              }}
            >
              <Icon kind="close" />
            </button>
          </div>
          <div className="viewfinder">
            <video ref={video} autoPlay playsInline muted />
            <div className="camera-guide" />
            <span className="viewfinder-tip">
              {ready
                ? "Keep it steady. You’ve got this."
                : "Waiting for your camera…"}
            </span>
          </div>
          <div className="capture-actions">
            {ready ? (
              <button
                className="shutter"
                aria-label="Take photo"
                disabled={busy}
                onClick={capture}
              >
                <span />
              </button>
            ) : (
              <button className="primary" onClick={camera}>
                Try camera again
              </button>
            )}
            <p>Your photo is read automatically.</p>
          </div>
        </section>
      )}
      {step === "reading" && (
        <section className="reading-screen">
          <div className="scan-animation">
            <Icon kind="receipt" />
            <span />
          </div>
          <span className="eyebrow">A LITTLE RECEIPT MAGIC</span>
          <h1 tabIndex={-1}>We’ll take it from here.</h1>
          <p role="status">{progress}…</p>
          <p className="muted">
            Your receipt stays private. You’ll check the results next.
          </p>
        </section>
      )}
      {draft &&
        receipt?.status === "draft" &&
        ["manual", "review", "split"].includes(step) && (
          <div className="draft-status" role="status">
            {busy
              ? "Saving…"
              : dirty
                ? "Unsaved edits · saved when you leave this screen"
                : "Saved draft"}
          </div>
        )}
      {inactiveReferences &&
        ["manual", "review", "split"].includes(step) &&
        draft && (
          <div className="ocr-warnings">
            Some assigned people are archived. Restore them in My account or{" "}
            <button
              className="text-link"
              onClick={() =>
                edit({
                  ...draft,
                  assignments: draft.assignments.filter((a) =>
                    people.some((p) => p.id === a.participantId),
                  ),
                  payerParticipantId: people.some(
                    (p) => p.id === draft.payerParticipantId,
                  )
                    ? draft.payerParticipantId
                    : null,
                })
              }
            >
              remove their shares from this draft
            </button>
            .
          </div>
        )}
      {step === "manual" && draft && receipt && (
        <section className="flow manual-flow">
          <fieldset className="flow-fields" disabled={busy}>
            <div className="flow-heading">
              <div>
                <span className="eyebrow">NO RECEIPT NEEDED</span>
                <h1 tabIndex={-1}>A few items. A fair split.</h1>
                <p>Item, cost, and who’s sharing. That’s it.</p>
              </div>
            </div>
            <div className="review-card">
              <div className="manual-categories">
                <button
                  className={draft.merchant === "Groceries" ? "selected" : ""}
                  onClick={() => edit({ ...draft, merchant: "Groceries" })}
                >
                  Groceries
                </button>
                <button
                  className={draft.merchant !== "Groceries" ? "selected" : ""}
                  onClick={() =>
                    edit({ ...draft, merchant: "Household items" })
                  }
                >
                  Household items
                </button>
              </div>
              <div className="people-heading">
                <h2>Who’s sharing?</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    action(async () => {
                      setHouse(
                        await api("participants", "POST", {
                          schemaVersion: 1,
                          expectedHouseholdVersion: house!.version,
                          displayName: name,
                        }),
                      );
                      setName("");
                    });
                  }}
                >
                  <input
                    aria-label="Roommate name"
                    placeholder="Add a name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                    required
                  />
                  <button aria-label="Add roommate">+</button>
                </form>
              </div>
              {draft.items.map((item, index) => (
                <div className="manual-item" key={item.id}>
                  <div className="manual-item-fields">
                    <label>
                      Item
                      <input
                        aria-label={`Item ${index + 1}`}
                        placeholder={
                          draft.merchant === "Groceries"
                            ? "Milk, bread, fruit…"
                            : "Dish soap, a kettle, paper towels…"
                        }
                        value={item.description}
                        onChange={(e) =>
                          edit({
                            ...draft,
                            items: draft.items.map((i) =>
                              i.id === item.id
                                ? { ...i, description: e.target.value }
                                : i,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Cost ($)
                      <Amount
                        label={`Cost for item ${index + 1}`}
                        value={item.grossCents}
                        onChange={(grossCents) =>
                          edit({
                            ...draft,
                            items: draft.items.map((i) =>
                              i.id === item.id ? { ...i, grossCents } : i,
                            ),
                          })
                        }
                      />
                    </label>
                    <button
                      className="remove-row"
                      aria-label={`Remove item ${index + 1}`}
                      onClick={() =>
                        edit({
                          ...draft,
                          items: draft.items.filter((i) => i.id !== item.id),
                          assignments: draft.assignments.filter(
                            (a) => a.itemId !== item.id,
                          ),
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                  <span className="sharing-label">SPLIT WITH</span>
                  <div className="person-chips">
                    {people.map((p, index) => {
                      const included = draft.assignments.some(
                        (a) => a.itemId === item.id && a.participantId === p.id,
                      );
                      return (
                        <button
                          key={p.id}
                          className={included ? "selected" : ""}
                          aria-pressed={included}
                          onClick={() =>
                            edit({
                              ...draft,
                              assignments: included
                                ? draft.assignments.filter(
                                    (a) =>
                                      !(
                                        a.itemId === item.id &&
                                        a.participantId === p.id
                                      ),
                                  )
                                : [
                                    ...draft.assignments,
                                    {
                                      itemId: item.id,
                                      participantId: p.id,
                                      weight: 1,
                                    },
                                  ],
                            })
                          }
                        >
                          <i className={"avatar a" + (index % 4)}>
                            {p.displayName[0]}
                          </i>
                          {p.displayName}
                          {included ? " ✓" : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <button
                className="add-row"
                onClick={() => {
                  const id = crypto.randomUUID();
                  edit({
                    ...draft,
                    items: [
                      ...draft.items,
                      {
                        id,
                        description: "",
                        quantity: null,
                        unitPriceCents: null,
                        grossCents: null,
                        sourceLineIds: [],
                      },
                    ],
                    assignments: [
                      ...draft.assignments,
                      ...people.map((p) => ({
                        itemId: id,
                        participantId: p.id,
                        weight: 1,
                      })),
                    ],
                  });
                }}
              >
                + Add another item
              </button>
              <label className="payer">
                Paid by
                <select
                  aria-label="Paid by"
                  value={draft.payerParticipantId ?? ""}
                  onChange={(e) =>
                    edit({
                      ...draft,
                      payerParticipantId: e.target.value || null,
                    })
                  }
                >
                  <option value="">Choose a person</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="manual-total">
                <span>Total</span>
                <strong>
                  {draft.items.length &&
                  draft.items.every((i) => i.grossCents !== null)
                    ? formatMoney(
                        draft.items.reduce(
                          (sum, i) => sum + BigInt(i.grossCents!),
                          0n,
                        ),
                      )
                    : "Add item costs"}
                </strong>
              </div>
            </div>
            <div className="flow-bottom">
              <button
                className="text-link"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    await save(draft);
                    setStep("home");
                  })
                }
              >
                Save for later
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    if (
                      !draft.items.length ||
                      draft.items.some(
                        (i) => !i.description.trim() || i.grossCents === null,
                      )
                    )
                      throw Error("Add an item name and cost for each item.");
                    if (
                      draft.items.some(
                        (i) =>
                          !draft.assignments.some((a) => a.itemId === i.id),
                      )
                    )
                      throw Error("Choose at least one person for each item.");
                    if (!draft.payerParticipantId)
                      throw Error(
                        "Choose who paid before calculating the split.",
                      );
                    const d: Draft = {
                      ...draft,
                      reviewedTotalCents: draft.items
                        .reduce((sum, i) => sum + BigInt(i.grossCents!), 0n)
                        .toString(),
                      review: { ...draft.review, confirmed: true },
                    };
                    setDraft(d);
                    const r = await save(d);
                    setResult(
                      await api(`receipts/${r.id}/preview`, "POST", {
                        schemaVersion: 1,
                        expectedVersion: r.version,
                      }),
                    );
                    setStep("done");
                  })
                }
              >
                {busy ? "Working…" : "See the split"}
                <Icon kind="arrow" />
              </button>
            </div>
            <button
              className="delete-link"
              disabled={busy}
              onClick={() => action(removeReceipt)}
            >
              Delete draft
            </button>
          </fieldset>
        </section>
      )}
      {(step === "review" || step === "split") && draft && receipt && (
        <section className="flow">
          <fieldset className="flow-fields" disabled={busy}>
            <div className="step-strip">
              <span className="completed">01 Snap ✓</span>
              <span className={step === "review" ? "current" : "completed"}>
                02 Check {step === "split" ? "✓" : ""}
              </span>
              <span className={step === "split" ? "current" : ""}>
                03 Split
              </span>
            </div>
            <div className="flow-heading">
              <div>
                <span className="eyebrow">
                  {step === "review" ? "LOOKS RIGHT?" : "WHO’S SHARING?"}
                </span>
                <h1 tabIndex={-1}>
                  {step === "review"
                    ? "A quick check. Then split."
                    : "Your items. Your people."}
                </h1>
                <p>
                  {step === "review"
                    ? "We did the typing. Check the items and prices below."
                    : "Tap a name on each item to include or exclude them."}
                </p>
              </div>
              {receipt.image && (
                <a
                  className="text-link"
                  href={receipt.image.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  View receipt ↗
                </a>
              )}
            </div>
            {receipt.image && (
              <>
                <MobileReceipt url={receipt.image.url} />
                <div className="scan-recovery">
                  <span>
                    Reading: {receipt.processing?.state ?? "not started"}
                  </span>
                  <button
                    className="text-link"
                    onClick={() => action(retryReading)}
                  >
                    Retry reading
                  </button>
                  <button
                    className="text-link"
                    onClick={() =>
                      action(async () => {
                        await persistBeforeNavigation();
                        await reopen(await api(`receipts/${receipt.id}`));
                      })
                    }
                  >
                    Refresh scan status
                  </button>
                  {receipt.processing?.result &&
                    receipt.processing.id !== draft.review.sourceAttemptId && (
                      <button
                        className="text-link"
                        onClick={() => action(useScan)}
                      >
                        Use recovered scan
                      </button>
                    )}
                </div>
              </>
            )}
            {source && step === "review" && <OCRWarnings source={source} />}
            <div className="review-layout">
              <div className="review-card">
                {step === "review" ? (
                  <>
                    <div className="store-line">
                      <Icon kind="receipt" />
                      <input
                        aria-label="Store"
                        placeholder="Store name (optional)"
                        value={draft.merchant ?? ""}
                        onChange={(e) =>
                          edit({ ...draft, merchant: e.target.value || null })
                        }
                      />
                      <span>{draft.items.length} items</span>
                    </div>
                    <div className="table-caption">
                      <span>ITEM</span>
                      <span>PRICE</span>
                    </div>
                    {draft.items.map((item, index) => (
                      <div className="grocery-row" key={item.id}>
                        <span className="item-index">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <input
                          aria-label={`Item ${index + 1}`}
                          value={item.description}
                          placeholder="Item name"
                          onChange={(e) =>
                            edit({
                              ...draft,
                              items: draft.items.map((i) =>
                                i.id === item.id
                                  ? { ...i, description: e.target.value }
                                  : i,
                              ),
                            })
                          }
                        />
                        <Amount
                          label={`Price for item ${index + 1}`}
                          value={item.grossCents}
                          onChange={(grossCents) =>
                            edit({
                              ...draft,
                              items: draft.items.map((i) =>
                                i.id === item.id ? { ...i, grossCents } : i,
                              ),
                            })
                          }
                        />
                        <button
                          className="remove-row"
                          aria-label={`Remove item ${index + 1}`}
                          onClick={() =>
                            edit({
                              ...draft,
                              items: draft.items.filter(
                                (i) => i.id !== item.id,
                              ),
                              assignments: draft.assignments.filter(
                                (a) => a.itemId !== item.id,
                              ),
                              adjustments: draft.adjustments.map((a) => ({
                                ...a,
                                targetItemIds: a.targetItemIds.filter(
                                  (id) => id !== item.id,
                                ),
                                eligibilityConfirmed: false,
                              })),
                            })
                          }
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      className="add-row"
                      onClick={() => {
                        const id = crypto.randomUUID();
                        edit({
                          ...draft,
                          items: [
                            ...draft.items,
                            {
                              id,
                              description: "",
                              quantity: null,
                              unitPriceCents: null,
                              grossCents: null,
                              sourceLineIds: [],
                            },
                          ],
                          assignments: [
                            ...draft.assignments,
                            ...people.map((p) => ({
                              itemId: id,
                              participantId: p.id,
                              weight: 1,
                            })),
                          ],
                        });
                      }}
                    >
                      + Add an item
                    </button>
                    {draft.adjustments.map((a) => (
                      <div className="adjustment-card" key={a.id}>
                        <div className="adjustment-row">
                          <div>
                            <strong>{a.label}</strong>
                            <small>
                              {a.kind.includes("discount")
                                ? "Discount"
                                : "Shared charge"}{" "}
                              ·{" "}
                              {a.eligibilityConfirmed
                                ? "confirmed for"
                                : "suggested for"}{" "}
                              {a.targetItemIds.length === draft.items.length
                                ? "all items"
                                : a.targetItemIds.length + " items"}
                            </small>
                          </div>
                          <Amount
                            label={`Amount for ${a.label}`}
                            value={a.amountCents}
                            onChange={(amountCents) =>
                              edit({
                                ...draft,
                                adjustments: draft.adjustments.map((x) =>
                                  x.id === a.id ? { ...x, amountCents } : x,
                                ),
                              })
                            }
                          />
                        </div>
                        <label className="check eligibility-check">
                          <input
                            type="checkbox"
                            checked={a.eligibilityConfirmed}
                            onChange={(e) =>
                              edit({
                                ...draft,
                                adjustments: draft.adjustments.map((x) =>
                                  x.id === a.id
                                    ? {
                                        ...x,
                                        eligibilityConfirmed: e.target.checked,
                                      }
                                    : x,
                                ),
                              })
                            }
                          />
                          I checked which items {a.label} applies to.
                        </label>
                        {!a.eligibilityConfirmed && (
                          <p className="eligibility-note">
                            Eligibility is not confirmed. Choose eligible items
                            below, then check this box.
                          </p>
                        )}
                      </div>
                    ))}
                    <details className="advanced">
                      <summary>
                        Adjust tax, discounts or receipt details
                      </summary>
                      <label>
                        Purchase date
                        <input
                          type="date"
                          value={draft.purchasedOn ?? ""}
                          onChange={(e) =>
                            edit({
                              ...draft,
                              purchasedOn: e.target.value || null,
                            })
                          }
                        />
                      </label>
                      {draft.adjustments.map((a) => (
                        <div className="adjustment-settings" key={a.id}>
                          <input
                            aria-label="Adjustment label"
                            value={a.label}
                            onChange={(e) =>
                              edit({
                                ...draft,
                                adjustments: draft.adjustments.map((x) =>
                                  x.id === a.id
                                    ? { ...x, label: e.target.value }
                                    : x,
                                ),
                              })
                            }
                          />
                          <select
                            aria-label="Adjustment type"
                            value={a.kind}
                            onChange={(e) =>
                              edit({
                                ...draft,
                                adjustments: draft.adjustments.map((x) =>
                                  x.id === a.id
                                    ? {
                                        ...x,
                                        kind: e.target.value as typeof a.kind,
                                      }
                                    : x,
                                ),
                              })
                            }
                          >
                            {[
                              "tax",
                              "fee",
                              "receipt_discount",
                              "line_discount",
                            ].map((k) => (
                              <option key={k} value={k}>
                                {k.replaceAll("_", " ")}
                              </option>
                            ))}
                          </select>
                          {draft.items.map((i) => (
                            <label className="check" key={i.id}>
                              <input
                                type="checkbox"
                                checked={a.targetItemIds.includes(i.id)}
                                onChange={(e) =>
                                  edit({
                                    ...draft,
                                    adjustments: draft.adjustments.map((x) =>
                                      x.id === a.id
                                        ? {
                                            ...x,
                                            targetItemIds: e.target.checked
                                              ? [...x.targetItemIds, i.id]
                                              : x.targetItemIds.filter(
                                                  (id) => id !== i.id,
                                                ),
                                          }
                                        : x,
                                    ),
                                  })
                                }
                              />
                              {i.description || "Unnamed item"}
                            </label>
                          ))}
                          <button
                            className="text-link"
                            onClick={() =>
                              edit({
                                ...draft,
                                adjustments: draft.adjustments.filter(
                                  (x) => x.id !== a.id,
                                ),
                              })
                            }
                          >
                            Remove adjustment
                          </button>
                        </div>
                      ))}
                      <button
                        className="add-row"
                        onClick={() =>
                          edit({
                            ...draft,
                            adjustments: [
                              ...draft.adjustments,
                              {
                                id: crypto.randomUUID(),
                                sequence:
                                  Math.max(
                                    0,
                                    ...draft.adjustments.map((a) => a.sequence),
                                  ) + 1,
                                kind: "tax",
                                label: "Tax",
                                amountCents: null,
                                targetItemIds: draft.items.map((i) => i.id),
                                eligibilityConfirmed: false,
                              },
                            ],
                          })
                        }
                      >
                        + Add tax or discount
                      </button>
                    </details>
                    {source && (
                      <details
                        className="advanced"
                        open={unresolved.length > 0}
                      >
                        <summary>
                          {unresolved.length
                            ? `${unresolved.length} receipt lines need your help`
                            : "Check the original text"}
                        </summary>
                        <p className="muted">
                          Confirm each line is included above or is receipt
                          information.
                        </p>
                        {source.lines.map((l) => (
                          <label className="source-line" key={l.id}>
                            {l.text}
                            <select
                              aria-label={`Classify ${l.text}`}
                              value={
                                draft.review.lineResolutions.find(
                                  (x) => x.lineId === l.id,
                                )?.resolution ?? "unsupported"
                              }
                              onChange={(e) =>
                                edit({
                                  ...draft,
                                  review: {
                                    ...draft.review,
                                    lineResolutions: [
                                      ...draft.review.lineResolutions.filter(
                                        (x) => x.lineId !== l.id,
                                      ),
                                      {
                                        lineId: l.id,
                                        resolution: e.target
                                          .value as "resolved",
                                      },
                                    ],
                                  },
                                })
                              }
                            >
                              <option value="unsupported">Needs review</option>
                              <option value="resolved">
                                Included in the receipt
                              </option>
                              <option value="metadata">
                                Store info / payment
                              </option>
                            </select>
                          </label>
                        ))}
                      </details>
                    )}
                    <div className="receipt-total">
                      <strong>Receipt total</strong>
                      <div>
                        <span>$</span>
                        <Amount
                          label="Receipt total"
                          value={draft.reviewedTotalCents}
                          onChange={(reviewedTotalCents) =>
                            edit({ ...draft, reviewedTotalCents })
                          }
                        />
                      </div>
                    </div>
                    <Reconciliation draft={draft} />
                    <label className="review-confirm check">
                      <input
                        type="checkbox"
                        checked={draft.review.confirmed}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            review: {
                              ...draft.review,
                              confirmed: e.target.checked,
                            },
                          })
                        }
                      />
                      I checked the items, charges and total against my receipt.
                    </label>
                  </>
                ) : (
                  <>
                    <div className="people-heading">
                      <h2>Your people</h2>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          action(async () => {
                            const h: Household = await api(
                              "participants",
                              "POST",
                              {
                                schemaVersion: 1,
                                expectedHouseholdVersion: house!.version,
                                displayName: name,
                              },
                            );
                            setHouse(h);
                            setName("");
                          });
                        }}
                      >
                        <input
                          aria-label="Roommate name"
                          placeholder="Add a name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                          maxLength={80}
                        />
                        <button aria-label="Add roommate">+</button>
                      </form>
                    </div>
                    <label className="payer">
                      Who paid?
                      <select
                        aria-label="Paid by"
                        value={draft.payerParticipantId ?? ""}
                        onChange={(e) =>
                          edit({
                            ...draft,
                            payerParticipantId: e.target.value || null,
                          })
                        }
                      >
                        <option value="">Choose a person</option>
                        {people.map((p) => (
                          <option value={p.id} key={p.id}>
                            {p.displayName}
                          </option>
                        ))}
                      </select>
                    </label>
                    {draft.items.map((i) => (
                      <div className="sharing-row" key={i.id}>
                        <div>
                          <strong>{i.description}</strong>
                          <span>
                            {i.grossCents === null
                              ? "Missing price"
                              : formatMoney(i.grossCents)}
                          </span>
                        </div>
                        <div className="person-chips">
                          {people.map((p, index) => {
                            const assignment = draft.assignments.find(
                              (a) =>
                                a.itemId === i.id && a.participantId === p.id,
                            );
                            return (
                              <button
                                key={p.id}
                                className={assignment ? "selected" : ""}
                                aria-pressed={!!assignment}
                                onClick={() =>
                                  edit({
                                    ...draft,
                                    assignments: assignment
                                      ? draft.assignments.filter(
                                          (a) =>
                                            !(
                                              a.itemId === i.id &&
                                              a.participantId === p.id
                                            ),
                                        )
                                      : [
                                          ...draft.assignments,
                                          {
                                            itemId: i.id,
                                            participantId: p.id,
                                            weight: 1,
                                          },
                                        ],
                                  })
                                }
                              >
                                <i className={"avatar a" + (index % 4)}>
                                  {p.displayName[0]}
                                </i>
                                {p.displayName}
                                {assignment ? " ✓" : ""}
                              </button>
                            );
                          })}
                        </div>
                        <details className="weight-settings">
                          <summary>Unequal shares</summary>
                          {draft.assignments
                            .filter((a) => a.itemId === i.id)
                            .map((a) => (
                              <label key={a.participantId}>
                                {
                                  people.find((p) => p.id === a.participantId)
                                    ?.displayName
                                }
                                <input
                                  aria-label={`Share weight for ${i.description} ${a.participantId}`}
                                  type="number"
                                  min="1"
                                  max="10000"
                                  value={a.weight}
                                  onChange={(e) =>
                                    edit({
                                      ...draft,
                                      assignments: draft.assignments.map((x) =>
                                        x === a
                                          ? {
                                              ...x,
                                              weight: Number(e.target.value),
                                            }
                                          : x,
                                      ),
                                    })
                                  }
                                />
                              </label>
                            ))}
                        </details>
                      </div>
                    ))}
                  </>
                )}
              </div>
              <aside className="flow-aside">
                {receipt.image && (
                  <div className="source-preview">
                    <span>YOUR RECEIPT</span>
                    <img src={receipt.image.url} alt="Your receipt photo" />
                  </div>
                )}
                <div className="quiet-note">
                  <span>✳</span>
                  <h3>A fair split, down to the cent.</h3>
                  <p>
                    Shared items follow your choices. Tax and discounts follow
                    the items they apply to.
                  </p>
                </div>
              </aside>
            </div>
            <div className="flow-bottom">
              <button
                className="text-link"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    await save(draft);
                    setStep(step === "split" ? "review" : "home");
                  })
                }
              >
                {step === "split" ? "← Back to receipt" : "Save for later"}
              </button>
              <button
                className="primary"
                disabled={
                  busy ||
                  (step === "review" &&
                    (!draft.review.confirmed ||
                      missingEligibility ||
                      !draft.items.length ||
                      unresolved.length > 0 ||
                      totals?.difference !== 0n))
                }
                onClick={() =>
                  action(async () => {
                    if (step === "review") {
                      await save(draft);
                      setStep("split");
                    } else {
                      if (!draft.payerParticipantId)
                        throw Error(
                          "Choose who paid before calculating the split.",
                        );
                      const confirmed = {
                        ...draft,
                        review: { ...draft.review, confirmed: true },
                      };
                      setDraft(confirmed);
                      const r = await save(confirmed);
                      const s: Split = await api(
                        `receipts/${r.id}/preview`,
                        "POST",
                        { schemaVersion: 1, expectedVersion: r.version },
                      );
                      setResult(s);
                      setStep("done");
                    }
                  })
                }
              >
                {busy
                  ? "Saving…"
                  : step === "review"
                    ? "Looks good. Pick people"
                    : "See the split"}
                <Icon kind="arrow" />
              </button>
            </div>
            <button
              className="delete-link"
              disabled={busy}
              onClick={() => action(removeReceipt)}
            >
              Delete draft
            </button>
          </fieldset>
        </section>
      )}
      {step === "done" && result && receipt && (
        <section className="done-screen">
          <span className="success-mark">✓</span>
          <span className="eyebrow">
            {receipt.status === "finalized"
              ? "SAVED & SORTED"
              : "HERE’S THE SPLIT"}
          </span>
          <h1 tabIndex={-1}>
            All shared.
            <br />
            <em>Fair shares.</em>
          </h1>
          <p className="done-total">
            {formatMoney(result.totalCents)} <span>total</span>
          </p>
          <div className="share-list">
            {result.shares.map((s, i) => (
              <div key={s.participantId}>
                <span className={"avatar a" + (i % 4)}>{s.name[0]}</span>
                <div>
                  <strong>{s.name}</strong>
                  <small>
                    {s.isPayer
                      ? "Paid the receipt"
                      : `Owes ${result.shares.find((p) => p.isPayer)?.name ?? "the payer"}`}
                  </small>
                </div>
                <b>{formatMoney(s.finalCents)}</b>
              </div>
            ))}
          </div>
          <p className="muted">
            The payer receives {formatMoney(result.reimbursementCents)} back.
            Their own share is already covered.
          </p>
          {receipt.status !== "finalized" ? (
            <div className="done-actions">
              <button
                className="text-link"
                onClick={() =>
                  setStep(
                    !receipt.image && draft?.adjustments.length === 0
                      ? "manual"
                      : "split",
                  )
                }
              >
                ← Adjust people
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    const r = await api(
                      `receipts/${receipt.id}/finalize`,
                      "POST",
                      { schemaVersion: 1, expectedVersion: receipt.version },
                    );
                    open(r);
                  })
                }
              >
                {busy ? "Saving…" : "Confirm & save split"}
                <Icon kind="arrow" />
              </button>
            </div>
          ) : (
            <button className="primary" onClick={camera}>
              <Icon />
              Scan another receipt
            </button>
          )}
          <details className="advanced">
            <summary>How the cents add up</summary>
            <p>
              Each item is shared by your weights. Leftover cents go to the
              largest fractional remainder, with a stable order for ties.
            </p>
            {result.items.map((i) => (
              <p key={i.itemId}>
                {draft?.items.find((x) => x.id === i.itemId)?.description}:
                gross {formatMoney(i.grossCents)} − discount{" "}
                {formatMoney(i.discountCents)} → final{" "}
                {formatMoney(i.finalCents)}
              </p>
            ))}
          </details>
          <button
            className="delete-link"
            disabled={busy}
            onClick={() => action(removeReceipt)}
          >
            Delete receipt
          </button>
        </section>
      )}
      {step === "history" && (
        <section className="history-screen">
          <span className="eyebrow">ALL SORTED</span>
          <h1 tabIndex={-1}>Past splits.</h1>
          <p>Your receipts, right where you left them.</p>
          <details className="history-filters">
            <summary>Filter by date</summary>
            <div>
              <label>
                From date
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label>
                To date
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              <button
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    if (from && to && from > to)
                      throw Error("From date must be before To date.");
                    await loadHistory(undefined, { from, to });
                  })
                }
              >
                Apply dates
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    setFrom("");
                    setTo("");
                    const list = await api("receipts");
                    setHistory(list.receipts);
                    setNextCursor(list.nextCursor);
                    appliedHistoryFilters.current = { from: "", to: "" };
                  })
                }
              >
                Clear dates
              </button>
            </div>
          </details>
          {history.length === 0 ? (
            <div className="history-empty">
              <Icon kind="receipt" />
              <h2>Your first split starts with a photo.</h2>
              <button className="primary" onClick={camera}>
                Take a receipt photo
              </button>
            </div>
          ) : (
            history.map((r) => (
              <button
                className="history-entry"
                key={r.id}
                onClick={() =>
                  action(async () => {
                    await persistBeforeNavigation();
                    await reopen(await api(`receipts/${r.id}`));
                  })
                }
              >
                <span className="history-icon">
                  <Icon kind="receipt" />
                </span>
                <div>
                  <strong>{r.merchant ?? "Shared purchase"}</strong>
                  <span>
                    {r.date
                      ? `${String(r.date).slice(0, 10)} · ${r.dateSource === "created" ? "created date · " : ""}`
                      : ""}
                    {r.status === "finalized"
                      ? "Saved split"
                      : "Draft · finish reviewing"}
                  </span>
                </div>
                <b>
                  {r.finalization
                    ? formatMoney(r.finalization.totalCents)
                    : "Continue →"}
                </b>
              </button>
            ))
          )}
        </section>
      )}
      {step === "history" && nextCursor && (
        <button
          className="load-more"
          disabled={busy}
          onClick={() =>
            action(async () => {
              await loadHistory(nextCursor);
            })
          }
        >
          {busy ? "Loading…" : "Load more receipts"}
        </button>
      )}
      <dialog
        ref={accountDialog}
        className="account-dialog"
        onCancel={() => setAccountOpen(false)}
      >
        <div className="dialog-heading">
          <h2>My account</h2>
          <button
            className="icon-button"
            aria-label="Close account"
            onClick={() => setAccountOpen(false)}
          >
            ×
          </button>
        </div>
        {accountOpen && error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        {accountOpen && notice && (
          <p role="status" className="save-notice">
            {notice}
          </p>
        )}
        <p className="account-identity">
          {house?.account
            ? `${house.account.mode === "development" ? "Local preview" : "Signed in"} · ${house.account.displayName}`
            : "Not signed in"}
        </p>
        {house?.account?.mode === "development" ? (
          <>
            <p className="muted">
              This local preview uses a development account, so signing out does
              not disable it.
            </p>
            <a href="/api/auth/signin">Sign in with a hosted account ↗</a>
          </>
        ) : house?.account ? (
          <a href="/api/auth/signout" className="signout-link">
            Sign out
          </a>
        ) : (
          <a href="/api/auth/signin">Sign in</a>
        )}
        <h3>Your people</h3>
        <p className="muted">
          Renames and archives do not change names on saved splits.
        </p>
        <AccountPeople
          people={house?.participants ?? []}
          busy={busy}
          onRename={(p) => {
            action(async () => {
              await changePerson(p, true);
            });
          }}
          onArchive={(p) => {
            action(async () => {
              await changePerson(p);
            });
          }}
        />
      </dialog>
      <footer>
        <span>Made for the people you share a home with.</span>
        <span>Private receipts. Exact cents.</span>
      </footer>
    </main>
  );
}
