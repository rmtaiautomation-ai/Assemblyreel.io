import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { BillingError } from "./errors";
import { reconcileBillingEvent,type BillingWebhookDependencies } from "./webhook-handler";

// A current, mode-verified mapped Stripe session may close a known attempt.
// Expiration of a local clock or canceled return URL alone grants no authority.
export async function reconcileCheckout(admin:SupabaseClient,stripe:Stripe,attempt:{id:string;account_id:string;stripe_session_id:string;stripe_price_id:string}) {
  const {data:account,error}=await admin.from("billing_accounts").select("stripe_customer_id,stripe_mode").eq("id",attempt.account_id).maybeSingle();
  if(error || !account || account.stripe_mode !== "test" || !account.stripe_customer_id)throw new BillingError("BILLING_UNAVAILABLE");
  const session=await stripe.checkout.sessions.retrieve(attempt.stripe_session_id,{expand:["line_items"]});
  const customer=typeof session.customer === "string"?session.customer:session.customer?.id;
  if(session.livemode || session.mode !== "subscription" || customer !== account.stripe_customer_id
    || session.metadata?.billing_account_id !== attempt.account_id || session.metadata?.checkout_attempt_id !== attempt.id
    || session.line_items?.has_more || session.line_items?.data.length !== 1
    || session.line_items.data[0].price?.id !== attempt.stripe_price_id || session.line_items.data[0].quantity !== 1)throw new BillingError("OWNERSHIP_REQUIRED");
  if(session.status !== "complete" && session.status !== "expired")return "pending";
  const result=await admin.rpc("finish_sandbox_checkout",{p_account_id:attempt.account_id,p_attempt_id:attempt.id,p_session_id:session.id,p_state:session.status});
  if(result.error)throw new BillingError("BILLING_UNAVAILABLE");
  return session.status;
}

export async function recoverBilling(admin:SupabaseClient,stripe:Stripe,dependencies:BillingWebhookDependencies) {
  let processed=0,failed=0,checkoutRecovered=0;
  const now=new Date().toISOString();
  const receipts=await admin.from("billing_webhook_events").select("stripe_event_id,event_type,object_id,attempts").eq("stripe_mode","test")
    .in("status",["received","failed","processing"]).lt("attempts",20).lte("next_retry_at",now).order("next_retry_at").limit(20);
  if(receipts.error)throw new BillingError("BILLING_UNAVAILABLE");
  for(const receipt of receipts.data ?? []) {
    // Back off even if a lease is busy or target resolution fails before claim.
    const defer=await admin.from("billing_webhook_events").update({next_retry_at:new Date(Date.now()+Math.min(3600000,60000*2**Math.min(receipt.attempts,6))).toISOString()})
      .eq("stripe_mode","test").eq("stripe_event_id",receipt.stripe_event_id);
    if(defer.error)throw new BillingError("BILLING_UNAVAILABLE");
    try{await reconcileBillingEvent(dependencies,{id:receipt.stripe_event_id,type:receipt.event_type,objectId:receipt.object_id,mode:"test"});processed++;}catch{failed++;}
  }
  // Reconcile current subscriptions even if a webhook was missed and for annual monthly windows.
  const subscriptions=await admin.from("billing_subscriptions").select("stripe_subscription_id").eq("stripe_mode","test").eq("is_current",true).order("verified_at").limit(20);
  if(subscriptions.error)throw new BillingError("BILLING_UNAVAILABLE");
  for(const subscription of subscriptions.data ?? []) {
    try {await reconcileBillingEvent(dependencies,{id:`reconcile:${subscription.stripe_subscription_id}:${Math.floor(Date.now()/300000)}`,type:"customer.subscription.updated",objectId:subscription.stripe_subscription_id,mode:"test"});processed++;}catch{failed++;}
  }
  const attempts=await admin.from("billing_checkout_attempts").select("id,account_id,stripe_session_id,stripe_price_id")
    .eq("stripe_mode","test").in("state",["ready","unknown"]).not("stripe_session_id","is",null).order("updated_at").limit(20);
  if(attempts.error)throw new BillingError("BILLING_UNAVAILABLE");
  for(const attempt of attempts.data ?? []) {
    try{const state=await reconcileCheckout(admin,stripe,attempt);if(state !== "pending")checkoutRecovered++;}catch{failed++;}
  }
  // Unknown customer/session binding without a persisted ID stays blocked for
  // operator evidence. No automatic retry after Stripe's idempotency retention.
  return {processed,failed,checkoutRecovered};
}
