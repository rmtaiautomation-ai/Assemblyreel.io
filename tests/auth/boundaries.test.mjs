import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { loadSource } from "../presentations/load-source.mjs";

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(new URL(entry.name + "/", directory)) : [new URL(entry.name, directory)]))).flat();
}

test("every legacy action and API handler has its gate before existing work", async () => {
  let actions = 0, handlers = 0;
  for (const file of await files(new URL("../../src/", import.meta.url))) {
    if (!file.pathname.endsWith(".ts") || file.pathname.includes("/auth/") || file.pathname.endsWith("/owned-workspace-actions.ts")) continue;
    const source = await readFile(file, "utf8");
    const ast = ts.createSourceFile(file.pathname, source, ts.ScriptTarget.Latest, true);
    if (!ast.statements.some(s => ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression) && s.expression.text === "use server")) continue;
    for (const s of ast.statements) {
      if (!ts.isFunctionDeclaration(s) || !s.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
      assert.equal(s.body.statements[0].getText(ast), "requireLegacyServiceAvailable();", `${file.pathname} ${s.name.text}`);
      actions++;
    }
  }
  const ownedRoutes = new Set(["account/billing/route.ts","account/billing/enroll/route.ts","account/billing/invoices/route.ts","account/jobs/route.ts","account/jobs/[jobId]/route.ts","account/onboarding/route.ts","account/workspaces/route.ts","account/projects/route.ts","account/resources/route.ts","media/upload/route.ts","media/from-url/route.ts","media/[mediaId]/status/route.ts","media/[mediaId]/content/route.ts","render/download/route.ts"]);
  const billingRoutes = new Set(["stripe/checkout/route.ts","stripe/portal/route.ts","stripe/webhook/route.ts"]);
  let billingHandlers=0;
  let ownedHandlers=0;
  for (const file of await files(new URL("../../src/app/api/", import.meta.url))) {
    if (!file.pathname.endsWith("/route.ts") || file.pathname.includes("/api/auth/") || file.pathname.includes("/api/leads/")) continue;
    const source = await readFile(file, "utf8");
    const ast = ts.createSourceFile(file.pathname, source, ts.ScriptTarget.Latest, true);
    for (const s of ast.statements) {
      if (!ts.isFunctionDeclaration(s) || !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(s.name?.text)) continue;
      const relative=decodeURIComponent(file.pathname).split("/src/app/api/")[1];
      if(ownedRoutes.has(relative)) {
        assert.match(s.body.statements[0].getText(ast),/return apiResponse\(async\s*\(\)\s*=>\s*\{\s*(requireFeature|requireJobs|requireBillingLaunch)\(/,file.pathname);
        ownedHandlers++;continue;
      }
      if(billingRoutes.has(relative)) {
        assert.equal(s.body.statements[0].getText(ast),"if (!billingLaunchReady()) return legacyFeatureResponse();");billingHandlers++;continue;
      }
      assert.equal(s.body.statements[0].getText(ast), "if (!legacyServiceEnabled()) return legacyFeatureResponse();", file.pathname);
      handlers++;
    }
  }
  assert.equal(actions, 83);
  assert.equal(handlers, 7);
  assert.equal(ownedHandlers, 18);
  assert.equal(billingHandlers, 3);
});

test("download requests stop before accessing files, including traversal paths", async () => {
  const route = await loadSource(new URL("../../src/app/api/render/download/route.ts", import.meta.url), {
    "server-only": "data:text/javascript,export{}",
    "next/server": new URL("../../node_modules/next/server.js", import.meta.url).href,
    "next/headers": new URL("../../node_modules/next/headers.js", import.meta.url).href,
    "fs/promises": "data:text/javascript,export default {readFile(){throw new Error('Unexpected file access')}}",
  });
  for (const path of ["/tmp/render.mp4", "../secret", ""]) {
    const response = await route.GET(new Request(`https://staging.example/api/render/download?path=${encodeURIComponent(path)}`));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "FEATURE_UNAVAILABLE");
  }
});
