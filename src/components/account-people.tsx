"use client";
import type { Participant } from "@/domain/contracts";
export function AccountPeople({
  people,
  busy,
  onRename,
  onArchive,
}: {
  people: Participant[];
  busy: boolean;
  onRename: (p: Participant) => void;
  onArchive: (p: Participant) => void;
}) {
  const row = (p: Participant) => (
    <div className="manage-person" key={p.id}>
      <span>
        {p.displayName}
        {p.archived ? " · archived" : ""}
      </span>
      <button
        disabled={busy}
        onClick={() => onRename(p)}
        aria-label={`Rename ${p.displayName}`}
      >
        Rename
      </button>
      <button
        disabled={busy}
        onClick={() => onArchive(p)}
        aria-label={`${p.archived ? "Restore" : "Archive"} ${p.displayName}`}
      >
        {p.archived ? "Restore" : "Archive"}
      </button>
    </div>
  );
  const archived = people.filter((p) => p.archived);
  return (
    <>
      {people.filter((p) => !p.archived).map(row)}
      {archived.length > 0 && (
        <details className="archived-people">
          <summary>Archived people ({archived.length})</summary>
          {archived.map(row)}
        </details>
      )}
    </>
  );
}
