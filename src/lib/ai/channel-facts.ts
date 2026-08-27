/**
 * The Channel Fact Ledger — the named sources a channel is allowed to cite.
 * (implementation_plans/22-channel-fact-ledger.md)
 *
 * ## Why a channel needs one
 *
 * An evidence-led documentary format names a real scholar, council, manuscript or date
 * every fifteen to twenty seconds, and that cadence is the whole credibility mechanism.
 * The Script Writer, though, receives a topic, an outline and a persona — nothing more. So
 * when it reaches a beat that demands a named source it has none to reach for and invents
 * one: a real scholar attached to a paper they never wrote, a fragment number belonging to
 * nothing. That is not a prompt-quality problem to be argued away with a firmer instruction;
 * the format opens a slot every few sentences and a language model fills every slot it is
 * given. The only fix is to supply the slot's contents.
 *
 * ## Why it is small, and why it is per channel rather than per video
 *
 * Research across three episodes of the reference channel found that the STORY changed
 * completely between them while the NAMED SOURCES barely moved — the same councils,
 * translators and manuscripts recurred nearly verbatim. The citation frame is fixed
 * channel-level data; only the payload is per-episode. So a few dozen items, written once,
 * serve a channel indefinitely, and no per-video research step is needed.
 *
 * ## Pure, like `channel-brief.ts`
 *
 * No `"use server"`, no provider, no I/O — the settings UI renders these types in a client
 * component, `format-prompt.ts` compiles them into an instruction, and the archivist agent
 * fills them. One module all three import is what keeps the shape they each assume from
 * drifting apart.
 */

/**
 * What KIND of slot a fact can fill.
 *
 * Typed rather than free-text because the writer is not choosing freely: an act beat like
 * "name who removed or restricted it, and when" needs a council and a year, while "the
 * standard scholarly reference is" needs a person and a publication. Grouping the compiled
 * list by kind is what lets the model reach for the right sort of item instead of treating
 * forty entries as one undifferentiated menu.
 */
export const FACT_KINDS = [
  "person",
  "institution",
  "council",
  "manuscript",
  "publication",
  "artifact",
  "event",
] as const;

export type FactKind = (typeof FACT_KINDS)[number];

/** Human labels for the settings table and the compiled prompt's group headings. */
export const FACT_KIND_LABELS: Record<FactKind, string> = {
  person: "People",
  institution: "Institutions",
  council: "Councils & rulings",
  manuscript: "Manuscripts & fragments",
  publication: "Publications & translations",
  artifact: "Artifacts & objects",
  event: "Events & dates",
};

export function isFactKind(value: string): value is FactKind {
  return (FACT_KINDS as readonly string[]).includes(value);
}

/** One citable item. Mirrors a `public.channel_facts` row. */
export interface ChannelFact {
  id: string;
  kind: FactKind;
  /** The short name, as it would be spoken: "George Nickelsburg". */
  label: string;
  /** The citable form: "2001 commentary on 1 Enoch, Fortress Press". */
  detail: string;
  /**
   * Part of the channel's fixed opening frame — cited in every episode rather than drawn
   * on when a beat happens to call for it.
   *
   * Without this distinction the writer treats the ledger as a menu and the channel's
   * signature opening stops being fixed, which is the single most recognisable thing
   * about a format like this.
   */
  alwaysUse: boolean;
  /**
   * Human-checked. **Nothing reaches a prompt until this is true.**
   *
   * The archivist writes every candidate as `false` deliberately. Source material for this
   * genre mixes independently checkable anchors (a church council, a published commentary)
   * with items unfalsifiable by construction (a tablet with no accession number, a
   * monograph circulated privately and never published). Both get extracted, because an
   * agent cannot reliably separate them and a silent guess is worse than no guess — so the
   * separation is a human tick, once, per fact.
   */
  verified: boolean;
  /** Where it came from. For whoever does the verifying; never compiled into a prompt. */
  sourceNote: string;
}

/** A fact as the archivist proposes it, before it has a row or a human tick. */
export type ChannelFactCandidate = Omit<ChannelFact, "id" | "verified">;

/**
 * Splits a ledger into the fixed frame and the draw-on-demand pool.
 *
 * Shared by the prompt compiler and the settings table so "what counts as the opening
 * frame" is decided in exactly one place.
 */
export function partitionFacts(facts: readonly ChannelFact[]): {
  frame: ChannelFact[];
  pool: ChannelFact[];
} {
  return {
    frame: facts.filter((fact) => fact.alwaysUse),
    pool: facts.filter((fact) => !fact.alwaysUse),
  };
}

/** Groups facts by kind, preserving `FACT_KINDS` order and dropping empty groups. */
export function groupFactsByKind(
  facts: readonly ChannelFact[]
): { kind: FactKind; label: string; facts: ChannelFact[] }[] {
  return FACT_KINDS.map((kind) => ({
    kind,
    label: FACT_KIND_LABELS[kind],
    facts: facts.filter((fact) => fact.kind === kind),
  })).filter((group) => group.facts.length > 0);
}

/** One ledger line as the model sees it. */
export function formatFactForPrompt(fact: ChannelFact): string {
  return fact.detail.trim() ? `${fact.label} — ${fact.detail.trim()}` : fact.label;
}

/* -------------------------------------------------------------------------- */
/*                          Continuity — what an Act named                    */
/* -------------------------------------------------------------------------- */

/** One Act's record in `video_projects.act_continuity`. */
export interface ActContinuityEntry {
  actNumber: number;
  /** The Act's outline title, denormalised so the compiled block needs no second read. */
  title: string;
  /** `ChannelFact.label` values this Act's narration actually named. */
  namedFacts: string[];
}

/**
 * Which ledger facts a block of generated narration actually named.
 *
 * Deterministic string matching rather than asking a model to self-report, for the reason
 * db/add-act-continuity.sql sets out: the ledger is a closed set of known labels, so this
 * is answerable exactly and for free, and a self-report would be unverifiable metadata.
 *
 * Case-insensitive, and matched on word boundaries so a short label cannot register a hit
 * inside a longer unrelated word. Deliberately matches `label` only, never `detail`:
 * `label` is "the short name, as it would be spoken", which is what actually recurs in
 * narration, while `detail` is a citation string ("2001 commentary on 1 Enoch, Fortress
 * Press") that the writer paraphrases freely and would almost never reproduce verbatim.
 */
export function factsNamedIn(
  text: string,
  facts: readonly ChannelFact[]
): string[] {
  const haystack = text.toLowerCase();

  return facts
    .filter((fact) => {
      const label = fact.label.trim().toLowerCase();
      if (!label) return false;

      // Word-boundary check done by hand rather than with \b, because a label may contain
      // regex metacharacters (parentheses, dots in "J. T. Milik") and escaping them to
      // build a pattern per fact per Act is more moving parts than scanning for the
      // substring and inspecting its neighbours.
      let from = 0;
      for (;;) {
        const at = haystack.indexOf(label, from);
        if (at === -1) return false;

        const before = at === 0 ? "" : haystack[at - 1];
        const after = haystack[at + label.length] ?? "";
        const isWordChar = (c: string) => c !== "" && /[a-z0-9]/.test(c);

        if (!isWordChar(before) && !isWordChar(after)) return true;
        from = at + 1;
      }
    })
    .map((fact) => fact.label);
}
