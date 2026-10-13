import assert from "node:assert/strict";
import test from "node:test";
import {importTypeScript} from "./import-typescript.mjs";
const {reconcileCheckout}=await importTypeScript(new URL("../../src/server/billing/recovery.ts",import.meta.url),{serverOnly:true});
const attempt={id:"attempt-a",account_id:"account-a",stripe_session_id:"cs_fixture",stripe_price_id:"price_fixture"};
function fixture(overrides={}) {
  const calls=[];
  const session={id:"cs_fixture",livemode:false,mode:"subscription",customer:"cus_fixture",status:"expired",metadata:{billing_account_id:"account-a",checkout_attempt_id:"attempt-a"},line_items:{has_more:false,data:[{price:{id:"price_fixture"},quantity:1}]},...overrides};
  const query={select(){return this;},eq(){return this;},async maybeSingle(){return {data:{stripe_mode:"test",stripe_customer_id:"cus_fixture"},error:null};}};
  return {calls,admin:{from:()=>query,rpc:async(name,args)=>{calls.push({name,args});return {error:null};}},stripe:{checkout:{sessions:{retrieve:async()=>session}}}};
}
test("checkout recovery uses retrieved bound session evidence, never a return parameter or local timeout",async()=>{
  const valid=fixture();assert.equal(await reconcileCheckout(valid.admin,valid.stripe,attempt),"expired");
  assert.deepEqual(valid.calls,[{name:"finish_sandbox_checkout",args:{p_account_id:"account-a",p_attempt_id:"attempt-a",p_session_id:"cs_fixture",p_state:"expired"}}]);
  const pending=fixture({status:"open"});assert.equal(await reconcileCheckout(pending.admin,pending.stripe,attempt),"pending");assert.equal(pending.calls.length,0);
  for(const invalid of [{livemode:true},{customer:"cus_foreign"},{metadata:{billing_account_id:"other",checkout_attempt_id:"attempt-a"}},{line_items:{has_more:true,data:[]}},{line_items:{has_more:false,data:[{price:{id:"price_other"},quantity:1}]}}]) {
    const current=fixture(invalid);await assert.rejects(reconcileCheckout(current.admin,current.stripe,attempt));assert.equal(current.calls.length,0);
  }
});
