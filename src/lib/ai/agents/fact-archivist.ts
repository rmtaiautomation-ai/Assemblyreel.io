import { generateObject } from "ai";
import { z } from "zod";
import {
  AGENT_MODEL,
  MISSING_OPENAI_KEY_ERROR,
  OBJECT_PROVIDER_OPTIONS,
  STRUCTURED_TEMPERATURE,
  isOpenAIConfigured,
  openai,
} from "../openai-provider";
import { FACT_KINDS, type ChannelFactCandidate, type FactKind } from "../channel-facts";

/**
 * The Fact Archivist — pulls a channel's citable named sources out of its research brief.
 *
 * ## Why it runs on the brief the user already pasted
 *
 * `format-analyst.ts` reads that same paste and compiles it into a FormatProfile, storing
 * the raw text as `sourceBrief` — which `format-profile.ts` marks "PROVENANCE ONLY — never
 * compiled into a prompt", for the good reason that feeding a prose blob back to the Script
 * Writer reintroduces exactly the unweightable freeform direction the blueprint exists to
 * replace. But that text is dense with the one thing the writer cannot safely invent: real
 * scholars, real councils, real manuscripts, real years. So it is mined here for structure,
 * not replayed as prose. One paste, two extractions, no extra work asked of the user.
 *
 * Like the Format Analyst this is a SETUP-time agent: it touches no project and no scene,
 * and its output is reviewed by a human before anything is saved.
 *
 * ## Extraction, never recall
 *
 * The single most dangerous thing this agent could do is help. Asked for "the standard
 * scholarly references for this niche" a model will happily produce a roster — fluent,
 * correctly formatted, partly fabricated — and those fabrications would then be laundered
 * through a ledger whose entire purpose is to be the trustworthy list. So the system prompt
 * below forbids contributing anything the source text does not contain, and the schema has
 * no field in which outside knowledge could be smuggled.
 *
 * ## Why `checkable` exists, and why nothing is trusted here
 *
 * Source material for this genre characteristically mixes independently verifiable anchors
 * (a church council, a published commentary, a museum accession) with items unfalsifiable
 * by construction — a tablet that "disappeared from every institutional collection without
 * an accession number", a monograph "circulated to eleven colleagues and never published".
 * Both are extracted, because both appear in the brief and silently dropping one kind would
 * hide the choice from the user. `checkable` marks the archivist's read of which is which,
 * so the review screen can sort the doubtful ones to the top.
 *
 * It is a hint for a human, not a gate. The gate is `verified`, which every candidate
 * leaves here as false — see `ChannelFact.verified`.
 */

const FactCandidateSchema = z.object({
  kind: z
    .enum(FACT_KINDS)
    .describe(
      "Which kind of slot this fills. 'council' for a ruling body or its decision, 'publication' for a named translation/commentary/paper, 'manuscript' for a specific document or fragment, 'artifact' for a physical object, 'institution' for a university/museum/archive, 'person' for a named individual, 'event' for a dated occurrence."
    ),
  label: z
    .string()
    .describe(
      "The short name exactly as a narrator would say it aloud — 'George Nickelsburg', 'the Council of Laodicea'. No dates or publishers here; those go in detail."
    ),
  detail: z
    .string()
    .describe(
      "The citable specifics: year, publisher, institution, location, catalogue number — whatever the source gives. '2001 commentary on 1 Enoch, Fortress Press'. Empty string if the source names the item but gives no specifics."
    ),
  alwaysUse: z
    .boolean()
    .describe(
      "True ONLY if the source shows this item recurring in every episode as part of the channel's fixed opening frame. Most items are false — they are drawn on when a beat calls for them."
    ),
  checkable: z
    .boolean()
    .describe(
      "True if someone could independently confirm this exists — a published book, a known council, a catalogued museum object. False if the source describes it in terms that make it unverifiable by construction: no accession number, unpublished, privately circulated, classified, withdrawn, or attributed to a person the source says cannot be contacted."
    ),
  sourceNote: z
    .string()
    .describe(
      "A short quote or paraphrase from the source showing where this came from, so a human can find it again when verifying. One line."
    ),
});

