import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parse } from "dotenv";
import { inspectBillingEnvironment } from "./readiness.mjs";

function loadEnvironment(files, inherited, optional) {
  // Match Next's relevant precedence: process env > .env.local > .env.
  return files.reduce((environment, file) => {
    try {
      return { ...parse(readFileSync(file)), ...environment };
    } catch (error) {
      if (optional && error.code === "ENOENT") return environment;
      // Do not print raw filesystem errors or file contents.
      throw new Error("An environment file could not be read.");
    }
  }, { ...inherited });
}

function main() {
  const { values } = parseArgs({
    options: {
      "config-file": { type: "string", multiple: true },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log("Usage: npm run check:billing -- [--config-file PATH ...]");
    console.log("Offline format checks only. No remote requests, writes, or secret output.");
    console.log("Earlier files take precedence; inherited process variables take highest precedence.");
    return;
  }

  const report = inspectBillingEnvironment(loadEnvironment(
    values["config-file"] ?? [".env.local", ".env"],
    process.env,
    values["config-file"] === undefined,
  ));

  console.log("Billing Phase 0: offline configuration format check (not launch approval).");
  console.log(`Stripe secret-key mode: ${report.stripeMode}`);
  for (const check of report.checks) {
    console.log(`${check.pass ? "PASS" : "BLOCKED"} ${check.name}: ${check.detail}`);
  }
  console.log("Still requires manual verification:");
  for (const item of report.outstanding) console.log(`- ${item}`);
  console.log("Existing application routes were not changed or secured by this check. Do not enable sales.");
  process.exitCode = report.configurationPass ? 0 : 1;
}

try {
  main();
} catch {
  // Argument/environment values may contain secrets; never echo a raw error.
  console.error("Billing readiness check failed. Check CLI arguments and environment-file access; use --help.");
  process.exitCode = 1;
}
