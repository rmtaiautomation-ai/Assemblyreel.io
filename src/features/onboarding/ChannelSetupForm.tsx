"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ART_STYLES, ASPECT_RATIOS, DURATIONS, LANGUAGES, NICHES } from "@/lib/workspace-options";
import { ownedErrorMessage, prepareOwnedSave, sendOwnedSave, shouldRetryOwnedSave, type OwnedSave } from "@/features/workspaces/owned-content-client";

const inputClass = "mt-2 block w-full rounded-lg border border-[#353B44] bg-[#0A0B0D] p-3";
export function ChannelSetupForm() {
  const router = useRouter();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState<OwnedSave | null>(null);
  const [message, setMessage] = useState("");
  async function save(attempt: OwnedSave) {
    if (busy.current) return;
    busy.current = true; setPending(true); setMessage("");
    try {
      const result = await sendOwnedSave(attempt);
      setRetry(null); router.replace(`/dashboard/${result.id}`);
    } catch (error) {
      setRetry(shouldRetryOwnedSave(error) ? attempt : null); setMessage(ownedErrorMessage(error));
    } finally { busy.current = false; setPending(false); }
  }
  return <form className="max-w-3xl space-y-6 rounded-xl border border-[#353B44] bg-[#15181C] p-6 sm:p-8" onSubmit={event => {
    event.preventDefault(); if (busy.current || retry) return;
    const form = new FormData(event.currentTarget);
    const fields = Object.fromEntries(["name", "content_theme", "visual_aesthetic", "aspect_ratio", "video_language", "duration_pref"].map(key => [key, String(form.get(key) ?? "").trim()]));
    void save(prepareOwnedSave("workspace", fields));
  }}>
    <p className="text-[#B5BCC6]">Give your channel a name, choose its niche and set your creative preferences.</p>
    <fieldset disabled={pending || Boolean(retry)} className="space-y-6">
      <label className="block font-medium">Workspace name<input name="name" required maxLength={100} autoComplete="off" placeholder="My history channel" className={inputClass} /></label>
      <label className="block font-medium">Niche or channel theme<input name="content_theme" required list="workspace-niches" maxLength={200} placeholder="Choose a suggestion or enter your own niche" className={inputClass} /></label>
      <datalist id="workspace-niches">{NICHES.map(niche => <option key={niche.title} value={niche.title} />)}</datalist>
      <div className="grid gap-6 sm:grid-cols-2">{([
        ["visual_aesthetic", "Visual style", ART_STYLES, "Cinematic"],
        ["aspect_ratio", "Aspect ratio", ASPECT_RATIOS, "Horizontal 16:9"],
        ["video_language", "Language", LANGUAGES, "English"],
        ["duration_pref", "Preferred duration", DURATIONS, "60-90s"],
      ] as const).map(([name, label, options, initial]) => <label key={name} className="block text-sm">{label}<select name={name} defaultValue={initial} className={inputClass}>{options.map(option => <option key={option}>{option}</option>)}</select></label>)}</div>
      <button className="rounded-lg bg-[#13EF93] px-5 py-3 font-semibold text-black">{pending ? "Creating…" : "Create workspace"}</button>
    </fieldset>
    {retry && <div className="space-y-3"><p className="text-sm">Keep this page open. Retry uses your original details and won’t create a duplicate workspace.</p><button type="button" disabled={pending} onClick={() => void save(retry)} className="rounded-lg border border-[#353B44] px-5 py-3">Retry save</button></div>}
    {message && <p role="status" className="text-sm text-amber-200">{message}</p>}
    <p className="text-sm text-[#B5BCC6]">These preferences are saved for your channel. Video generation and billing are not available yet.</p>
    <Link href="/dashboard" className="block text-sm text-[#13EF93]">Back to workspaces</Link>
  </form>;
}
