/**
 * Upgrades a workspace's stored Channel Blueprint onto the beat-sheet spine.
 *
 *   node scripts/upgrade-channel-format.mjs --workspace "Enoch"            # dry run
 *   node scripts/upgrade-channel-format.mjs --workspace "Enoch" --apply    # write it
 *
 * ## Why a workspace needs migrating at all
 *
 * A workspace on the `custom` preset stores its own near-complete profile in
 * `workspaces.format_blueprint`, so editing the shipped `forensic-documentary` preset in
 * `format-profile.ts` does not reach it. The Enoch channel is in exactly that position: its
 * generated blueprint carries `actCycle` (3 beats) and `arcBeats` (6), which is the shape
 * the beat sheet replaces.
 *
 * ## What it takes from code rather than restating
 *
 * `beatSheet`, `coldOpen.sequence` and the four prose-texture rules are read out of the
 * live `forensic-documentary` preset, compiled from source at run time. Retyping seventeen
 * beats into a migration script would put the format's spine in two places that then drift
 * — the mistake `generation-rules.ts` already documents for the niche matrix.
 *
 * ## What it rewrites by hand, and why
 *
 * Three `identity` fields are replaced outright, because each one was measurably producing
 * a tic in generated output rather than merely failing to prevent one:
 *
 *  - `explanatoryMethod` instructed "ground every abstraction in an occupational analogy:
 *    building inspector, geologist's field notes, ..." — which produced the building
 *    inspector five times in nine Acts. It also asked for "one foreign or technical word
 *    per beat" (eight of nine Acts opened on one) and "state what the scholar did not say,
 *    then what they did" (nine uses of that construction).
 *  - `narratorPersona` contained "The narrator has no personal stake and never testifies —
 *    they present." That is the instruction behind "it sounds like a documentary, not a
 *    person telling a story".
 *  - `register` asked for claims stated "flatly", which suppresses the urgency the format
 *    depends on. The length-contrast instruction it already carried is kept.
 *
 * Everything else the workspace declares — `forbiddenRegisters`, `sourcingRule`,
 * `rotatingDevices`, `visual`, `sourceBrief`, `audienceStance` — is preserved untouched.
 *
 * Bumping `format_blueprint_version` is what makes an existing project's frozen snapshot
 * visibly stale. Snapshots are NOT cleared here: a project keeps generating under the rules
 * its earlier Acts were written with, which is the whole reason the snapshot exists. Pass
 * `--reset-project <name>` to drop one deliberately, or start a new project.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/* -------------------------------------------------------------------------- */
/* Arguments                                                                   */
/* -------------------------------------------------------------------------- */

const argv = process.argv.slice(2);
function flag(name) {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? null : (argv[i + 1] ?? "");
}
const WORKSPACE = flag("workspace");
const RESET_PROJECT = flag("reset-project");
const APPLY = argv.includes("--apply");

