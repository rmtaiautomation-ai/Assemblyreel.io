import React from 'react';
import { PHASE_5_FAMILIES, type PresentationTemplateId } from '../../../lib/presentations/registry';
import { Phase5Poster } from './Phase5Poster';
/** Static schematic posters, not historical sample content or a grid of live Players. */
export function TemplatePoster({ id }: { id: PresentationTemplateId }) {
  if (PHASE_5_FAMILIES.some(family => family === id)) return <Phase5Poster id={id} />;
  const ink='#F2ECDD',gold='#D4A15B',surface='#24211D';
  const box=(x:number,y:number,w:number,h:number)=><rect x={x} y={y} width={w} height={h} rx="2" fill={surface} stroke={gold} strokeWidth="1.5" />;
  const lines=(x:number,y:number,w:number)=><g stroke={ink} strokeWidth="2"><path d={`M${x} ${y}h${w}M${x} ${y+7}h${w*.8}M${x} ${y+14}h${w*.6}`} /></g>;
  return <svg aria-hidden="true" viewBox="0 0 160 90" className="mb-2 h-16 w-full rounded bg-[#171717] transition-transform motion-safe:group-focus-visible:scale-[1.03]">
    {id==='cause-effect' ? <>{[12,63,114].map(x=><g key={x}>{box(x,25,34,35)}{lines(x+6,36,22)}</g>)}<path d="M48 43h12m-5-4l5 4-5 4M99 43h12m-5-4l5 4-5 4" fill="none" stroke={gold}/></> :
      id==='scale-comparison' ? <><path d="M18 68h124" stroke={gold}/><rect x="30" y="36" width="22" height="32" fill={gold}/><rect x="70" y="20" width="22" height="48" fill={gold}/><rect x="110" y="44" width="22" height="24" fill={gold}/></> :
      id==='fact-reveal' ? <><text x="80" y="47" fill={gold} fontSize="35" textAnchor="middle">#</text>{lines(40,64,80)}</> :
      id==='claim-evidence' ? <>{box(15,12,130,20)}{lines(27,20,105)}{box(15,39,76,37)}{lines(24,48,58)}{lines(101,48,43)}<path d="M101 70h40" stroke={gold}/></> :
      id==='historical-timeline'?<><path d="M15 44H145" stroke={gold} />{[30,80,130].map(x=><g key={x}><circle cx={x} cy="44" r="3" fill={gold} />{box(x-15,18,30,15)}{lines(x-14,61,28)}</g>)}</>:
      id==='person-introduction'?<>{box(12,12,48,66)}<circle cx="36" cy="31" r="10" fill={gold}/><path d="M20 66Q20 44 36 44Q52 44 52 66Z" fill={gold}/>{lines(76,35,70)}<path d="M76 23h40" stroke={gold}/></>:
      id==='image-comparison'?<>{box(12,17,60,44)}{box(88,17,60,44)}<path d="M20 51l16-18 14 13 15-7M96 51l17-19 12 15 16-9" stroke={ink} fill="none"/>{lines(20,72,44)}{lines(96,72,44)}</>:
      id==='archival-explainer'?<><rect x="20" y="12" width="120" height="67" fill={ink}/><path d="M33 27h85M33 38h55" stroke="#201B15" strokeWidth="3"/><rect x="32" y="49" width="75" height="9" fill={gold}/><path d="M33 54h87M33 64h72" stroke="#201B15" strokeWidth="2"/></>:
      id==='map-locator'?<><path d="M35 15l35 8 23-9 32 18-13 25-23 2-7 20-25-18-12-24Z" fill={surface} stroke={gold}/><circle cx="85" cy="40" r="5" fill={gold}/><circle cx="85" cy="40" r="12" fill="none" stroke={gold}/>{lines(105,62,35)}</>:
      id==='artifact-spotlight'?<>{box(10,12,77,66)}<path d="M42 23h18l8 34-17 9-16-9Z" fill={gold}/>{lines(100,28,46)}{lines(100,56,40)}</>:
      id==='detail-annotation'||id==='manuscript-highlight'?<>{box(12,12,48,66)}{lines(22,26,28)}{lines(22,50,28)}<rect x="27" y="34" width="24" height="17" fill="none" stroke={gold} strokeWidth="2"/><path d="M51 42H83" stroke={gold}/>{box(83,18,65,51)}{lines(94,34,42)}</>:
      id==='text-translation'?<>{box(20,12,120,28)}{lines(35,24,88)}<path d="M80 45v9m-5-5l5 5 5-5" stroke={gold} fill="none"/>{box(20,59,120,22)}<path d="M34 70h90" stroke={ink} strokeWidth="2"/></>:
      <><path d="M80 25L35 63M80 25l45 38" stroke={gold}/>{box(57,12,46,23)}{box(12,56,46,23)}{box(102,56,46,23)}</>}
  </svg>;
}
