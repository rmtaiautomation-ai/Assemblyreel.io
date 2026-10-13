"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ART_STYLES, ASPECT_RATIOS, DURATIONS, LANGUAGES, NICHES } from "@/lib/workspace-options";
import { initialSettings, type SetupSettings, type SetupState } from "./schema";

type Workspace = { id: string; name: string; content_theme: string };
const control = "block w-full rounded border border-[#353B44] bg-[#0A0B0D] p-2 mt-1";
export function SetupForm({ initial, workspaces }: { initial: SetupState | null; workspaces: Workspace[] }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [settings, setSettings] = useState<SetupSettings>(initial?.settings ?? initialSettings);
  const [step, setStep] = useState(initial ? 2 : 1);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  function change(key: keyof SetupSettings, value: string | null) {
    setSettings(previous => ({ ...previous, [key]: value })); setMessage("");
  }
  async function submit(complete: boolean) {
    if (inFlight.current) return;
    inFlight.current = true; setPending(true); setMessage("");
    try {
      // Always persist current choices before completion. Retrying the same revision/data is safe.
      let state = saved;
      const unchanged = state && Object.entries(settings).every(([key, value]) => state?.settings[key as keyof SetupSettings] === value);
      if (!complete || !unchanged) {
        const response = await fetch("/api/account/onboarding", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "save", revision: state?.revision ?? 0, settings }),
        });
        const result = await response.json();
        if (!response.ok) { setMessage(result.error ?? "Unable to save. Try again."); return; }
        state = result.state as SetupState; setSaved(state);
      }
      if (!complete) { setStep(2); setMessage("Settings saved. You can leave and resume later."); return; }
      if (!state) return;
      const finished = await fetch("/api/account/onboarding", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", revision: state.revision }),
      });
      const outcome = await finished.json();
      if (!finished.ok) { setMessage(outcome.error ?? "Unable to finish. Your settings are saved."); return; }
      router.push(`/account/projects/${outcome.state.project_id}`);
    } catch { setMessage("The save result could not be confirmed. Reload to check saved progress, or retry with the same details."); }
    finally { inFlight.current = false; setPending(false); }
  }
  return <form className="space-y-4" onSubmit={event => { event.preventDefault(); void submit(step === 2); }}>
    <p className="text-sm">Step {step} of 2 · {saved ? "Saved progress available" : "New setup"}</p>
    <fieldset disabled={pending} className="space-y-4">
      {step === 1 ? <>
        <label className="block">Workspace<select className={control} value={settings.workspaceId ?? ""} onChange={event => {
          const workspace = workspaces.find(item => item.id === event.target.value);
          setSettings(previous => ({ ...previous, workspaceId: workspace?.id ?? null,
            name: workspace?.name ?? "", content_theme: workspace?.content_theme ?? "" }));
        }}><option value="">Create a new workspace</option>{workspaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {!settings.workspaceId ? <>
          <label className="block">Workspace name<input required maxLength={100} className={control} value={settings.name} onChange={event => change("name", event.target.value)} /></label>
          <label className="block">Channel theme<input required list="channel-themes" maxLength={200} className={control} value={settings.content_theme} onChange={event => change("content_theme", event.target.value)} /></label>
          <datalist id="channel-themes">{NICHES.map(item => <option key={item.title} value={item.title} />)}</datalist>
          {([
            ["visual_aesthetic", "Visual style", ART_STYLES], ["aspect_ratio", "Aspect ratio", ASPECT_RATIOS],
            ["video_language", "Language", LANGUAGES], ["duration_pref", "Duration", DURATIONS],
          ] as const).map(([key, label, options]) => <label className="block" key={key}>{label}<select className={control} value={settings[key]} onChange={event => change(key, event.target.value)}>{options.map(option => <option key={option}>{option}</option>)}</select></label>)}
        </> : <p className="text-sm">The workspace keeps its existing channel settings.</p>}
        <p className="text-sm text-[#B5BCC6]">Hosted narration is unavailable during setup. Choose a voice when generation becomes available.</p>
      </> : <>
        <p>Workspace: <strong>{settings.name}</strong></p>
        <label className="block">First project topic<input required maxLength={200} className={control} value={settings.topic} onChange={event => change("topic", event.target.value)} /></label>
        <p className="text-sm text-[#B5BCC6]">This saves a draft topic only. Scripts, narration, images, rendering, and billing are unavailable.</p>
        <button type="button" className="text-[#13EF93]" onClick={() => setStep(1)}>Back to workspace settings</button>
        <button type="button" className="block text-[#13EF93]" onClick={() => void submit(false)}>Save topic and continue later</button>
      </>}
      <button className="mkt-btn-secondary px-3 py-2" type="submit">{pending ? "Saving…" : step === 1 ? "Save and continue" : "Create my draft project"}</button>
    </fieldset>
    {message && <p role="status" className="text-sm text-amber-200">{message}</p>}
    <Link href="/account?overview=1" className="block text-sm text-[#13EF93]">Leave setup and open account</Link>
  </form>;
}
