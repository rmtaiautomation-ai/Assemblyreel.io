import { apiResponse,AccessError } from "@/server/access/requests";
import { requireBillingLaunch } from "@/server/access/launch";
import { accessContext } from "@/server/access/ownership";
import { admitRequest } from "@/server/access/rate-limit";
import { createBillingAdminClient } from "@/server/billing/runtime";
import { createBillingRepository } from "@/server/billing/supabase-repository";
import { createStripeBillingClient,createStripeBillingGateway } from "@/server/billing/stripe-gateway";
export async function GET() {return apiResponse(async()=>{
  requireBillingLaunch();
  if(process.env.BILLING_INVOICES_ENABLED !== "true")throw new AccessError(503,"FEATURE_UNAVAILABLE","Invoices are awaiting configuration.");
  const {client,user}=await accessContext();
  const account=await createBillingRepository(createBillingAdminClient()).getAccountForActor(user.id);
  if(!account?.stripeCustomerId || account.ownerId !== user.id || account.stripeMode !== "test")throw new AccessError(404,"RESOURCE_UNAVAILABLE","Invoices are unavailable.");
  await admitRequest(client,"sign");
  const stripe=createStripeBillingClient(process.env.STRIPE_SECRET_KEY ?? "","test");
  await createStripeBillingGateway(stripe,"test").verifyCustomer(account.stripeCustomerId,account.id);
  const invoices=await stripe.invoices.list({customer:account.stripeCustomerId,limit:12});
  return Response.json({invoices:invoices.data.map(invoice=>{
    const customer=typeof invoice.customer === "string"?invoice.customer:invoice.customer?.id;
    if(invoice.livemode || customer !== account.stripeCustomerId)throw new Error("INVALID_INVOICE");
    let url:string|null=null;
    if(invoice.hosted_invoice_url){const link=new URL(invoice.hosted_invoice_url);if(link.protocol === "https:" && link.hostname === "invoice.stripe.com" && !link.username && !link.password)url=link.href;}
    return {id:invoice.id,status:invoice.status,amount:invoice.amount_paid,currency:invoice.currency,createdAt:new Date(invoice.created*1000).toISOString(),url};
  })});
});}
