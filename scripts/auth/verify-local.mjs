import { spawn, execFileSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Local acceptance only. No migration, deployment, account or provider command.
const root = fileURLToPath(new URL("../../", import.meta.url));
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run with npm run verify:local.");
const startedAt = new Date().toISOString();
const directory = resolve(root, "scratch", "local-acceptance", startedAt.replaceAll(/[:.]/g, "-"));
await mkdir(directory, { recursive: true });
// Override every boolean capability in the template, including flags added later.
const template = await readFile(resolve(root, "config/auth.env.example"), "utf8");
const disabled = Object.fromEntries([...template.matchAll(/^([A-Z_]+)=(?:false|true)\s*$/gm)].map(match => [match[1], "false"]));
const portProbe = createServer();
portProbe.listen(0, "127.0.0.1");
await once(portProbe, "listening");
const port = portProbe.address().port;
await new Promise((done, reject) => portProbe.close(error => error ? reject(error) : done()));
const origin = `http://127.0.0.1:${port}`;
// NEXT_PUBLIC values may be inlined: use the same origin at build and runtime.
const env = { ...process.env, ...disabled, NEXT_PUBLIC_SITE_URL: origin, APP_ACCESS_STAGE: "auth_only", BILLING_STRIPE_MODE: "test" };
const steps = [];
let currentChild, server;
let interrupted = false;
function interrupt() {
  interrupted = true;
  currentChild?.kill();
  server?.kill();
}
process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);
function start(args, name, extraEnv = {}) {
  const log = createWriteStream(resolve(directory, `${name}.log`), { flags: "wx" });
  const child = spawn(process.execPath, args, { cwd: root, env: { ...env, ...extraEnv }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  const closed = new Promise(resolveClose => {
    child.on("error", () => { log.end(); resolveClose(1); });
    child.on("close", code => { log.end(); resolveClose(code ?? 1); });
  });
  return { child, closed };
}
async function run(name, args, extraEnv) {
  if (interrupted) return false;
  console.log(`Running ${name}…`);
  const started = Date.now();
  const task = start(args, name, extraEnv);
  currentChild = task.child;
  const exitCode = await task.closed;
  currentChild = undefined;
  steps.push({ name, status: exitCode === 0 ? "passed" : "failed", exitCode, durationMs: Date.now() - started, log: `${name}.log` });
  console.log(`${exitCode === 0 ? "PASS" : "FAIL"}: ${name}`);
  return exitCode === 0;
}
let revision = "unknown";
try { revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim(); } catch { /* A downloaded checkout can lack Git metadata. */ }
try {
  for (const name of ["test:auth", "test:billing", "test:timeline:release", "lint:auth", "lint:access", "lint:billing", "lint:marketing"]) {
    await run(name.replaceAll(":", "-"), [npm, "run", name]);
  }
  const built = await run("build", [npm, "run", "build"]);
  // Build generates route types; avoid racing tsc against that output.
  await run("typecheck", [npm, "run", "typecheck"]);
  await run("worker-bundles", ["scripts/auth/check-worker-build.mjs"]);
  await run("preview-bundle", [npm, "run", "check:account-preview"]);
  if (built && !interrupted) {
    const task = start(["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], "http-server", { NEXT_PUBLIC_SITE_URL: origin });
    server = task.child;
    try {
      await new Promise((ready, reject) => {
        const timeout = setTimeout(() => reject(new Error("Local server startup timed out.")), 60_000);
        const checkReady = data => {
          if (data.toString().includes("Ready in")) { clearTimeout(timeout); ready(); }
        };
        server.stdout.on("data", checkReady);
        task.closed.then(() => { clearTimeout(timeout); reject(new Error("Local server exited before acceptance.")); });
      });
      await run("http-smoke", ["scripts/auth/smoke.mjs"], { AUTH_SMOKE_ORIGIN: origin });
    } finally {
      server.kill();
      await task.closed;
      server = undefined;
    }
  } else {
    steps.push({ name: "http-smoke", status: "skipped", reason: "A successful production build is required." });
  }
} catch {
  steps.push({ name: "runner", status: "failed", reason: "Local verification could not finish; inspect the step logs." });
} finally {
  const passed = !interrupted && steps.length > 0 && steps.every(step => step.status === "passed");
  await writeFile(resolve(directory, "report.json"), JSON.stringify({
    startedAt, finishedAt: new Date().toISOString(), revision,
    scope: "Working tree; local automated acceptance with all capability flags disabled",
    result: passed ? "passed" : "failed", launchAccepted: false, steps,
    pending: ["Real two-account browser and email checks", "Applied backend migrations and private storage policies", "Real PostgreSQL concurrency", "Approved catalog and Stripe sandbox lifecycle", "Provider/worker/render acceptance", "Separate hosted and production acceptance"],
  }, null, 2) + "\n");
  console.log(`Evidence: ${directory}`);
  console.log("Local checks do not accept the customer launch. See the Phase 11 manual checklist.");
  process.exitCode = passed ? 0 : 1;
}
