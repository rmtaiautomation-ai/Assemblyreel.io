/**
 * Byte-identity check for the Channel Blueprint refactor.
 * (implementation_plans/18-channel-blueprint.md, Phase 2)
 *
 *   node scripts/check-format-prompt.mjs
 *
 * Phase 2 moved the Script Writer's system instruction and the Act Outliner's structure
 * rules out of hardcoded template literals and into `src/lib/ai/format-prompt.ts`, driven
 * by a FormatProfile. That is only a safe refactor if the four MIGRATED presets still
 * produce exactly the prompt text they produced before — otherwise every existing channel
 * silently changes voice.
 *
 * Rather than compare against a hand-copied "expected" string (which would rot the moment
 * someone edited it), this reads the ORIGINAL template literals straight out of the last
 * commit that still contained them, re-evaluates them with the same substitutions, and
 * diffs. It needs no API key and makes no network calls.
 *
 * BASELINE_REF is pinned deliberately: once the templates are gone from HEAD, the check
 * has to look further back to find them.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const BASELINE_REF = "48a810b"; // last commit before the blueprint work
const require = createRequire(import.meta.url);

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 24 });
}

/** Pulls the text between an opening backtick marker and its closing "`;". */
function extractTemplate(source, startMarker) {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`marker not found: ${startMarker}`);
  const from = start + startMarker.length;
  const end = source.indexOf("`;", from);
  if (end === -1) throw new Error(`unterminated template after: ${startMarker}`);
  return source.slice(from, end);
}

/** Re-evaluates an extracted template literal with the given substitutions. */
function renderTemplate(template, vars) {
  const names = Object.keys(vars);
  const fn = new Function(...names, "return `" + template + "`;");
  return fn(...names.map((n) => vars[n]));
}

/* -------------------------------------------------------------------------- */
/* Compile the current TypeScript modules to CommonJS so we can call them.     */
/* -------------------------------------------------------------------------- */

const outDir = mkdtempSync(join(tmpdir(), "fmtprompt-"));
let formatProfile;
let formatPrompt;
let generationRules;

try {
  // `shell: true` because on Windows npx resolves to npx.cmd, which execFileSync cannot
  // spawn directly (EINVAL). Quoting outDir keeps a temp path with spaces intact.
  execFileSync(
    "npx",
    [
      "tsc",
      "src/lib/ai/format-prompt.ts",
      "--outDir",
      `"${outDir}"`,
      "--module",
      "commonjs",
      "--target",
      "es2020",
      "--moduleResolution",
      "node",
      "--skipLibCheck",
    ],
    { stdio: "inherit", shell: true }
  );

  formatProfile = require(join(outDir, "format-profile.js"));
  formatPrompt = require(join(outDir, "format-prompt.js"));
  generationRules = require(join(outDir, "generation-rules.js"));
} catch (err) {
  console.error("Failed to compile the format modules:", err.message);
  rmSync(outDir, { recursive: true, force: true });
  process.exit(1);
}

const { FORMAT_PRESETS } = formatProfile;
const { buildScriptWriterSystemInstruction, buildActStructureRules } = formatPrompt;
const { WORDS_PER_NARRATION_LINE, resolveDurationProfile } = generationRules;

/* -------------------------------------------------------------------------- */
/* The baseline templates, read out of git.                                    */
/* -------------------------------------------------------------------------- */

const baselineScriptWriter = git("show", `${BASELINE_REF}:src/lib/ai/script-writer.ts`);

const originalSystemInstruction = extractTemplate(
  baselineScriptWriter,
  "const systemInstruction = `"
);

// The Act Outliner's structure block sits inside a much larger prompt. Anchored on the
// bullet text itself rather than on `const prompt = \``, because generateArcAndHook
// declares one of those first and indexOf would find the wrong function.
const actRulesStart = baselineScriptWriter.indexOf("- Act 1:");
const actRulesEnd = baselineScriptWriter.indexOf("\n\nReturn a JSON array");
if (actRulesStart === -1 || actRulesEnd === -1 || actRulesEnd < actRulesStart) {
  throw new Error("could not locate the baseline Act structure rules");
}
const originalActRules = baselineScriptWriter
  .slice(actRulesStart, actRulesEnd)
  .trimEnd();

/* -------------------------------------------------------------------------- */
/* Compare.                                                                    */
/* -------------------------------------------------------------------------- */

const MIGRATED = [
  "mythic-epic",
  "grounded-investigation",
  "dark-psychology",
  "general",
];

let failures = 0;

