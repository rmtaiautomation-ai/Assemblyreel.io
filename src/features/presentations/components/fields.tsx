'use client';
import React from 'react';
import type { PresentationAsset, PresentationImage } from '../../../lib/presentations/schema';
import type { Source } from '../../../lib/presentations/families';
export const fieldClass = 'w-full rounded-md border border-ed-border bg-ed-well p-2 text-xs text-ed-text focus:outline-none focus:border-ed-accent-border';
export const buttonClass = 'rounded-md border border-ed-border px-3 py-2 text-xs font-semibold hover:bg-ed-raised disabled:opacity-40 disabled:cursor-not-allowed';
export function TextField({ label, value, onChange, max = 100, multiline = false }: { label: string; value: string; onChange: (value: string) => void; max?: number; multiline?: boolean }) {
  return <label className="block text-xs">{label}{multiline ? <textarea aria-label={label} className={`${fieldClass} mt-1 min-h-24`} maxLength={max} value={value} onChange={event => onChange(event.target.value)} /> : <input aria-label={label} className={`${fieldClass} mt-1`} maxLength={max} value={value} onChange={event => onChange(event.target.value)} />}</label>;
}
export function NumberField({ label, value, onChange, min, max, step = .1 }: { label: string; value: number | null; onChange: (value: number | null) => void; min?: number; max?: number; step?: number }) {
  return <label className="block text-xs">{label}<input aria-label={label} className={`${fieldClass} mt-1`} type="number" min={min} max={max} step={step} value={value ?? ''} onChange={event => onChange(event.target.value === '' ? null : Number(event.target.value))} /></label>;
}
export function SelectField<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (value: T) => void }) {
  return <label className="block text-xs">{label}<select aria-label={label} className={`${fieldClass} mt-1`} value={value} onChange={event => onChange(event.target.value as T)}>{options.map(option => <option key={option} value={option}>{option}</option>)}</select></label>;
}
export function SourceEditor({ source, onChange }: { source: Source; onChange: (source: Source) => void }) {
  return <div className="space-y-2"><TextField label="Credit" max={90} value={source.credit} onChange={credit => onChange({ ...source, credit })} /><TextField label="Source link" max={1000} value={source.url} onChange={url => onChange({ ...source, url })} /><SelectField label="Source type" value={source.classification} options={['unknown', 'historical', 'illustration', 'reconstruction']} onChange={classification => onChange({ ...source, classification })} /></div>;
}
export function ImageEditor({ image, label, assets, onChange, geometry = true }: { image: PresentationImage; label: string; assets: PresentationAsset[]; onChange: (patch: Partial<PresentationImage>) => void; geometry?: boolean }) {
  return <div className="space-y-2 rounded-lg border border-ed-border p-3"><label className="block text-xs">{label}<select aria-label={label} className={`${fieldClass} mt-1`} value={image.asset.mediaId} onChange={event => onChange({ asset: { kind: 'media', mediaId: event.target.value } })}><option value="">Choose a ready project image</option>{assets.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
    <TextField label={`${label} label`} max={60} value={image.label} onChange={value => onChange({ label: value })} />{geometry && <SelectField label="Image fit" value={image.fit} options={['cover', 'contain']} onChange={fit => onChange({ fit })} />}
    {geometry && (['x', 'y'] as const).map(axis => <label key={axis} className="block text-xs">{axis === 'x' ? 'Horizontal' : 'Vertical'} focal point<input type="range" min={0} max={1} step={.01} value={image.focalPoint[axis]} className="mt-1 w-full" onChange={event => onChange({ focalPoint: { ...image.focalPoint, [axis]: Number(event.target.value) } })} /></label>)}
  </div>;
}
