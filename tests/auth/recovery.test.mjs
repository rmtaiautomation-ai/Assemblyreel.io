import assert from "node:assert/strict";
import test from "node:test";
import { loadSource } from "../presentations/load-source.mjs";
import { createServerClient } from "@supabase/ssr";
const text=source=>`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const stubs={"server-only":text("export{}"),"next/headers":text("export async function headers(){return new Headers({origin:globalThis.__origin??'https://staging.example'})} export async function cookies(){return globalThis.__cookieStore}"),"next/navigation":text("export function redirect(path){throw new Error('REDIRECT:'+path)}"),"@/lib/supabase/server":text("export async function createClient(){return globalThis.__recoveryClient}"),"@/server/auth/account":text("export async function requireAccount(){return {id:'actor',email:'a@example.com'}}")};
const proof=await loadSource(new URL("../../src/server/auth/recovery-proof.ts",import.meta.url),stubs);
const mutations=await loadSource(new URL("../../src/server/auth/mutations.ts",import.meta.url),stubs);
const actions=await loadSource(new URL("../../src/features/auth/server/recovery-actions.ts",import.meta.url),stubs);
const data=values=>{const form=new FormData();for(const [k,v]of Object.entries(values))form.set(k,v);return form;};
test("email change stays disabled independently of configured password recovery",async()=>{
  const values={AUTH_RECOVERY_ENABLED:"true",AUTH_ABUSE_CONTROLS_READY:"true",AUTH_CAPTCHA_REQUIRED:"true",NEXT_PUBLIC_TURNSTILE_SITE_KEY:"synthetic-public-sitekey",AUTH_EMAIL_CHANGE_ENABLED:"false"};
  const old=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));Object.assign(process.env,values);
  try{
    assert.equal(mutations.recoveryEnabled(),true);
    assert.equal(mutations.emailChangeEnabled(),false);
    assert.match((await actions.changeEmail({},data({email:"other@example.com"}))).error,/Email changes are not available/);
    process.env.AUTH_EMAIL_CHANGE_ENABLED="true";assert.equal(mutations.emailChangeEnabled(),true);
    process.env.AUTH_RECOVERY_ENABLED="false";assert.equal(mutations.emailChangeEnabled(),false);
  }finally{for(const [key,value]of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
test("recovery proof rejects tampering, expiry, other users and other sessions",()=>{
  const old=process.env.AUTH_RECOVERY_SECRET;process.env.AUTH_RECOVERY_SECRET="synthetic-secret-at-least-32-characters";
  try{
    const token=proof.issueRecoveryProof("actor","session",1000);
    assert.equal(proof.validRecoveryProof(token,"actor","session",1001),true);
    assert.equal(proof.validRecoveryProof(token,"other","session",1001),false);
    assert.equal(proof.validRecoveryProof(token,"actor","other-session",1001),false);
    assert.equal(proof.validRecoveryProof(token+"tamper","actor","session",1001),false);
    assert.equal(proof.validRecoveryProof(token,"actor","session",601001),false);
  }finally{if(old===undefined)delete process.env.AUTH_RECOVERY_SECRET;else process.env.AUTH_RECOVERY_SECRET=old;}
});
test("mutation origins and CAPTCHA tokens are checked before provider calls",async()=>{
  const old={origin:process.env.NEXT_PUBLIC_SITE_URL,captcha:process.env.AUTH_CAPTCHA_REQUIRED};
  process.env.NEXT_PUBLIC_SITE_URL="https://staging.example";process.env.AUTH_CAPTCHA_REQUIRED="true";
  try{
    globalThis.__origin="https://evil.example";await assert.rejects(mutations.requireMutationOrigin(),/INVALID_ORIGIN/);
    assert.throws(()=>mutations.captchaOptions(new FormData()),/CAPTCHA_REQUIRED/);
    assert.deepEqual(mutations.captchaOptions(data({"cf-turnstile-response":"synthetic-challenge"})),{captchaToken:"synthetic-challenge"});
  }finally{delete globalThis.__origin;for(const [key,value]of [["NEXT_PUBLIC_SITE_URL",old.origin],["AUTH_CAPTCHA_REQUIRED",old.captcha]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
test("recovery updates require a verified recovery-session proof, then consume it and revoke refresh sessions",async()=>{
  const values={AUTH_RECOVERY_SECRET:"synthetic-secret-at-least-32-characters",AUTH_RECOVERY_ENABLED:"true",AUTH_ABUSE_CONTROLS_READY:"true",AUTH_CAPTCHA_REQUIRED:"true",NEXT_PUBLIC_TURNSTILE_SITE_KEY:"synthetic-public-sitekey",AUTH_LAUNCH_READY:"true",APP_ACCESS_STAGE:"auth_only",NEXT_PUBLIC_SITE_URL:"https://staging.example"};
  const old=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));Object.assign(process.env,values);
  let token,updates=0,scope;
  globalThis.__cookieStore={get(){return token?{value:token}:undefined},delete(){token=undefined}};
  globalThis.__recoveryClient={auth:{async getUser(){return {data:{user:{id:"actor",email:"a@example.com",email_confirmed_at:"now"}},error:null}},async getClaims(){return {data:{claims:{session_id:"session"}},error:null}},async updateUser(){updates++;return {error:null}},async signOut(options){scope=options.scope;return {error:null}}}};
  try{
    const input=data({password:"strong-new-password"});
    assert.match((await actions.resetPassword({},input)).error,/authorization expired/);assert.equal(updates,0);
    token=proof.issueRecoveryProof("actor","session");
    assert.deepEqual(await actions.resetPassword({},input),{message:"Password updated. Sign in with your new password.",passwordResetComplete:true});
    assert.equal(updates,1);assert.equal(token,undefined);assert.equal(scope,"global");
    assert.match((await actions.resetPassword({},input)).error,/authorization expired/);
    token=proof.issueRecoveryProof("actor","session");
    globalThis.__recoveryClient.auth.signOut=async()=>({error:{code:"service_unavailable"}});
    const unconfirmedLogout=await actions.resetPassword({},input);
    assert.match(unconfirmedLogout.message,/revocation could not be confirmed/);
    assert.equal(unconfirmedLogout.passwordResetComplete,undefined);
    assert.equal(token,undefined);
  }finally{for(const [key,value]of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}delete globalThis.__cookieStore;delete globalThis.__recoveryClient;}
});

test("real SSR recovery consumes proof and clears base or chunked session cookies before completion",async()=>{
  const values={AUTH_RECOVERY_SECRET:"synthetic-secret-at-least-32-characters",AUTH_RECOVERY_ENABLED:"true",AUTH_ABUSE_CONTROLS_READY:"true",AUTH_CAPTCHA_REQUIRED:"true",NEXT_PUBLIC_TURNSTILE_SITE_KEY:"synthetic-public-sitekey",AUTH_LAUNCH_READY:"true",APP_ACCESS_STAGE:"auth_only",NEXT_PUBLIC_SITE_URL:"https://staging.example"};
  const old=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));Object.assign(process.env,values);
  try{
    for(const chunked of [false,true]){
      const actor={id:"actor",email:"a@example.com",email_confirmed_at:"now",user_metadata:chunked?{padding:"x".repeat(5000)}:{}};
      const jwt=[{alg:"HS256",typ:"JWT"},{sub:actor.id,session_id:"session",exp:Math.floor(Date.now()/1000)+3600}].map(value=>Buffer.from(JSON.stringify(value)).toString("base64url")).concat("synthetic-signature").join(".");
      const encoded="base64-"+Buffer.from(JSON.stringify({access_token:jwt,refresh_token:"synthetic-refresh",expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:"bearer",user:actor})).toString("base64url");
      const cookies=new Map([[proof.RECOVERY_COOKIE,proof.issueRecoveryProof(actor.id,"session")]]),writes=[];
      if(chunked){for(let offset=0;offset<encoded.length;offset+=3000)cookies.set(`sb-fixture-auth-token.${offset/3000}`,encoded.slice(offset,offset+3000));}
      else cookies.set("sb-fixture-auth-token",encoded);
      globalThis.__cookieStore={get:key=>cookies.has(key)?{value:cookies.get(key)}:undefined,delete:key=>cookies.delete(key)};
      let updates=0,revocations=0,reads=0;
      const client=()=>createServerClient("https://fixture.supabase.co","synthetic-public-key",{
        cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:changes=>{for(const cookie of changes){writes.push(cookie);if(cookie.options.maxAge===0)cookies.delete(cookie.name);else cookies.set(cookie.name,cookie.value);}}},
        global:{fetch:async(input,options)=>{
          const url=new URL(String(input));assert.equal(url.origin,"https://fixture.supabase.co");
          assert.equal(new Headers(options.headers).get("authorization"),`Bearer ${jwt}`);
          if(url.pathname==="/auth/v1/logout"){
            assert.equal(url.searchParams.get("scope"),"global");revocations++;return new Response(null,{status:204});
          }
          assert.equal(url.pathname,"/auth/v1/user");
          if(options.method==="PUT"){updates++;assert.equal(JSON.parse(options.body).password,"synthetic-new-password");}
          else reads++;
          return Response.json(actor);
        }},
      });
      globalThis.__recoveryClient=client();
      const result=await actions.resetPassword({},data({password:"synthetic-new-password"}));
      assert.equal(result.passwordResetComplete,true,JSON.stringify(result));
      assert.equal(updates,1);assert.equal(revocations,1);assert.ok(reads>=1);
      assert.equal(cookies.has(proof.RECOVERY_COOKIE),false);
      assert.equal([...cookies.keys()].some(name=>name.startsWith("sb-fixture-auth-token")),false);
      assert.ok(writes.some(cookie=>cookie.options.maxAge===0));
      const fresh=await client().auth.getUser();
      assert.equal(fresh.data.user,null);
      assert.equal(fresh.error.name,"AuthSessionMissingError");
    }
  }finally{for(const [key,value]of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}delete globalThis.__cookieStore;delete globalThis.__recoveryClient;}
});
