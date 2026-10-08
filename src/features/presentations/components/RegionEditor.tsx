'use client';
import React, { useRef, useState } from 'react';
import type { FocusRegion } from '../../../lib/presentations/families';
import { TextField, NumberField } from './fields';

export function RegionEditor({ region, url, onChange }: { region: FocusRegion; url?: string; onChange: (region: FocusRegion) => void }) {
  const [aspect, setAspect] = useState(1);
  const start = useRef<{ x: number; y: number } | undefined>(undefined);
  const point = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const width = Math.min(box.width, box.height * aspect), height = width / aspect;
    return { x: Math.max(0, Math.min(1, (event.clientX - box.left - (box.width - width) / 2) / width)), y: Math.max(0, Math.min(1, (event.clientY - box.top - (box.height - height) / 2) / height)) };
  };
  return <div className="space-y-2 rounded-lg border border-ed-border p-3">
    <TextField label="Detail label" max={50} value={region.label} onChange={label => onChange({ ...region, label })} />
    {url && <><div className="relative"><img src={url} alt="Source image for region selection" className="hidden" onLoad={event => setAspect(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)} />
      <svg aria-label="Drag a source detail region" viewBox={`0 0 1000 ${1000 / aspect}`} preserveAspectRatio="xMidYMid meet" className="h-56 w-full touch-none bg-black" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); start.current = point(event); }} onPointerMove={event => { if (!start.current) return; const end = point(event), first = start.current; onChange({ ...region, x: Math.min(first.x, end.x), y: Math.min(first.y, end.y), width: Math.max(.005, Math.abs(first.x - end.x)), height: Math.max(.005, Math.abs(first.y - end.y)) }); }} onPointerUp={() => { start.current = undefined; }} onPointerCancel={() => { start.current = undefined; }}><image href={url} width={1000} height={1000 / aspect} /><rect x={region.x * 1000} y={region.y * 1000 / aspect} width={region.width * 1000} height={region.height * 1000 / aspect} fill="#d4a15b33" stroke="#d4a15b" strokeWidth="8" /></svg></div><p className="text-[11px] text-ed-text-dim">Drag to select, or use the numeric controls below. Coordinates are relative to the original—not a cropped preview.</p></>}
    <div className="grid grid-cols-2 gap-2">{(['x', 'y', 'width', 'height'] as const).map(key => <NumberField key={key} label={`Region ${key}`} value={region[key]} min={key === 'width' || key === 'height' ? .005 : 0} max={1} step={.005} onChange={value => onChange({ ...region, [key]: value ?? 0 })} />)}</div>
    <NumberField label="Detail reveal (seconds)" value={region.cueSeconds} min={0} onChange={value => onChange({ ...region, cueSeconds: value ?? 0 })} />
  </div>;
}
