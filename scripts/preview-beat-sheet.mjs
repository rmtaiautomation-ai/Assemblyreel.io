/**
 * Prints how a profile's beat sheet is cut across Acts, and optionally the full Script
 * Writer instruction for one Act.
 *
 *   node scripts/preview-beat-sheet.mjs                # forensic preset, 9 and 7 Acts
 *   node scripts/preview-beat-sheet.mjs --act 5 --of 9 # plus the full prompt for that Act
 *
 * No API key, no network, no database — it compiles the two pure modules and calls them,
 * which is the only way to see what the model will actually receive without spending a
 * generation to find out.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const num = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(argv[i + 1]);
};
const ACT = num("act", 0);
const OF = num("of", 9);

const outDir = mkdtempSync(join(tmpdir(), "beatpreview-"));
let profileMod;
let promptMod;
try {
  execFileSync(
    "npx",
    ["tsc", "src/lib/ai/format-prompt.ts", "--outDir", `"${outDir}"`,
     "--module", "commonjs", "--target", "es2020", "--moduleResolution", "node", "--skipLibCheck"],
    { stdio: "inherit", shell: true }
  );
  profileMod = await import(pathToFileURL(join(outDir, "format-profile.js")).href);
  promptMod = await import(pathToFileURL(join(outDir, "format-prompt.js")).href);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

const profile = profileMod.FORMAT_PRESETS["forensic-documentary"];
const sheet = profile.structure.beatSheet;

for (const actCount of [9, 7, 5]) {
  console.log(`\n=== ${sheet.length} beats across ${actCount} Acts ===`);
  const assigned = profileMod.assignBeatSheet(profile, actCount);
  for (let act = 1; act <= actCount; act++) {
    const beats = assigned.get(act) ?? [];
    console.log(
      `  Act ${act}: ${beats.length ? beats.map((b) => b.id).join(", ") : "(none)"}`
    );
  }
  const placed = [...assigned.values()].reduce((n, b) => n + b.length, 0);
  if (placed !== sheet.length) {
    console.error(`  !! ${placed} of ${sheet.length} beats placed`);
    process.exitCode = 1;
  }
}

if (ACT) {
  console.log(`\n=== Script Writer instruction — Act ${ACT} of ${OF} ===\n`);
  console.log(
    promptMod.buildScriptWriterSystemInstruction(profile, {
      lengthRule: `Exactly 22 to 28 lines strictly for this single Act, totalling 333-417 words.`,
      actNumber: ACT,
      actCount: OF,
    })
  );
}
