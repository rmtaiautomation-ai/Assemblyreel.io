import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AccessError } from "./requests";
export async function admitRequest(client:SupabaseClient,action:"upload"|"import"|"sign"|"workspace"|"rename") {
  const {error}=await client.rpc("admit_account_request",{p_action:action});
  if(error) throw new AccessError(error.message.includes("REQUEST_RATE_LIMIT")?429:503,"REQUEST_LIMIT","This request is temporarily unavailable. Please wait and retry.");
}
