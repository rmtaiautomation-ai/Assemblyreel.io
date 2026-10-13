"use client";
import { useEffect,useRef,useState } from "react";
type BillingView = {
  enrolled:boolean;access:string;mode:string;portalAvailable:boolean;pendingCheckout:string|null;billingDate:string|null;interval:string|null;recoveryNeeded:number;
  subscription:{status:string;plan:string|null;cancelAtPeriodEnd:boolean;accessExpiresAt:string|null}|null;
  usage:{metric:string;limit:number;used:number;reserved:number;remaining:number|null;windowEnd:string}[];
  offers:{planId:string;interval:string;amount:number;currency:string}[];
};
export function AccountBillingPanel({returnState}:{returnState?:string}) {
  const [view,setView]=useState<BillingView|null>(null),[message,setMessage]=useState("Loading billing…"),[pending,setPending]=useState(false);
  const checkoutKey=useRef<{offer:string;id:string}|null>(null);
  const [invoices,setInvoices]=useState<{id:string;status:string;amount:number;currency:string;createdAt:string;url:string|null}[]>([]);
  async function refresh() {
    try {const response=await fetch("/api/account/billing",{cache:"no-store"});
      if(!response.ok){setMessage("Billing is temporarily unavailable. Refresh to retry.");return;}
      setView(await response.json());setMessage("");
    }catch{setMessage("Billing is temporarily unavailable. Refresh to retry.");}
  }
  useEffect(()=>{let active=true; const poll=async()=>{
    try {const response=await fetch("/api/account/billing",{cache:"no-store"});if(!active)return;
      if(response.ok){setView(await response.json());setMessage("");}else setMessage("Billing is temporarily unavailable. Refresh to retry.");
    }catch{if(active)setMessage("Billing is temporarily unavailable. Refresh to retry.");}
  };void poll();const timer=setInterval(()=>{if(document.visibilityState==="visible")void poll();},15000);
  return ()=>{active=false;clearInterval(timer);};},[]);
  async function mutate(path:string,body?:unknown) {
    if(pending)return;setPending(true);setMessage("");
    try {const response=await fetch(path,{method:"POST",headers:body?{"Content-Type":"application/json"}:{},body:body?JSON.stringify(body):undefined});
      const result=await response.json();if(!response.ok){setMessage(`Unable to proceed (${result.code ?? "SERVICE_UNAVAILABLE"}). Your saved content remains accessible.`);return;}
      if(result.url)window.location.href=result.url;else await refresh();
    }catch{setMessage("The result could not be confirmed. Refresh or retry using the same selection.");}finally{setPending(false);}
  }
  return <section className="space-y-4">
    {returnState && <p className="text-sm">{returnState==="canceled"?"Checkout was canceled. No access is granted by this return.":"Returned from checkout. Access appears only after verified billing synchronization."}</p>}
    <p role="status" className="text-sm text-amber-200">{message}</p>
    {view && <>
      <p className="text-sm">Stripe sandbox · Access: <strong>{view.access}</strong></p>
      {!view.enrolled && <button disabled={pending} className="mkt-btn-secondary p-2" onClick={()=>void mutate("/api/account/billing/enroll")}>Set up sandbox billing</button>}
      {view.subscription && <><p>Plan: {view.subscription.plan ?? "Unrecognized plan"} · {view.subscription.status}</p>
        <p className="text-sm">{view.subscription.cancelAtPeriodEnd?"Cancellation is scheduled at the billing period end.":"No scheduled cancellation."}</p>
        <p className="text-sm">Billing period end: {view.billingDate ?? "Awaiting synchronization"} ({view.interval ?? "unknown interval"})</p></>}
      {view.pendingCheckout && <p className="text-sm">Latest checkout: {view.pendingCheckout}. Unconfirmed billing does not grant paid access.</p>}
      {view.recoveryNeeded>0 && <p role="status" className="text-sm text-amber-200">{view.recoveryNeeded} operation(s) need reconciliation. Their reserved allowance remains held.</p>}
      {view.usage.length>0 ? <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr><th>Allowance</th><th>Used</th><th>Reserved</th><th>Remaining</th></tr></thead><tbody>{view.usage.map(item=><tr key={item.metric}><td>{item.metric}<br />Limit {item.limit}<br />Window ends {item.windowEnd}</td><td>{item.used}</td><td>{item.reserved}</td><td>{item.remaining ?? "Unknown"}</td></tr>)}</tbody></table></div>:<p className="text-sm">No current approved allowance window.</p>}
      {view.enrolled && view.offers.map(offer=><button disabled={pending || !!view.subscription && !["canceled","incomplete_expired"].includes(view.subscription.status) || !!view.pendingCheckout && ["pending","ready","unknown","complete"].includes(view.pendingCheckout) && !view.subscription} key={`${offer.planId}:${offer.interval}`} className="mkt-btn-secondary p-2 block" onClick={()=>{
        const selection=`${offer.planId}:${offer.interval}`;
        if(checkoutKey.current?.offer!==selection)checkoutKey.current={offer:selection,id:crypto.randomUUID()};
        void mutate("/api/stripe/checkout",{planId:offer.planId,interval:offer.interval,operationKey:checkoutKey.current.id});
      }}>{offer.planId} · {new Intl.NumberFormat("en",{style:"currency",currency:offer.currency}).format(offer.amount/100)} / {offer.interval} (test)</button>)}
      {!view.offers.length && <p className="text-sm">Purchases are unavailable until sandbox prices and allowances are approved.</p>}
      {view.portalAvailable && <button disabled={pending} className="mkt-btn-secondary p-2" onClick={()=>void mutate("/api/stripe/portal")}>Manage sandbox subscription</button>}
      {view.portalAvailable && <button className="text-[#13EF93] block" onClick={async()=>{
        try{const response=await fetch("/api/account/billing/invoices",{cache:"no-store"});if(response.ok)setInvoices((await response.json()).invoices);else setMessage("Invoices are unavailable or awaiting configuration.");}catch{setMessage("Invoices are temporarily unavailable.");}
      }}>Load sandbox invoices</button>}
      {invoices.map(invoice=><p key={invoice.id} className="text-xs">{invoice.status} · {invoice.amount/100} {invoice.currency.toUpperCase()} · {invoice.createdAt}
        {invoice.url && <a className="text-[#13EF93] block" href={invoice.url} target="_blank" rel="noopener noreferrer">View invoice on Stripe</a>}</p>)}
      <button disabled={pending} className="text-[#13EF93] block" onClick={()=>void refresh()}>Refresh billing state</button>
    </>}
  </section>;
}