if (!WORKSPACE) {
  console.error('Usage: node scripts/upgrade-channel-format.mjs --workspace "Name" [--apply] [--reset-project "Name"]');
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* Read the shipped preset out of the live TypeScript source                   */
/* -------------------------------------------------------------------------- */

const outDir = mkdtempSync(join(tmpdir(), "fmtupgrade-"));
let FORENSIC;
try {
  // `shell: true` because on Windows npx resolves to npx.cmd, which execFileSync cannot
  // spawn directly. Quoting outDir keeps a temp path containing spaces intact.
  execFileSync(
    "npx",
    ["tsc", "src/lib/ai/format-profile.ts", "--outDir", `"${outDir}"`,
     "--module", "commonjs", "--target", "es2020", "--moduleResolution", "node", "--skipLibCheck"],
    { stdio: "inherit", shell: true }
  );
  const mod = await import(pathToFileURL(join(outDir, "format-profile.js")).href);
  FORENSIC = mod.FORMAT_PRESETS["forensic-documentary"];
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

if (!FORENSIC?.structure?.beatSheet?.length) {
  console.error("FAIL: the forensic-documentary preset has no beatSheet — nothing to migrate onto.");
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* The three identity fields that are rewritten rather than carried over       */
/* -------------------------------------------------------------------------- */

const REWRITTEN_IDENTITY = {
  narratorPersona:
    "An archivist working through recovered documents, reading the record aloud and showing the viewer what it actually says. Not a preacher, not a prophet, not a conspiracy host. Treats the viewer as a fellow researcher capable of drawing their own conclusion, never as a congregation who needs to be told one. This is a person talking, not a report being read: they react to what they find, they tell the viewer when something is worse than what came before, and they say so in their own words. First person is used exactly once in a whole video, at the concession beat.",
  register:
    "Serious, controlled and unhurried, but never affectless. Treat the material as consequential and unresolved. State extraordinary claims plainly — the weight comes from the specificity, never from adjectives or from raising the voice — but do not state them flatly, and never as settled inspiration. Roughly twelfth-grade reading level. Use the real vocabulary of the subject — corpus, canon, scribal tradition, redaction, provenance, adjudicated — and define a term in the same breath only when it genuinely is obscure. Build rhythm on violent length contrast: a long sentence carrying two nested clauses, then a fragment of three or four words landing alone. Use triads for weight.",
  explanatoryMethod:
    "Explain a claim by pointing at what the text actually says, then at what it would mean if it were meant literally. Clear away the expected reading with negation before assertion, then land the real one. VARY the move — do not run the same reasoning shape twice in one Act, and do not run it in every Act. In particular: an occupational analogy (building inspector, geologist's field notes, a librarian, a state archive) is permitted AT MOST ONCE in an entire video, and the construction 'X did not say A, he said B' at most twice. Both are this channel's signature and both stop working the third time they are used.",
};

/* -------------------------------------------------------------------------- */
/* Build the new override                                                      */
/* -------------------------------------------------------------------------- */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data: ws, error: wsError } = await supabase
  .from("workspaces")
  .select("id, name, format_preset_key, format_blueprint, format_blueprint_version")
  .eq("name", WORKSPACE)
  .single();

if (wsError || !ws) {
  console.error(`FAIL: workspace "${WORKSPACE}" not found.`, wsError?.message ?? "");
  process.exit(1);
}

const before = ws.format_blueprint ?? {};

const next = {
  ...before,
  identity: {
    ...before.identity,
    ...REWRITTEN_IDENTITY,
    sourceRegister: FORENSIC.identity.sourceRegister,
    characterRule: FORENSIC.identity.characterRule,
  },
  structure: {
    ...before.structure,
    // Emptied, not deleted: `mergeFormatProfile` spreads the override over the preset, so a
    // deleted key would fall back to the preset's value rather than clearing it.
    actCycle: [],
    arcBeats: [],
    beatSheet: FORENSIC.structure.beatSheet,
    coldOpen: {
      ...before.structure?.coldOpen,
      maxSeconds: FORENSIC.structure.coldOpen.maxSeconds,
      payoffDeadlineSeconds: FORENSIC.structure.coldOpen.payoffDeadlineSeconds,
      sequence: FORENSIC.structure.coldOpen.sequence,
      // The workspace's own bans are kept and the preset's added — these are complementary
      // lists (no rhetorical question / no greeting), not competing ones.
      bannedOpenings: [
        ...new Set([
          ...(before.structure?.coldOpen?.bannedOpenings ?? []),
          ...FORENSIC.structure.coldOpen.bannedOpenings,
        ]),
      ],
    },
  },
  content: {
    ...before.content,
    apparatusRule: FORENSIC.content.apparatusRule,
    sensoryRule: FORENSIC.content.sensoryRule,
    fragmentRule: FORENSIC.content.fragmentRule,
    scaleRule: FORENSIC.content.scaleRule,
    transitionPhrases: FORENSIC.content.transitionPhrases,
    // The stored list said "End on waiting, not on a call to action", which would suppress
    // the subscribe line the opening beat now requires, and separately restated the closer
    // that beat 17 already owns. Replaced with the two requirements the beat sheet cannot
    // express, both of which are genuinely per-Act.
    requiredBeats: [
      "At least one verbatim quotation from the primary source per Act, cited by chapter and verse.",
      "The video's only call to action is the subscribe line in the opening beat. Never close an Act, or the video, on one.",
    ],
  },
};

/* -------------------------------------------------------------------------- */
/* Report, then write                                                          */
/* -------------------------------------------------------------------------- */

console.log(`\nWorkspace: ${ws.name}  (preset: ${ws.format_preset_key}, version ${ws.format_blueprint_version})`);
console.log(`  actCycle          ${before.structure?.actCycle?.length ?? 0} -> ${next.structure.actCycle.length}`);
console.log(`  arcBeats          ${before.structure?.arcBeats?.length ?? 0} -> ${next.structure.arcBeats.length}`);
console.log(`  beatSheet         ${before.structure?.beatSheet?.length ?? 0} -> ${next.structure.beatSheet.length}`);
console.log(`  coldOpen.sequence ${before.structure?.coldOpen?.sequence?.length ?? 0} -> ${next.structure.coldOpen.sequence.length}`);
console.log(`  transitionPhrases ${before.content?.transitionPhrases?.length ?? 0} -> ${next.content.transitionPhrases.length}`);
console.log(`  rewritten: identity.narratorPersona, identity.register, identity.explanatoryMethod`);
console.log(`  added:     identity.sourceRegister, identity.characterRule, content.{apparatus,sensory,fragment,scale}Rule`);
console.log(`  preserved: forbiddenRegisters, audienceStance, sourcingRule, rotatingDevices, visual, sourceBrief`);

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to write.\n");
  process.exit(0);
}

const nextVersion = (ws.format_blueprint_version ?? 0) + 1;
const { error: saveError } = await supabase
  .from("workspaces")
  .update({ format_blueprint: next, format_blueprint_version: nextVersion })
  .eq("id", ws.id);

if (saveError) {
  console.error("FAIL: could not save blueprint.", saveError.message);
  process.exit(1);
}
console.log(`\nSaved. format_blueprint_version ${ws.format_blueprint_version} -> ${nextVersion}`);

if (RESET_PROJECT) {
  const { data: proj, error: projError } = await supabase
    .from("projects")
    .update({ format_blueprint_snapshot: null })
    .eq("name", RESET_PROJECT)
    .select("id, name");

  if (projError) console.error("WARN: could not clear project snapshot.", projError.message);
  else console.log(`Cleared frozen snapshot on ${proj?.length ?? 0} project(s) named "${RESET_PROJECT}".`);
}
console.log("");