export interface FactCandidate extends ChannelFactCandidate {
  kind: FactKind;
  /** The archivist's read of whether this is independently confirmable. A hint, not a gate. */
  checkable: boolean;
}

export interface ExtractChannelFactsResult {
  success: boolean;
  facts?: FactCandidate[];
  error?: string;
}

export async function extractChannelFacts(
  source: string
): Promise<ExtractChannelFactsResult> {
  if (!isOpenAIConfigured()) {
    return { success: false, error: MISSING_OPENAI_KEY_ERROR };
  }

  const trimmed = source.trim();
  // Matches the Format Analyst's floor: the two agents read the same paste, so a brief
  // long enough for one is long enough for the other, and a different threshold would
  // mean a paste that builds a format but silently yields no ledger.
  if (trimmed.length < 80) {
    return {
      success: false,
      error:
        "That is too short to pull sources from. Paste your research, notes, or transcripts — a few paragraphs is enough.",
    };
  }

  try {
    console.log(`[Fact Archivist] Reading a ${trimmed.length}-character brief for named sources.`);

    const { object } = await generateObject({
      model: openai(AGENT_MODEL),
      providerOptions: OBJECT_PROVIDER_OPTIONS,
      schema: z.object({ facts: z.array(FactCandidateSchema) }),
      temperature: STRUCTURED_TEMPERATURE,
      system: `You are the Fact Archivist. You read research about a video channel and extract every NAMED, CITABLE thing it mentions, so a script writer can later draw on a fixed list instead of inventing sources.

RULES:
1. EXTRACT ONLY. Every item you return must appear in the text you are given. You may not add a scholar, a council, a translation or a date from your own knowledge, however confident you are and however obviously relevant it seems. An item you supply cannot be traced back to anything, which defeats the entire purpose of this list.
2. Never complete a partial item from memory. If the source names a scholar with no year and no publisher, return the name with an empty detail. Do NOT fill in the year you believe is correct.
3. Keep the source's own spelling of names, even when you think it is wrong — transcripts mangle proper nouns, and the person reviewing this needs to recognise what they pasted. Do not silently correct.
4. One row per distinct item. If the same scholar is mentioned in four places, return them once, with the fullest detail any of those mentions gave.
5. Extract things that could ANCHOR A CLAIM: people, ruling bodies, manuscripts, fragments, translations, publications, institutions, artifacts, dated events. Do NOT extract the subject matter itself — the topics, the claims, the story. A chapter of a text is a manuscript reference; what that chapter supposedly says is not a fact for this list.
6. Judge 'checkable' honestly and independently of how confident the source sounds. Source material in this genre routinely presents unverifiable items in the same authoritative voice as real ones. An object with no accession number, an unpublished or privately circulated paper, a classified survey, a person described as unreachable or deceased with records withheld — all of these are checkable: false, no matter how specific the surrounding prose is.
7. Return an empty array rather than a speculative one. A brief with no named sources in it yields no facts, and that is a correct answer.`,
      prompt: `Extract every named, citable source from the following text.

"""
${trimmed}
"""`,
    });

    const facts: FactCandidate[] = object.facts.map((fact) => ({
      kind: fact.kind,
      label: fact.label.trim(),
      detail: fact.detail.trim(),
      alwaysUse: fact.alwaysUse,
      checkable: fact.checkable,
      sourceNote: fact.sourceNote.trim(),
    }));

    const unverifiable = facts.filter((fact) => !fact.checkable).length;
    console.log(
      `[Fact Archivist] Extracted ${facts.length} fact(s), ${unverifiable} flagged as not independently checkable.`
    );

    return { success: true, facts };
  } catch (error) {
    console.error("[Fact Archivist] Failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to extract sources from the brief.",
    };
  }
}
