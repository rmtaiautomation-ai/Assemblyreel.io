import assert from "node:assert/strict";
import test from "node:test";
import { loadSource } from "../presentations/load-source.mjs";
import { NextRequest } from "next/server.js";
const moduleText = value => `data:text/javascript;base64,${Buffer.from(value).toString("base64")}`;
const stubs = {
  "server-only": moduleText("export{}"),
  "@/lib/supabase/server": moduleText("export async function createClient(){globalThis.__setupCalls++;return globalThis.__setupClient;}"),
};
const route = await loadSource(new URL("../../src/app/api/account/onboarding/route.ts", import.meta.url), stubs);
const proxy = await loadSource(new URL("../../src/lib/supabase/proxy.ts", import.meta.url), {
  "next/server": new URL("../../node_modules/next/server.js", import.meta.url).href,
  "@supabase/ssr": moduleText("export function createServerClient(){return globalThis.__setupClient;}"),
});
const user = { id: "10000000-0000-4000-8000-000000000001", email: "a@example.com", email_confirmed_at: "now", is_anonymous: false };
const settings = { workspaceId: null, name: "My channel", content_theme: "History", visual_aesthetic: "Cinematic", aspect_ratio: "Vertical 9:16", video_language: "English", duration_pref: "60-90s", topic: "My draft" };
function enable() {
  const values = { AUTH_LAUNCH_READY: "true", APP_ACCESS_STAGE: "auth_only", OWNERSHIP_MIGRATION_READY: "true", OWNED_CONTENT_ENABLED: "true", ONBOARDING_ENABLED: "true", NEXT_PUBLIC_SITE_URL: "https://staging.example", NEXT_PUBLIC_SUPABASE_URL: "https://fixture.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture" };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values); globalThis.__setupCalls = 0;
  return () => { for (const [key,value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } delete globalThis.__setupClient; delete globalThis.__setupCalls; };
}
function client(identity = user) {
  return { auth: { getUser: async () => ({ data: { user: identity }, error: null }) }, from(table) {
    return { select() { return this; }, eq(key,value) { assert.equal(key, table === "users" ? "id" : "actor_id"); assert.equal(value,user.id); return this; }, async maybeSingle() { return { data: table === "users" ? { id:user.id } : null, error:null }; } };
  }, async rpc() { throw new Error("Unexpected mutation"); } };
}
const request = (command, origin = "https://staging.example") => new Request("https://staging.example/api/account/onboarding", { method:"POST", headers:{ "Content-Type":"application/json", origin }, body:JSON.stringify(command) });

test("onboarding flags, origins, strict choices and verified identity fail before mutation", async () => {
  const restore = enable();
  try {
    globalThis.__setupClient = client();
    process.env.ONBOARDING_ENABLED = "false";
    assert.equal((await route.GET()).status,503);
    assert.equal((await route.POST(request({ action:"complete",revision:1 }))).status,503);
    assert.equal(globalThis.__setupCalls,0);
    process.env.ONBOARDING_ENABLED = "true";
    assert.equal((await route.POST(request({action:"save",revision:0,settings},"https://evil.example"))).status,403);
    for (const invalid of [{...settings,userId:user.id},{...settings,visual_aesthetic:"automatic AI"},{...settings,workspaceId:"bad"},{...settings,topic:"x".repeat(201)}]) {
      assert.equal((await route.POST(request({action:"save",revision:0,settings:invalid}))).status,400);
    }
    assert.equal(globalThis.__setupCalls,0);
    for (const identity of [null,{...user,is_anonymous:true},{...user,email_confirmed_at:null}]) {
      globalThis.__setupClient = client(identity);
      assert.equal((await route.POST(request({action:"save",revision:0,settings}))).status,401);
    }
  } finally { restore(); }
});

test("onboarding reads only the verified actor and writes through bounded metadata RPCs", async () => {
  const restore = enable(); const calls = [];
  try {
    globalThis.__setupClient = client();
    const initial = await route.GET(); assert.deepEqual(await initial.json(),{state:null});
    assert.equal(initial.headers.get("cache-control"),"private, no-store");
    globalThis.__setupClient.rpc = async (name,args) => { calls.push({name,args}); return {data:{revision:1,settings,workspace_id:null,project_id:null},error:null}; };
    assert.equal((await route.POST(request({action:"save",revision:0,settings}))).status,200);
    assert.deepEqual(calls,[{name:"save_account_onboarding",args:{expected_revision:0,settings}}]);
    assert.equal((await route.POST(request({action:"complete",revision:1}))).status,200);
    assert.deepEqual(calls[1],{name:"complete_account_onboarding",args:{expected_revision:1}});
    for (const [message,status] of [["STALE_SETUP",409],["REQUEST_RATE_LIMIT",429],["TEST_WORKSPACE_LIMIT",400]]) {
      globalThis.__setupClient.rpc = async () => ({data:null,error:{message}});
      assert.equal((await route.POST(request({action:"complete",revision:1}))).status,status);
    }
  } finally { restore(); }
});

test("Proxy opens only configured confirmed onboarding and keeps legacy generation pages closed", async () => {
  const restore = enable();
  try {
    globalThis.__setupClient = client();
    assert.equal((await proxy.updateSession(new NextRequest("https://staging.example/onboarding"))).headers.get("location"),null);
    assert.equal((await proxy.updateSession(new NextRequest("https://staging.example/workspaces/private"))).headers.get("location"),"https://staging.example/account");
    process.env.OWNERSHIP_MIGRATION_READY = "false";
    assert.equal((await proxy.updateSession(new NextRequest("https://staging.example/onboarding"))).headers.get("location"),"https://staging.example/account");
    process.env.OWNERSHIP_MIGRATION_READY = "true"; globalThis.__setupClient = client(null);
    for (const path of ["/onboarding","/account/projects/private"]) assert.equal((await proxy.updateSession(new NextRequest("https://staging.example"+path))).headers.get("location"),"https://staging.example/login?next=/account");
  } finally { restore(); }
});
