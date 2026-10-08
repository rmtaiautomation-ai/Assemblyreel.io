import React from 'react';

export function SceneClipLabel({ number, width, icon, hasMedia = false, pending = false }: {
  number: number; width: number; icon: React.ReactNode; hasMedia?: boolean; pending?: boolean;
}) {
  const label = 'S' + number;
  // Reserve the clip's padding and badge inset before displaying text or an icon.
  const labelFits = width >= label.length * 6 + 24;
  const iconFits = width >= label.length * 6 + 42;
  return <div aria-hidden="true" className={`absolute inset-x-0 top-1.5 z-10 pointer-events-none overflow-hidden ${labelFits ? 'px-1.5' : ''}` }>
    {labelFits ? <span className={`inline-flex max-w-full items-center gap-1 text-[9px] font-bold font-mono rounded-sm ${hasMedia ? 'text-white bg-ed-media/70 px-1 py-0.5' : ''}`}>
      {iconFits && icon}<span className="truncate">{label}</span>
      {pending && iconFits && <span className="text-ed-warn" title="Media preview">•</span>}
    </span> : <span className={`block h-1 rounded-full mt-1 mx-auto ${hasMedia ? 'bg-white' : 'bg-current'}`} style={{ width: Math.min(4, Math.max(1, width - 2)) }} />}
  </div>;
}
