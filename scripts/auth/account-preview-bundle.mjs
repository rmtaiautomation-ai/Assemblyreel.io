import {fileURLToPath} from "node:url";
import {rm,realpath} from "node:fs/promises";
import {tmpdir} from "node:os";
import {basename,dirname} from "node:path";
import {bundle} from "@remotion/bundler";
const entry=fileURLToPath(new URL("../../src/remotion/account-preview/index.tsx",import.meta.url));
if(process.argv.includes("--deploy")) {
  const {deploySite}=await import("@remotion/lambda");
  const region=process.env.REMOTION_AWS_REGION;
  const bucketName=process.env.REMOTION_S3_BUCKET_NAME;
  if(!region || !bucketName || !process.env.REMOTION_AWS_ACCESS_KEY_ID || !process.env.REMOTION_AWS_SECRET_ACCESS_KEY)throw new Error("Explicit staging Remotion configuration required.");
  // Public static bundle only. Never upload the project's public/media or audio.
  const site=await deploySite({region,bucketName,entryPoint:entry,siteName:"account-preview-v1",options:{publicDir:null}});
  console.log(`Preview static bundle deployed: ${site.serveUrl}`);
} else {
  const output=await bundle({entryPoint:entry,publicDir:null});
  console.log("PASS: versioned topic-preview bundle compiled without copying public media or rendering a video.");
  const target=await realpath(output),temporaryRoot=await realpath(tmpdir());
  if(dirname(target).toLowerCase() !== temporaryRoot.toLowerCase() || !basename(target).startsWith("remotion-webpack-bundle-"))throw new Error("Unexpected temporary bundle directory; cleanup stopped.");
  await rm(target,{recursive:true,force:true});
}
