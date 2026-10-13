import assert from "node:assert/strict";
import test from "node:test";
import { loadSource } from "../presentations/load-source.mjs";
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
    token=proof.issueRecoveryProof("actor","session");await assert.rejects(actions.resetPassword({},input),/REDIRECT:\/login/);
    assert.equal(updates,1);assert.equal(token,undefined);assert.equal(scope,"global");
    assert.match((await actions.resetPassword({},input)).error,/authorization expired/);
  }finally{for(const [key,value]of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}delete globalThis.__cookieStore;delete globalThis.__recoveryClient;}
});
