"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { ownedJson, ownedErrorMessage, prepareOwnedSave, sendOwnedSave, shouldRetryOwnedSave, type OwnedSave } from "../owned-content-client";

type Project = { id: string; topic: string; status?: string | null };
const control = "mt-2 block w-full rounded-lg border border-[#353B44] bg-[#0A0B0D] p-3";
export function WorkspaceProjects({ workspace, initialProjects }: { workspace: { id: string; name: string; content_theme: string }; initialProjects: Project[] }) {
  const [name, setName] = useState(workspace.name);
  const [projects, setProjects] = useState(initialProjects);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState<OwnedSave | null>(null);
  const busy = useRef(false);
  async function run(work: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true; setPending(true); setMessage("");
    try { await work(); } catch (error) { setMessage(ownedErrorMessage(error)); }
    finally { busy.current = false; setPending(false); }
  }
  async function refresh() {
    const [details, list] = await Promise.all([
      ownedJson<{ workspace: { name: string } }>(`/api/account/workspaces/${workspace.id}`),
      ownedJson<{ projects: Project[] }>(`/api/account/projects?workspaceId=${workspace.id}`),
    ]);
    setName(details.workspace.name); setProjects(list.projects);
  }
  async function save(attempt: OwnedSave) {
    await run(async () => {
      try { await sendOwnedSave(attempt); setRetry(null); }
      catch (error) { setRetry(shouldRetryOwnedSave(error) ? attempt : null); throw error; }
      try { await refresh(); setMessage("Project created."); }
      catch { setMessage("Project saved. Refresh projects to reload the list."); }
    });
  }
  async function rename(type: "workspace" | "project", id: string, value: string) {
    await run(async () => {
      await ownedJson("/api/account/resources", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, id, value }) });
      try { await refresh(); setMessage("Name updated."); }
      catch { setMessage("Name saved. Refresh projects to reload the list."); }
    });
  }
  const locked = pending || Boolean(retry);
  return <div className="space-y-8">
    <section className="rounded-xl border border-[#353B44] bg-[#15181C] p-6">
      <h2 className="text-xl font-semibold break-words">{name}</h2><p className="mt-2 text-[#B5BCC6] break-words">{workspace.content_theme}</p>
      <details className="mt-5"><summary className="cursor-pointer text-sm text-[#13EF93]">Rename workspace</summary>
        <form key={name} className="mt-4 max-w-lg" onSubmit={event => { event.preventDefault(); if (locked) return; const form = new FormData(event.currentTarget); void rename("workspace", workspace.id, String(form.get("name")).trim()); }}>
          <fieldset disabled={locked}><label className="text-sm">Workspace name<input name="name" required maxLength={100} defaultValue={name} className={control} /></label><button className="mt-3 rounded-lg border border-[#353B44] px-4 py-2">Save name</button></fieldset>
        </form>
      </details>
    </section>
    <section className="rounded-xl border border-[#353B44] bg-[#15181C] p-6"><h2 className="text-xl font-semibold">Start a project</h2>
      <form className="mt-4 max-w-2xl" onSubmit={event => { event.preventDefault(); if (locked || busy.current) return; const form = new FormData(event.currentTarget); void save(prepareOwnedSave("project", { workspace_id: workspace.id, topic: String(form.get("topic")).trim() })); }}>
        <fieldset disabled={locked}><label>Project topic<input name="topic" required maxLength={200} placeholder="What will your next video explore?" className={control} /></label><button className="mt-4 rounded-lg bg-[#13EF93] px-5 py-3 font-semibold text-black">{pending ? "Saving…" : "Create draft project"}</button></fieldset>
      </form>
      {retry && <div className="mt-4"><p className="text-sm">Keep this page open and retry the original save.</p><button disabled={pending} onClick={() => void save(retry)} className="mt-3 rounded-lg border border-[#353B44] px-4 py-2">Retry save</button></div>}
      <p className="mt-4 text-sm text-[#B5BCC6]">Save and organize draft topics. Video generation and the full editor will open separately.</p>
    </section>
    <section><div className="mb-5 flex items-center justify-between gap-4"><h2 className="text-xl font-semibold">Your projects</h2><button disabled={pending} className="text-sm text-[#13EF93]" onClick={() => void run(async () => { await refresh(); setMessage("Projects refreshed."); })}>Refresh projects</button></div>
      {projects.length === 0 && <p className="text-[#B5BCC6]">No projects yet. Create your first draft above.</p>}
      <div className="grid gap-5 sm:grid-cols-2">{projects.map(project => <article key={project.id} className="rounded-xl border border-[#353B44] bg-[#15181C] p-6">
        <h3 className="text-lg font-semibold break-words">{project.topic}</h3><p className="mt-2 text-xs text-[#B5BCC6]">Draft project</p><Link href={`/account/projects/${project.id}`} className="mt-5 block text-[#13EF93]">Open project →</Link>
        <details className="mt-4"><summary className="cursor-pointer text-sm text-[#B5BCC6]">Rename project</summary><form key={project.topic} className="mt-3" onSubmit={event => { event.preventDefault(); if (locked) return; const form = new FormData(event.currentTarget); void rename("project", project.id, String(form.get("topic")).trim()); }}><fieldset disabled={locked}><label className="text-sm">Project topic<input name="topic" required maxLength={200} defaultValue={project.topic} className={control} /></label><button className="mt-3 rounded-lg border border-[#353B44] px-4 py-2">Save topic</button></fieldset></form></details>
      </article>)}</div>
    </section>
    <p role="status" className="text-sm text-amber-200">{message}</p>
  </div>;
}
