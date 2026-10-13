"use client";
import Link from "next/link";
import { useEffect,useState,useRef } from "react";
type Workspace={id:string;name:string;content_theme:string};
type Project={id:string;topic:string};
export function OwnedContentPanel({mediaEnabled}:{mediaEnabled:boolean}) {
  const [workspaces,setWorkspaces]=useState<Workspace[]>([]),[projects,setProjects]=useState<Project[]>([]);
  const [selected,setSelected]=useState(""),[message,setMessage]=useState(""),[pending,setPending]=useState(false);
  const operation=useRef<string|null>(null);
  const uploadOperation=useRef<{fingerprint:string;id:string}|null>(null);
  const [playback,setPlayback]=useState("");
  async function load() {
    const response=await fetch("/api/account/workspaces",{cache:"no-store"});
    if(response.ok) setWorkspaces((await response.json()).workspaces); else setMessage("Owned content is temporarily unavailable.");
  }
  useEffect(()=>{fetch("/api/account/workspaces",{cache:"no-store"}).then(async response=>{if(response.ok)setWorkspaces((await response.json()).workspaces);}).catch(()=>{});},[]);
  return <section className="space-y-4 border-t border-[#353B44] pt-5"><h2 className="font-semibold">Your workspaces</h2>
    <form className="space-y-2" onSubmit={async event=>{
      event.preventDefault(); if(pending)return;setPending(true);setMessage("");
      const form=new FormData(event.currentTarget); operation.current??=crypto.randomUUID();
      try {
        const response=await fetch("/api/account/workspaces",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workspace:{name:form.get("name"),content_theme:form.get("theme")},operationId:operation.current})});
        if(!response.ok) {setMessage("Unable to create the workspace. Check the details and three-workspace test limit.");return;}
        operation.current=null;await load();setMessage("Workspace created.");
      } catch {setMessage("Unable to save. Retry with the same details.");} finally {setPending(false);}
    }}><label className="text-sm block">Workspace name<input name="name" required maxLength={100} className="block w-full p-2 bg-[#0A0B0D] border border-[#353B44] rounded" /></label>
      <label className="text-sm block">Content theme<input name="theme" required maxLength={200} className="block w-full p-2 bg-[#0A0B0D] border border-[#353B44] rounded" /></label>
      <button disabled={pending} className="mkt-btn-secondary px-3 py-2">Create workspace</button></form>
    <ul className="text-sm space-y-2">{workspaces.map(workspace=><li key={workspace.id}><button className="text-[#13EF93]" onClick={async()=>{
      setSelected("");setProjects([]);
      try {const response=await fetch(`/api/account/projects?workspaceId=${workspace.id}`,{cache:"no-store"});if(response.ok)setProjects((await response.json()).projects);else setMessage("Projects are unavailable.");}catch{setMessage("Projects are unavailable.");}
    }}>{workspace.name}</button></li>)}</ul>
    {projects.length>0 && <label className="text-sm block">Existing project<select className="block bg-[#0A0B0D] p-2 w-full" value={selected} onChange={event=>setSelected(event.target.value)}><option value="">Choose a project</option>{projects.map(project=><option key={project.id} value={project.id}>{project.topic}</option>)}</select></label>}
    {mediaEnabled && selected && <label className="text-sm block">Upload media (up to 3 MiB)<input disabled={pending} type="file" accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/wav,video/mp4" onChange={async event=>{
      const control=event.currentTarget,file=control.files?.[0];if(!file)return;setPending(true);setMessage("");setPlayback("");
      const fingerprint=`${selected}:${file.name}:${file.size}:${file.lastModified}`;
      if(uploadOperation.current?.fingerprint!==fingerprint)uploadOperation.current={fingerprint,id:crypto.randomUUID()};
      try {const response=await fetch("/api/media/upload",{method:"POST",headers:{"Content-Type":file.type,"X-Project-Id":selected,"Idempotency-Key":uploadOperation.current.id,"X-File-Name":encodeURIComponent(file.name)},body:file});
        if(!response.ok){setMessage("Upload was not completed. Select the same file to retry.");return;}const result=await response.json();setPlayback(result.url);setMessage("Uploaded to private storage.");uploadOperation.current=null;
      }catch{setMessage("Upload was not completed. Select the same file to retry.");}finally{setPending(false);control.value="";}
    }} /></label>}
    <p role="status" className="text-sm text-[#B5BCC6]">{message}</p>
    {selected && <Link href={`/account/projects/${selected}`} className="block text-sm text-[#13EF93]">Open saved project</Link>}
    {playback && <a className="text-sm text-[#13EF93]" href={playback} target="_blank" rel="noopener noreferrer">View uploaded media</a>}
    <p className="text-xs text-[#B5BCC6]">Create your first draft through workspace setup when available. Video generation is awaiting configuration.</p>
  </section>;
}
