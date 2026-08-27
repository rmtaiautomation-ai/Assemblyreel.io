"use client";

import React, { useMemo, useState, useTransition } from "react";
import { Plus, Trash2, ShieldAlert, ShieldCheck } from "lucide-react";
import {
  FACT_KINDS,
  FACT_KIND_LABELS,
  type ChannelFact,
  type FactKind,
} from "@/lib/ai/channel-facts";
import {
  deleteChannelFact,
  setFactsVerified,
  upsertChannelFact,
} from "@/app/actions/fact-actions";

/**
 * The Facts tab — the list of named sources this channel may cite.
 * (implementation_plans/22-channel-fact-ledger.md)
 *
 * ## Why this is a review screen and not a form
 *
 * Nobody sits down and types forty verified citations; asking them to would make this
 * feature research work rather than settings work, which is the same mistake the
 * twenty-five-field blueprint form made before `ChannelBriefBuilder` was put in front of
 * it. The rows here arrive already populated, extracted by the Fact Archivist from the
 * research the user pasted into the Format tab. The work left is judgement: is this real?
 *
 * ## The tick is the whole feature
 *
 * `verified` gates what reaches a prompt, and it is the one thing a model must never set
 * for itself — the ledger's entire value is that a human confirmed each entry. So the
 * unverified rows are surfaced first and loudly, the archivist's doubts are rendered as a
 * warning rather than buried in a notes column, and the header states the ratio plainly.
 * A ledger where everything is ticked without being read protects nothing, so nothing here
 * encourages a blind "verify all" — the bulk action is offered only for the rows the
 * archivist itself judged independently checkable.
 */

const inputClass = "ed-field px-3 py-2 text-sm";
const cellInputClass = "ed-field px-2 py-1.5 text-sm";

/** The archivist prefixes source notes it could not confirm. See addExtractedFacts. */
const UNCHECKABLE_PREFIX = "NOT INDEPENDENTLY CHECKABLE";

function isUncheckable(fact: ChannelFact): boolean {
  return fact.sourceNote.startsWith(UNCHECKABLE_PREFIX);
}

export interface ChannelFactsSectionProps {
  workspaceId: string;
  initialFacts: ChannelFact[];
  /** True when db/add-channel-facts.sql has not run — the tab explains rather than fails. */
  migrationPending?: boolean;
}

const EMPTY_DRAFT = {
  kind: "person" as FactKind,
  label: "",
  detail: "",
  alwaysUse: false,
  sourceNote: "",
};