function diff(name, actual, expected) {
  if (actual === expected) {
    console.log(`PASS  ${name}`);
    return;
  }
  failures++;
  console.log(`FAIL  ${name}`);
  const a = actual.split("\n");
  const b = expected.split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      console.log(`        line ${i + 1}`);
      console.log(`        expected: ${JSON.stringify(b[i])}`);
      console.log(`        actual:   ${JSON.stringify(a[i])}`);
    }
  }
}

// A representative length rule; its content is irrelevant to the comparison, only that
// both sides receive the same one.
const lengthRule = resolveDurationProfile("Long (15-20m)").structureRule;

for (const key of MIGRATED) {
  const preset = FORMAT_PRESETS[key];

  diff(
    `${key}: Script Writer system instruction unchanged`,
    buildScriptWriterSystemInstruction(preset, { lengthRule }),
    renderTemplate(originalSystemInstruction, {
      toneMatrixRule: preset.identity.register,
      lengthRule,
      WORDS_PER_NARRATION_LINE,
    })
  );

  for (const actCount of [5, 7, 9, 11]) {
    diff(
      `${key}: Act structure rules unchanged (${actCount} acts)`,
      buildActStructureRules(preset, actCount),
      renderTemplate(originalActRules, { actCount })
    );
  }
}

/* -------------------------------------------------------------------------- */
/* And confirm the NEW preset genuinely diverges — a builder that returned the  */
/* legacy text for everything would otherwise pass the checks above.           */
/* -------------------------------------------------------------------------- */

const forensic = FORMAT_PRESETS["forensic-documentary"];
const forensicInstruction = buildScriptWriterSystemInstruction(forensic, { lengthRule });
const forensicRules = buildActStructureRules(forensic, 7);

// The Act path, which is the only one that can emit a beat-sheet block: without an Act
// number there is no slice of the spine to hand over. Act 5 of 9 is chosen because it is
// mid-video — it must carry beats of its own AND be told about beats on both sides of it.
const forensicAct5 = buildScriptWriterSystemInstruction(forensic, {
  lengthRule,
  actNumber: 5,
  actCount: 9,
});
const forensicAct1 = buildScriptWriterSystemInstruction(forensic, {
  lengthRule,
  actNumber: 1,
  actCount: 9,
});

const expectations = [
  ["drops the Camera-Ready Rule", !forensicInstruction.includes("Camera-Ready Rule")],
  ["uses the Documentary Line Rule", forensicInstruction.includes("Documentary Line Rule")],
  ["drops the Money Shot CTA closer", !forensicInstruction.includes("Money Shot Rule")],
  ["uses the Open Door closer", forensicInstruction.includes("Open Door Rule")],
  ["emits a NARRATOR block", forensicInstruction.includes("### NARRATOR:")],
  // The cycle is gone by design — it is what made all nine Acts open on a manuscript and
  // seven of them close on a door. Asserted absent so it cannot creep back alongside the
  // spine: a model handed both obeys the repeatable one.
  ["emits no ACT CYCLE block", !forensicAct5.includes("### ACT CYCLE:")],
  ["emits a beat-sheet block on the Act path", forensicAct5.includes("### THIS ACT'S BEATS:")],
  ["hands Act 5 of 9 its own slice", forensicAct5.includes("This Act carries beats 8 to 9")],
  ["tells an Act what earlier Acts already spent", forensicAct5.includes("Earlier Acts have already spent")],
  ["tells an Act what later Acts will carry", forensicAct5.includes("belong to LATER Acts")],
  ["gives Act 1 the cold open", forensicAct1.includes("### COLD OPEN:")],
  // One opening per video. Sending the six-step module to all nine Acts is how it becomes
  // a module the writer tries to run nine times.
  ["withholds the cold open from later Acts", !forensicAct5.includes("### COLD OPEN:")],
  ["emits a SOURCING block", forensicInstruction.includes("### SOURCING:")],
  ["emits a FRAMING DEVICE block", forensicInstruction.includes("### FRAMING DEVICE:")],
  ["act rules cut the spine across Acts", forensicRules.includes("cut across 7 Acts")],
  ["act rules drop the single-arc escalation", !forensicRules.includes("Escalation & Value Stacking")],
  ["act rules drop the repeating cycle", !forensicRules.includes("EVERY Act, from 1 to 7")],
];

for (const [name, ok] of expectations) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  forensic-documentary: ${name}`);
}

rmSync(outDir, { recursive: true, force: true });

console.log(
  failures === 0
    ? "\nAll checks passed — migrated presets are byte-identical, new preset diverges."
    : `\n${failures} FAILURE(S).`
);
process.exit(failures === 0 ? 0 : 1);
