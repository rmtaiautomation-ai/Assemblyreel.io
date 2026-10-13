import "server-only";
import { resolve4 } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { AccessError } from "@/server/access/requests";
import { MAX_UPLOAD_BYTES,validateMediaBytes } from "./private-media";

export function isPublicIpv4(address:string) {
  const parts=address.split(".").map(Number);
  if(parts.length!==4 || parts.some(value=>!Number.isInteger(value)||value<0||value>255)) return false;
  const [a,b,c]=parts;
  return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||
    (a===172&&b>=16&&b<=31)||(a===192&&(b===168||(b===0&&(c===0||c===2))))||
    (a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));
}
export function approvedImportUrl(value:unknown,origins=process.env.PRIVATE_MEDIA_IMPORT_ORIGINS??"") {
  if(typeof value!=="string"||value.length>2048) throw new AccessError(400,"INVALID_URL","Invalid media URL.");
  let url:URL;
  try { url=new URL(value); } catch { throw new AccessError(400,"INVALID_URL","Invalid media URL."); }
  const allowed=origins.split(",").map(value=>value.trim()).filter(Boolean);
  if(url.protocol!=="https:"||url.username||url.password||url.hash||(url.port&&url.port!=="443")||!allowed.includes(url.origin)) {
    throw new AccessError(400,"IMPORT_ORIGIN_DENIED","Use an approved HTTPS media origin.");
  }
  return url;
}
export async function importMediaBytes(value:unknown) {
  if(process.env.PRIVATE_MEDIA_IMPORT_ENABLED!=="true") throw new AccessError(503,"FEATURE_UNAVAILABLE","URL import is not enabled.");
  const url=approvedImportUrl(value);
  // IPv4-only, pinned DNS connection. Every resolved address must be public;
  // DNS cannot rebind between validation and connection. IPv6 imports are rejected.
  const addresses=await resolve4(url.hostname);
  if(!addresses.length||addresses.some(address=>!isPublicIpv4(address))) throw new AccessError(400,"IMPORT_ADDRESS_DENIED","Media origin resolved to a disallowed address.");
  return new Promise<{bytes:Buffer;mime:string}>((resolve,reject)=>{
    const timer=setTimeout(()=>request.destroy(new Error("IMPORT_TIMEOUT")),8000);
    const request=httpsRequest(url,{method:"GET",headers:{Accept:"image/png,image/jpeg,image/webp,audio/mpeg,audio/wav,video/mp4"},
      lookup(_hostname,options,callback) {
        if(options.all) callback(null,[{address:addresses[0],family:4}]); else callback(null,addresses[0],4);
      },
    },response=>{
      if(response.statusCode!==200) {response.destroy();request.destroy();clearTimeout(timer);reject(new AccessError(400,"IMPORT_FAILED","Origin did not return media. Redirects are unsupported."));return;}
      const mime=String(response.headers["content-type"]??"").split(";")[0].trim();
      let size=0; const chunks:Buffer[]=[];
      response.on("data",(chunk:Buffer)=>{
        size+=chunk.length;
        if(size>MAX_UPLOAD_BYTES) {response.destroy(new Error("IMPORT_TOO_LARGE"));request.destroy();} else chunks.push(chunk);
      });
      response.on("error",()=>{clearTimeout(timer);reject(new AccessError(400,"IMPORT_FAILED","Unable to read bounded media from this origin."));});
      response.on("end",()=>{clearTimeout(timer);try {const bytes=Buffer.concat(chunks);validateMediaBytes(bytes,mime);resolve({bytes,mime});}catch(error){reject(error);}});
    });
    request.on("error",()=>{clearTimeout(timer);reject(new AccessError(400,"IMPORT_FAILED","Unable to retrieve media from this origin."));});
    request.end();
  });
}