export default function ChannelFactsSection({
  workspaceId,
  initialFacts,
  migrationPending = false,
}: ChannelFactsSectionProps) {
  const [facts, setFacts] = useState<ChannelFact[]>(initialFacts);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const verifiedCount = facts.filter((fact) => fact.verified).length;

  // Unverified first, and within that the doubtful ones first — the rows needing a decision
  // are the reason to open this tab, so they should never be below the fold.
  const ordered = useMemo(() => {
    return [...facts].sort((a, b) => {
      if (a.verified !== b.verified) return a.verified ? 1 : -1;
      if (isUncheckable(a) !== isUncheckable(b)) return isUncheckable(a) ? -1 : 1;
      if (a.alwaysUse !== b.alwaysUse) return a.alwaysUse ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
  }, [facts]);

  const checkableUnverified = facts.filter(
    (fact) => !fact.verified && !isUncheckable(fact)
  );

  function apply(result: { success: boolean; facts?: ChannelFact[]; error?: string }) {
    if (!result.success) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    setError(null);
    if (result.facts) setFacts(result.facts);
  }

  function handleFieldChange(fact: ChannelFact, patch: Partial<ChannelFact>) {
    // Optimistic: a checkbox that waits on a round trip before moving feels broken when
    // you are working down a list of forty.
    const next = { ...fact, ...patch };
    setFacts((prev) => prev.map((row) => (row.id === fact.id ? next : row)));
    startTransition(async () => apply(await upsertChannelFact(workspaceId, next)));
  }

  function handleDelete(fact: ChannelFact) {
    setFacts((prev) => prev.filter((row) => row.id !== fact.id));
    startTransition(async () => apply(await deleteChannelFact(workspaceId, fact.id)));
  }

  function handleAdd() {
    if (!draft.label.trim()) return;
    const payload = { ...draft, verified: true, sourceNote: "Added by hand." };
    setDraft(EMPTY_DRAFT);
    startTransition(async () => apply(await upsertChannelFact(workspaceId, payload)));
  }

  function handleVerifyCheckable() {
    const ids = checkableUnverified.map((fact) => fact.id);
    if (!ids.length) return;
    setFacts((prev) =>
      prev.map((row) => (ids.includes(row.id) ? { ...row, verified: true } : row))
    );
    startTransition(async () => apply(await setFactsVerified(workspaceId, ids, true)));
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="heading-2 mb-1">Named sources</h2>
        <p className="text-muted max-w-3xl">
          The only people, councils, manuscripts and dates your scripts are allowed to name.
          Anything not on this list, the writer has to describe without naming — which is what
          stops it inventing a scholar or a fragment number. Built automatically from the
          research you paste into the Format tab.
        </p>
      </div>

      {migrationPending && (
        <div className="mb-6 rounded-lg border border-ed-warn-border bg-ed-warn-soft px-4 py-3 text-sm text-ed-warn">
          <strong>Not yet enabled for this database.</strong> Run{" "}
          <code className="font-mono">db/add-channel-facts.sql</code> in the Supabase SQL
          editor, then reload this page. Until then this channel generates without a source
          list, exactly as it did before.
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-ed-danger-border bg-ed-danger-soft px-4 py-3 text-sm text-ed-danger">
          {error}
        </div>
      )}

      {/* --- Status ---------------------------------------------------------- */}
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-ed-border bg-ed-surface px-5 py-4">
        <div>
          <p className="text-2xl font-bold text-ed-text leading-none">
            {verifiedCount}
            <span className="text-ed-text-dim"> / {facts.length}</span>
          </p>
          <p className="text-xs text-ed-text-dim mt-1">verified and in use</p>
        </div>

        <p className="text-sm text-ed-text-dim flex-1 min-w-[16rem]">
          {facts.length === 0
            ? "Nothing here yet. Paste your research into the Format tab and the sources in it land here."
            : verifiedCount === 0
              ? "None of these reach a script yet. Tick the ones you have checked are real."
              : `${verifiedCount === 1 ? "One source is" : `${verifiedCount} sources are`} available to the writer. Unticked rows are ignored entirely.`}
        </p>

        {checkableUnverified.length > 0 && (
          <button
            type="button"
            onClick={handleVerifyCheckable}
            disabled={pending}
            className="rounded-lg border border-ed-accent px-3 py-2 text-xs font-semibold text-ed-accent disabled:opacity-40"
          >
            Verify {checkableUnverified.length} checkable
          </button>
        )}
      </div>

      {/* --- The ledger ------------------------------------------------------- */}
      {ordered.length > 0 && (
        <div className="mb-8 overflow-x-auto rounded-xl border border-ed-border">
          <table className="w-full min-w-[56rem] text-sm">
            <thead>
              <tr className="border-b border-ed-border bg-ed-well text-left">
                <th className="px-3 py-2.5 font-semibold text-ed-text-dim w-20">Use</th>
                <th className="px-3 py-2.5 font-semibold text-ed-text-dim w-44">Kind</th>
                <th className="px-3 py-2.5 font-semibold text-ed-text-dim">Name</th>
                <th className="px-3 py-2.5 font-semibold text-ed-text-dim">Detail</th>
                <th className="px-3 py-2.5 font-semibold text-ed-text-dim w-24">Every ep.</th>
                <th className="px-3 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody>
              {ordered.map((fact) => {
                const doubtful = isUncheckable(fact);
                return (
                  <React.Fragment key={fact.id}>
                    <tr
                      className={`border-b border-ed-border align-top ${
                        fact.verified ? "" : "bg-ed-well/40"
                      }`}
                    >
                      <td className="px-3 py-2.5">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={fact.verified}
                            onChange={(e) =>
                              handleFieldChange(fact, { verified: e.target.checked })
                            }
                            className="h-4 w-4 accent-[var(--ed-accent)]"
                          />
                          {fact.verified ? (
                            <ShieldCheck size={15} className="text-ed-ok" />
                          ) : (
                            <ShieldAlert
                              size={15}
                              className={doubtful ? "text-ed-warn" : "text-ed-text-faint"}
                            />
                          )}
                        </label>
                      </td>

                      <td className="px-3 py-2.5">
                        <select
                          className={cellInputClass}
                          value={fact.kind}
                          onChange={(e) =>
                            handleFieldChange(fact, { kind: e.target.value as FactKind })
                          }
                        >
                          {FACT_KINDS.map((kind) => (
                            <option key={kind} value={kind}>
                              {FACT_KIND_LABELS[kind]}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-3 py-2.5">
                        <input
                          type="text"
                          className={cellInputClass}
                          value={fact.label}
                          onChange={(e) =>
                            setFacts((prev) =>
                              prev.map((row) =>
                                row.id === fact.id ? { ...row, label: e.target.value } : row
                              )
                            )
                          }
                          onBlur={(e) => handleFieldChange(fact, { label: e.target.value })}
                        />
                      </td>

                      <td className="px-3 py-2.5">
                        <input
                          type="text"
                          className={cellInputClass}
                          value={fact.detail}
                          placeholder="year, publisher, institution…"
                          onChange={(e) =>
                            setFacts((prev) =>
                              prev.map((row) =>
                                row.id === fact.id ? { ...row, detail: e.target.value } : row
                              )
                            )
                          }
                          onBlur={(e) => handleFieldChange(fact, { detail: e.target.value })}
                        />
                      </td>

                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={fact.alwaysUse}
                          onChange={(e) =>
                            handleFieldChange(fact, { alwaysUse: e.target.checked })
                          }
                          className="h-4 w-4 accent-[var(--ed-accent)]"
                        />
                      </td>

                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => handleDelete(fact)}
                          aria-label={`Remove ${fact.label}`}
                          className="text-ed-text-faint hover:text-ed-danger"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>

                    {/* The archivist's doubt, rendered where it cannot be missed. A note
                        column would put the one thing worth reading in the narrowest cell
                        on the row. */}
                    {doubtful && !fact.verified && (
                      <tr className="border-b border-ed-border bg-ed-warn-soft">
                        <td />
                        <td colSpan={5} className="px-3 pb-2.5 text-xs text-ed-warn">
                          Could not be confirmed from your research —{" "}
                          {fact.sourceNote.replace(`${UNCHECKABLE_PREFIX} — `, "")} Check this
                          one yourself before ticking it.
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* --- Add by hand ------------------------------------------------------ */}
      <div className="rounded-xl border border-ed-border bg-ed-surface p-5">
        <h3 className="text-base font-bold text-ed-text mb-3">Add a source</h3>
        <div className="grid grid-cols-1 md:grid-cols-[12rem_minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-3 items-end">
          <div>
            <label className="block mb-1.5 text-xs font-medium text-ed-text-dim">Kind</label>
            <select
              className={inputClass}
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as FactKind })}
            >
              {FACT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {FACT_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block mb-1.5 text-xs font-medium text-ed-text-dim">Name</label>
            <input
              type="text"
              className={inputClass}
              value={draft.label}
              placeholder="George Nickelsburg"
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
          </div>

          <div>
            <label className="block mb-1.5 text-xs font-medium text-ed-text-dim">Detail</label>
            <input
              type="text"
              className={inputClass}
              value={draft.detail}
              placeholder="2001 commentary on 1 Enoch, Fortress Press"
              onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
            />
          </div>

          <button
            type="button"
            onClick={handleAdd}
            disabled={pending || !draft.label.trim() || migrationPending}
            className="flex items-center gap-2 rounded-lg bg-ed-accent px-4 py-2 text-sm font-semibold text-ed-base disabled:opacity-40"
          >
            <Plus size={15} />
            Add
          </button>
        </div>
        <p className="text-xs text-ed-text-dim mt-3">
          Anything you add here counts as verified — you typed it, so you checked it.
        </p>
      </div>
    </div>
  );
}
