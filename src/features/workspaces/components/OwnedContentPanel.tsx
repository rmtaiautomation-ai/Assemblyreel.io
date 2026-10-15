"use client";
import Link from "next/link";
import { useEffect,useState,useRef } from "react";
import { ownedJson,prepareOwnedSave,sendOwnedSave,shouldRetryOwnedSave,ownedErrorMessage,type OwnedSave } from "../owned-content-client";
type Workspace={id:string;name:string;content_theme:string};
type Project={id:string;topic:string};
export function OwnedContentPanel({mediaEnabled}:{mediaEnabled:boolean}) {
  const [workspaces,setWorkspaces]=useState<Workspace[]>([]),[projects,setProjects]=useState<Project[]>([]);
  const [selected,setSelected]=useState(""),[message,setMessage]=useState(""),[pending,setPending]=useState(false);
  const [workspaceId,setWorkspaceId]=useState("");
  const [retry,setRetry]=useState<OwnedSave|null>(null);
  const busy=useRef(false);
  const uploadOperation=useRef<{fingerprint:string;id:string}|null>(null);
  const [playback,setPlayback]=useState("");
  async function load() {
    const result=await ownedJson<{workspaces:Workspace[]}>("/api/account/workspaces");
    setWorkspaces(result.workspaces);
  }
  async function loadProjects(id:string) {
    const result=await ownedJson<{projects:Project[]}>(`/api/account/projects?workspaceId=${id}`);
    setProjects(result.projects);
  }
  useEffect(()=>{
    const controller=new AbortController();
    ownedJson<{workspaces:Workspace[]}>("/api/account/workspaces",{signal:controller.signal})
      .then(result=>{if(!controller.signal.aborted)setWorkspaces(result.workspaces);})
      .catch(error=>{if(!controller.signal.aborted)setMessage(ownedErrorMessage(error));});
    return ()=>controller.abort();
  },[]);
  async function run(work:()=>Promise<void>) {
    if(busy.current)return;
    busy.current=true;setPending(true);setMessage("");
    try {await work();}catch(error){setMessage(ownedErrorMessage(error));}
    finally {busy.current=false;setPending(false);}
  }
  async function save(attempt:OwnedSave) {
    await run(async()=>{
      let result;
      try {result=await sendOwnedSave(attempt);setRetry(null);}
      catch(error){setRetry(shouldRetryOwnedSave(error)?attempt:null);throw error;}
      const parent=attempt.kind==="workspace"?result.id:attempt.workspaceId!;
      setWorkspaceId(parent);setProjects([]);setSelected(attempt.kind==="project"?result.id:"");setPlayback("");
      try {await load();await loadProjects(parent);setMessage(attempt.kind==="workspace"?"Workspace created.":"Project created.");}
      catch {setMessage("Saved successfully, but the list could not refresh. Use Refresh saved content.");}
    });
  }
  async function rename(type:"workspace"|"project",id:string,value:string) {
    await run(async()=>{
      await ownedJson("/api/account/resources",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({type,id,value})});
      try {await load();await loadProjects(workspaceId);setMessage("Name updated.");}
      catch {setMessage("Name updated, but the list could not refresh. Use Refresh saved content.");}
    });
  }
  const locked=pending||Boolean(retry);
  const workspace=workspaces.find(item=>item.id===workspaceId);
  const project=projects.find(item=>item.id===selected);
  const inputClass="block w-full p-2 bg-[#0A0B0D] border border-[#353B44] rounded";
  return <section className="space-y-4 border-t border-[#353B44] pt-5"><h2 className="font-semibold">Your workspaces</h2>
    <form className="space-y-2" onSubmit={event=>{
      event.preventDefault();if(locked||busy.current)return;
      const form=new FormData(event.currentTarget);
      void save(prepareOwnedSave("workspace",{name:String(form.get("name")).trim(),content_theme:String(form.get("theme")).trim()}));
    }}><fieldset disabled={locked} className="space-y-2">
      <label className="text-sm block">Workspace name<input name="name" required maxLength={100} className={inputClass} /></label>
      <label className="text-sm block">Content theme<input name="theme" required maxLength={200} className={inputClass} /></label>
      <button className="mkt-btn-secondary px-3 py-2">Create workspace</button></fieldset></form>
    {retry && <div className="space-y-2"><p className="text-sm">Your original save details are kept for this retry. Keep this page open until the save is confirmed.</p>
      <button disabled={pending} className="mkt-btn-secondary px-3 py-2" onClick={()=>void save(retry)}>Retry save</button></div>}
    <button disabled={pending} className="text-sm text-[#13EF93]" onClick={()=>void run(async()=>{await load();if(workspaceId)await loadProjects(workspaceId);setMessage("Saved content refreshed.");})}>Refresh saved content</button>
    {workspaces.length===0 && <p className="text-sm">No workspaces loaded. Create one or refresh the list.</p>}
    <ul className="text-sm space-y-2">{workspaces.map(item=><li key={item.id}><button disabled={locked} aria-pressed={workspaceId===item.id} className="text-[#13EF93]" onClick={()=>void run(async()=>{
      setWorkspaceId(item.id);setSelected("");setProjects([]);setPlayback("");await loadProjects(item.id);
    })}>{item.name}</button></li>)}</ul>
    {workspace && <>
      <p className="text-sm">Selected workspace: <strong>{workspace.name}</strong></p>
      <form key={`workspace-${workspace.id}-${workspace.name}`} onSubmit={event=>{
        event.preventDefault();if(locked)return;const form=new FormData(event.currentTarget);void rename("workspace",workspace.id,String(form.get("value")).trim());
      }}><fieldset disabled={locked} className="space-y-2"><label className="text-sm block">New workspace name<input name="value" required maxLength={100} defaultValue={workspace.name} className={inputClass} /></label><button className="mkt-btn-secondary px-3 py-2">Rename workspace</button></fieldset></form>
      <form onSubmit={event=>{
        event.preventDefault();if(locked||busy.current)return;const form=new FormData(event.currentTarget);
        void save(prepareOwnedSave("project",{workspace_id:workspace.id,topic:String(form.get("topic")).trim()}));
      }}><fieldset disabled={locked} className="space-y-2"><label className="text-sm block">Project topic<input name="topic" required maxLength={200} className={inputClass} /></label><button className="mkt-btn-secondary px-3 py-2">Create project</button></fieldset></form>
      {projects.length===0 && <p className="text-sm">No projects loaded for this workspace.</p>}
    </>}
    {projects.length>0 && <label className="text-sm block">Existing project<select disabled={locked} className="block bg-[#0A0B0D] p-2 w-full" value={selected} onChange={event=>{setSelected(event.target.value);setPlayback("");}}><option value="">Choose a project</option>{projects.map(project=><option key={project.id} value={project.id}>{project.topic}</option>)}</select></label>}
    {project && <form key={`project-${project.id}-${project.topic}`} onSubmit={event=>{
      event.preventDefault();if(locked)return;const form=new FormData(event.currentTarget);void rename("project",project.id,String(form.get("value")).trim());
    }}><fieldset disabled={locked} className="space-y-2"><label className="text-sm block">New project topic<input name="value" required maxLength={200} defaultValue={project.topic} className={inputClass} /></label><button className="mkt-btn-secondary px-3 py-2">Rename project</button></fieldset></form>}
    {mediaEnabled && selected && <label className="text-sm block">Upload media (up to 3 MiB)<input disabled={locked} type="file" accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/wav,video/mp4" onChange={async event=>{
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
    <p className="text-xs text-[#B5BCC6]">Manual project drafts are available here. Video generation is awaiting configuration.</p>
  </section>;
}
