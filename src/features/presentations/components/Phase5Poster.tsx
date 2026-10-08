import React from 'react';
import type { PresentationTemplateId } from '../../../lib/presentations/registry';

/** Abstract layout previews; never presented as archaeological or geographic evidence. */
export function Phase5Poster({ id }: { id: PresentationTemplateId }) {
  const gold = '#D4A15B', ink = '#F2ECDD', surface = '#24211D';
  const box = (x: number, y: number, width: number, height: number) => <rect x={x} y={y} width={width} height={height} rx="2" fill={surface} stroke={gold} />;
  return <svg aria-hidden="true" viewBox="0 0 160 90" className="mb-2 h-16 w-full rounded bg-[#171717]">
    {id === 'journey-map' ? <><path d="M15 67Q40 15 78 45T145 20" fill="none" stroke={gold} strokeDasharray="4 3" />{[[15,67],[78,45],[145,20]].map(([x,y],i) => <g key={i}><circle cx={x} cy={y} r="7" fill={gold} /><text x={x} y={y+3} fontSize="9" textAnchor="middle">{i+1}</text></g>)}</> :
      id === 'territory-change' ? <><path d="M15 20l25-6 27 25-13 34-29-6Z" fill={gold} opacity=".5"/><path d="M93 20l25-6 27 25-13 34-29-6Z" fill={gold}/><path d="M70 45h17m-5-5l5 5-5 5" stroke={ink} fill="none" /></> :
      id === 'then-now' ? <>{box(20,13,120,65)}<path d="M20 60l30-24 35 15 30-30 25 39" fill="none" stroke={gold}/><rect x="80" y="13" width="60" height="65" fill={gold} opacity=".25"/><path d="M80 10v71" stroke={ink}/></> :
      id === 'layered-parallax' ? <>{box(20,15,80,50)}{box(39,25,80,50)}{box(58,35,80,45)}<path d="M68 65l17-20 30 20" fill={gold}/></> :
      id === 'structure-cutaway' ? <><path d="M23 68V28l56-16 58 16v40Z" fill={surface} stroke={gold}/><path d="M79 12v56M23 45h114" stroke={gold}/><rect x="82" y="29" width="50" height="13" fill={gold} opacity=".5"/><path d="M84 37h35" stroke={ink}/></> :
      id === 'manuscript-comparison' ? <>{box(10,12,62,65)}{box(88,12,62,65)}<path d="M20 30h42m-42 12h35m-35 12h42m26-24h42m-42 12h42m-42 12h30" stroke={ink}/><path d="M20 42h35m53 12h30" stroke={gold} strokeWidth="6" opacity=".7"/></> :
      id === 'evidence-board' ? <>{box(12,12,45,28)}{box(100,12,45,28)}{box(56,56,45,25)}<path d="M57 25h43M122 40l-43 16" stroke={gold}/><circle cx="79" cy="25" r="4" fill={ink}/></> :
      id === 'animated-chart' ? <><path d="M20 15v55h125" fill="none" stroke={ink}/><rect x="35" y="44" width="20" height="26" fill={gold}/><rect x="69" y="29" width="20" height="41" fill={gold}/><rect x="104" y="18" width="20" height="52" fill={gold}/><path d="M79 22v14m-6-14h12m-12 14h12" stroke={ink}/></> :
      id === 'competing-explanations' ? <>{box(15,12,57,66)}{box(88,12,57,66)}<path d="M25 27h35m-35 17h35m-35 18h25m48-35h35m-35 17h35m-35 18h25" stroke={ink}/><path d="M25 54h35m38 0h35" stroke={gold}/></> :
      <>{[[15,13],[88,13],[15,49],[88,49]].map(([x,y],i)=><g key={i}>{box(x,y,57,27)}<path d={`M${x+7} ${y+20}l12-10 13 10 13-15`} fill="none" stroke={gold}/></g>)}</>}
  </svg>;
}
