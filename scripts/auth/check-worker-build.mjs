import assert from "node:assert/strict";
import {build} from "esbuild";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("../../",import.meta.url));
// Local bundle check only; no Trigger login/deploy, scheduled task or provider call.
for(const entry of ["src/trigger/account-access/account-generation.ts","src/trigger/account-access/billing-recovery.ts","src/server/generation/local-mock-entry.ts"]) {
  const result=await build({absWorkingDir:root,entryPoints:[fileURLToPath(new URL(`../../${entry}`,import.meta.url))],tsconfig:fileURLToPath(new URL("../../tsconfig.json",import.meta.url)),bundle:true,platform:"node",format:"esm",write:false,metafile:true,
    packages:"external",plugins:[{name:"worker-server-only-marker",setup(builder){
      builder.onResolve({filter:/^server-only$/},()=>({path:"server-only",namespace:"worker-marker"}));
      builder.onLoad({filter:/.*/,namespace:"worker-marker"},()=>({contents:"export {};",loader:"js"}));
    }}]});
  for(const output of Object.values(result.metafile.outputs)) for(const dependency of output.imports) {
    assert.ok(!dependency.path.startsWith("next/") && dependency.path !== "server-only",`Request dependency in worker: ${dependency.path}`);
  }
  assert.ok(!Object.keys(result.metafile.inputs).some(input=>input.includes("supabase/server") || input.includes("autopilot")),"Worker reached legacy/request-bound code");
}
console.log("PASS: secured worker and local mock-runner bundles build without Next request APIs or legacy autopilot.");
