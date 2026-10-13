"use client";
import { useEffect,useRef,useState } from "react";
type Job={id:string;kind:string;state:string;error_code:string|null;cancelable:boolean};
export function AccountJobPanel({projectId,mockEnabled,scriptEnabled,renderEnabled}:{projectId:string;mockEnabled:boolean;scriptEnabled:boolean;renderEnabled:boolean}) {
  const [jobs,setJobs]=useState<Job[]>([]),[message,setMessage]=useState("Loading saved jobs…"),[pending,setPending]=useState(false),[output,setOutput]=useState("");
  const operation=useRef<{kind:string;id:string}|null>(null);
  async function refresh() {
    try{const response=await fetch(`/api/account/jobs?projectId=${projectId}`,{cache:"no-store"});
      if(response.ok){setJobs((await response.json()).jobs);setMessage("");}else setMessage("Saved jobs are temporarily unavailable.");
    }catch{setMessage("Saved jobs are temporarily unavailable.");}
  }
  useEffect(()=>{let active=true;const poll=async()=>{
    try{const response=await fetch(`/api/account/jobs?projectId=${projectId}`,{cache:"no-store"});if(!active)return;
      if(response.ok){setJobs((await response.json()).jobs);setMessage("");}else setMessage("Saved jobs are temporarily unavailable.");
    }catch{if(active)setMessage("Saved jobs are temporarily unavailable.");}
  };void poll();const timer=setInterval(()=>{if(document.visibilityState==="visible")void poll();},5000);return()=>{active=false;clearInterval(timer);};},[projectId]);
  async function submit(kind:"mock_script"|"script"|"cloud_render") {
    if(pending)return;setPending(true);setMessage("");
    if(operation.current?.kind!==kind)operation.current={kind,id:crypto.randomUUID()};
    try{const response=await fetch("/api/account/jobs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId,kind,operationId:operation.current.id})});
      const result=await response.json();if(!response.ok){setMessage(`Unable to queue (${result.code ?? "SERVICE_UNAVAILABLE"}).`);return;}
      operation.current=null;await refresh();
    }catch{setMessage("Queue result unknown. Retry unchanged or refresh saved jobs before starting another operation.");}finally{setPending(false);}
  }
  return <section className="space-y-3 border-t border-[#353B44] pt-4"><h2 className="font-semibold">Background jobs</h2>
    {mockEnabled && <button disabled={pending} onClick={()=>void submit("mock_script")} className="mkt-btn-secondary p-2">Run mock draft (no provider)</button>}
    {scriptEnabled && <><p className="text-sm">A short hosted script reserves and uses 4,096 allowance tokens. This is a fixed ceiling allowance, not a display of actual vendor tokens.</p><button disabled={pending} onClick={()=>void submit("script")} className="mkt-btn-secondary p-2">Generate short script</button></>}
    {renderEnabled && <><p className="text-sm">Cloud preview renders a five-second topic title card. It reserves five render seconds and 3 MiB of storage allowance.</p><button disabled={pending} onClick={()=>void submit("cloud_render")} className="mkt-btn-secondary p-2">Render private topic preview</button></>}
    <p role="status" className="text-sm text-amber-200">{message}</p>
    {!jobs.length && <p className="text-sm">No saved jobs yet.</p>}
    <ul className="space-y-3 text-sm">{jobs.map(job=><li key={job.id}>{job.kind==="mock_script"?"Mock draft":job.kind==="cloud_render"?"Cloud topic preview":"Hosted script"} · {job.state}
      {job.state==="unknown" && <p className="text-amber-200">Submission needs reconciliation. Its reservation is retained; it will not retry the provider automatically.</p>}
      {job.state==="succeeded" && job.kind==="cloud_render" && <a className="block text-[#13EF93]" href={`/api/render/download?artifactId=${job.id}`} target="_blank" rel="noopener noreferrer">Download private preview</a>}
      {job.state==="succeeded" && job.kind!=="cloud_render" && <button className="block text-[#13EF93]" onClick={async()=>{
        try{const response=await fetch(`/api/account/jobs/${job.id}`,{cache:"no-store"});if(response.ok)setOutput((await response.json()).job.output);else setMessage("Output is unavailable.");}catch{setMessage("Output is unavailable.");}
      }}>View private result</button>}
      {job.cancelable && <button disabled={pending} className="block text-[#13EF93]" onClick={async()=>{
        try{const response=await fetch(`/api/account/jobs/${job.id}`,{method:"DELETE"});if(!response.ok)setMessage("Cancellation is unavailable after submission starts.");else await refresh();}catch{setMessage("Unable to confirm cancellation. Refresh to check.");}
      }}>Cancel before submission</button>}
    </li>)}</ul>
    {output && <pre className="whitespace-pre-wrap break-words text-sm">{output}</pre>}
    <button className="text-[#13EF93] text-sm" onClick={()=>void refresh()}>Refresh saved jobs</button>
  </section>;
}
