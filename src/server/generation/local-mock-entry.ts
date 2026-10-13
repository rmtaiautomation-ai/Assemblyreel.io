import {createBillingAdminClient} from "@/server/billing/runtime";
import {requireJobs} from "@/server/access/launch";
import {executeGenerationJob} from "./job-worker";
import {z} from "zod";
async function main() {
  const origin=new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "");
  if(origin.protocol !== "http:" || !["localhost","127.0.0.1"].includes(origin.hostname))throw new Error("LOCAL_ORIGIN_REQUIRED");
  requireJobs();
  const id=z.string().uuid().parse(process.argv[2]);
  const admin=createBillingAdminClient();
  const {data,error}=await admin.from("generation_jobs").select("id,kind").eq("id",id).eq("kind","mock_script").maybeSingle();
  if(error || !data)throw new Error("MOCK_JOB_REQUIRED");
  console.log(JSON.stringify(await executeGenerationJob(admin,id)));
}
main().catch(()=>{console.error("Local mock job unavailable. Check configured local origin, accepted migrations, flags and mock job ID.");process.exitCode=1;});
