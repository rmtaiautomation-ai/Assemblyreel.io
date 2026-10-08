'use client';
import React, { useEffect, useState } from 'react';
import { DOCUMENTARY_TEMPLATES } from '../../../lib/presentations/registry';
import { defaultVisualSettings, type VisualSettings } from '../../../lib/presentations/visual-settings';
import { getPresentationVisualSettings, savePresentationVisualSettings } from '../server/context';
import { SelectField, buttonClass } from './fields';

export function VisualSettingsPanel({ scope, id, onSaved, onRestyle }: { scope: 'workspace' | 'project'; id: string; onSaved?: (settings: VisualSettings) => void; onRestyle?: (settings: VisualSettings, mode: 'selected' | 'unlocked') => Promise<string> }) {
  const [settings, setSettings] = useState(defaultVisualSettings), [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => { let active = true; getPresentationVisualSettings(scope, id).then(result => { if (!active) return; if (result.success) { setSettings(result.settings); setRevision(result.revision); setLoaded(true); } else setMessage(result.error); }); return () => { active = false; }; }, [scope, id]);
  const patch = (value: Partial<VisualSettings>) => { setSettings(previous => ({ ...previous, ...value })); setMessage(''); };
  const save = async () => {
    setBusy(true); setMessage('');
    try { const result = await savePresentationVisualSettings(scope, id, revision, settings); if (result.success) { setSettings(result.settings); setRevision(result.revision); onSaved?.(result.settings); setMessage('Saved. Existing scene presentations are unchanged.'); } else setMessage(result.error); }
    catch { setMessage('The save response was interrupted. Reload to check the saved result before retrying.'); }
    finally { setBusy(false); }
  };
  const restyle = async (mode: 'selected' | 'unlocked') => {
    if (!onRestyle || !window.confirm(`Apply these visual defaults to ${mode === 'selected' ? 'the selected unlocked presentation' : 'all unlocked presentations'}? Copy, image crops, timing and sources are preserved. Each scene is saved separately; conflicts will be reported.`)) return;
    setBusy(true); try { setMessage(await onRestyle(settings, mode)); } catch { setMessage('Restyling stopped. Reload to inspect which scenes were saved.'); } finally { setBusy(false); }
  };
  return <section aria-label={scope === 'workspace' ? 'Channel visuals' : 'Project visuals'} className="space-y-4 rounded-xl border border-ed-border bg-ed-surface p-5 text-ed-text">
    <div><h2 className="text-lg font-bold">{scope === 'workspace' ? 'Channel Visuals' : 'Project Visuals'}</h2><p className="mt-1 text-xs text-ed-text-dim">{scope === 'workspace' ? 'Defaults are frozen into newly created videos. Videos already in production retain their snapshot.' : 'Override defaults for new presentation drafts in this video. Saving defaults never restyles existing scenes.'}</p></div>
    <fieldset disabled={!loaded || busy} className="grid gap-4 sm:grid-cols-2"><SelectField label="Default theme" value={settings.themeId} options={['dark-documentary', 'parchment-archive']} onChange={themeId => patch({ themeId })} /><SelectField label="Default motion" value={settings.motionIntensity} options={['calm', 'standard', 'expressive']} onChange={motionIntensity => patch({ motionIntensity })} /><SelectField label="Default background" value={settings.background} options={['plain', 'grid', 'paper', 'halo']} onChange={background => patch({ background })} /><SelectField label="Default density" value={settings.density} options={['spacious', 'compact']} onChange={density => patch({ density })} /><SelectField label="Date-label convention" value={settings.dateConvention} options={['BCE/CE', 'BC/AD']} onChange={dateConvention => patch({ dateConvention })} /><SelectField label="AI pacing preference" value={settings.cleanPreference} options={['balanced', 'clean-first', 'graphics-rich']} onChange={cleanPreference => patch({ cleanPreference })} />
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={Boolean(settings.accent)} onChange={e => patch({ accent: e.target.checked ? '#D4A15B' : undefined })} />Custom accent{settings.accent && <input aria-label="Default accent" type="color" value={settings.accent} onChange={e => patch({ accent: e.target.value })} />}</label>
      <div className="space-y-2 sm:col-span-2"><h3 className="text-sm font-semibold">Families offered in the library</h3><p className="text-xs text-ed-text-dim">Hiding a family does not remove saved scenes. Existing presentations remain editable. Saved channel/video selections are not expanded automatically. D15–D24 are advanced opt-in families: enable only the sourced datasets and prepared assets your channel can provide. Use Project Visuals to opt in for an existing video.</p><div className="grid gap-2 sm:grid-cols-2">{DOCUMENTARY_TEMPLATES.map(template => <label key={template.id} className="flex gap-2 text-xs"><input type="checkbox" checked={settings.allowedFamilies.includes(template.id)} onChange={e => patch({ allowedFamilies: e.target.checked ? [...settings.allowedFamilies, template.id] : settings.allowedFamilies.filter(id => id !== template.id) })} />{template.code} · {template.name}</label>)}</div></div>
    </fieldset>
    <p className="text-xs text-ed-text-dim">Theme pack v2 · serif headlines, readable body text and source credits · no generation calls. Date convention only offers labels for newly entered numeric dates; it never rewrites supplied dates. AI preference guides reviewed suggestions; it never restyles saved scenes or enforces a graphics quota.</p>
    <div className="flex flex-wrap gap-2"><button type="button" className={`${buttonClass} bg-ed-accent text-ed-base`} disabled={!loaded || busy} onClick={save}>{busy ? 'Working…' : 'Save visual defaults'}</button>{onRestyle && <><button type="button" className={buttonClass} disabled={!loaded || busy} onClick={() => restyle('selected')}>Apply to selected unlocked scene</button><button type="button" className={buttonClass} disabled={!loaded || busy} onClick={() => restyle('unlocked')}>Apply to all unlocked presentations</button></>}</div>
    {message && <p role="status" className="text-xs text-ed-warn">{message}</p>}
  </section>;
}
