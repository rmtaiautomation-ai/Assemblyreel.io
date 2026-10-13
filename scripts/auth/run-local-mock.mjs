import dotenv from "dotenv";
import {build} from "esbuild";
import {mkdir,mkdtemp,realpath,rm} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {join,dirname,basename} from "node:path";
import {spawnSync} from "node:child_process";
dotenv.config({path:[".env.local",".env"],quiet:true});
const jobId=process.argv[2];
if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(jobId ?? ""))throw new Error("Pass the saved mock job UUID.");
// Process-only kill switches. This runner cannot execute either paid lane.
Object.assign(process.env,{COSTLY_FEATURES_ENABLED:"false",HOSTED_SCRIPT_ENABLED:"false",CLOUD_PREVIEW_ENABLED:"false",BILLING_ENABLED:"false",MOCK_JOBS_ENABLED:"true"});
const root=await realpath(fileURLToPath(new URL("../../",import.meta.url))),scratch=join(root,"scratch");
await mkdir(scratch,{recursive:true});const temporary=await mkdtemp(join(scratch,"local-mock-worker-"));
try{
  const target=join(temporary,"worker.cjs");
  await build({absWorkingDir:root,entryPoints:[join(root,"src/server/generation/local-mock-entry.ts")],outfile:target,
    bundle:true,platform:"node",format:"cjs",packages:"external",tsconfig:join(root,"tsconfig.json"),plugins:[{name:"worker-server-only-marker",setup(builder){
      builder.onResolve({filter:/^server-only$/},()=>({path:"server-only",namespace:"worker-marker"}));
      builder.onLoad({filter:/.*/,namespace:"worker-marker"},()=>({contents:"export {};",loader:"js"}));
    }}]});
  const child=spawnSync(process.execPath,[target,jobId],{cwd:root,env:process.env,stdio:"inherit",windowsHide:true});
  process.exitCode=child.status ?? 1;
}finally{
  const resolved=await realpath(temporary),scratchRoot=await realpath(scratch);
  if(dirname(resolved).toLowerCase() !== scratchRoot.toLowerCase() || !basename(resolved).startsWith("local-mock-worker-"))throw new Error("Unexpected worker directory; cleanup stopped.");
  await rm(resolved,{recursive:true,force:true});
}
