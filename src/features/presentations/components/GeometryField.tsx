'use client';
import React, { useEffect, useRef, useState } from 'react';
import type { z } from 'zod';
import { fieldClass } from './fields';

/** Invalid import text stays visible, while an invalid sentinel blocks preview/Apply. */
export function GeometryField<T>({ label, value, schema, invalid, onChange }: { label: string; value: T; schema: z.ZodType<T>; invalid: T; onChange: (value: T) => void }) {
  const serialized = JSON.stringify(value), last = useRef(serialized);
  const [text, setText] = useState(serialized), [error, setError] = useState('');
  useEffect(() => { if (serialized !== last.current) { last.current = serialized; setText(serialized); setError(''); } }, [serialized]);
  return <label className="block text-xs">{label}<textarea aria-label={label} className={`${fieldClass} mt-1 min-h-28 font-mono`} value={text} maxLength={24000} onChange={event => {
    const next = event.target.value; setText(next);
    try { const parsed = schema.safeParse(JSON.parse(next)); if (!parsed.success) throw Error(parsed.error.issues[0]?.message ?? 'Invalid geometry'); last.current = JSON.stringify(parsed.data); setError(''); onChange(parsed.data); }
    catch { last.current = JSON.stringify(invalid); setError('Invalid geometry: supply the bounded coordinate arrays shown above. Preview and Apply are blocked until repaired.'); onChange(invalid); }
  }} />{error && <span role="alert" className="mt-1 block text-ed-warn">{error}</span>}</label>;
}
