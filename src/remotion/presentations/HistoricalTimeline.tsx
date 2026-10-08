import React from 'react';
import type { PresentationEnvelope, ResolvedPresentation } from '../../lib/presentations/schema';
import { historicalYearOrdinal } from '../../lib/presentations/content';
import { Heading, Copy, reveal, type StageStyle } from './Stage';
import { FONTS } from '../fonts';
import { SourceImage } from './CoreFamilies';

export function HistoricalTimeline({ envelope, presentation, style }: { envelope: Extract<PresentationEnvelope, { templateId: 'historical-timeline' }>; presentation: ResolvedPresentation; style: StageStyle }) {
  const { events, heading, spacing } = envelope.content, { unit, theme, portrait, frame, fps } = style;
  const first = historicalYearOrdinal(events[0].date.year ?? 0), last = historicalYearOrdinal(events.at(-1)?.date.year ?? 1);
  const points = events.map((event, index) => events.length === 1 ? .5 : .13 + .74 * (spacing === 'proportional' ? (historicalYearOrdinal(event.date.year ?? 0) - first) / (last - first) : index / (events.length - 1)));
  return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 28 * unit }}><Heading style={style}>{heading}</Heading>
    <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
      {events.length > 1 && <div style={{ position: 'absolute', left: portrait ? '8%' : '13%', top: portrait ? '13%' : '50%', width: portrait ? 3 * unit : '74%', height: portrait ? '74%' : 3 * unit, background: theme.accentLine, transformOrigin: portrait ? 'top' : 'left', transform: `${portrait ? 'scaleY' : 'scaleX'}(${reveal(frame, fps)})` }} />}
      {events.map((event, index) => <React.Fragment key={event.id}>
        <div style={{ position: 'absolute', left: portrait ? '8%' : `${points[index] * 100}%`, top: portrait ? `${points[index] * 100}%` : '50%', width: 18 * unit, height: 18 * unit, borderRadius: '50%', background: theme.accentLine, transform: 'translate(-50%, -50%)', opacity: reveal(frame, fps, event.cueSeconds) }} />
        <div data-collision style={{ position: 'absolute', left: portrait ? '15%' : `${points[index] * 100}%`, top: portrait ? `${points[index] * 100}%` : '50%', width: portrait ? '82%' : `${Math.min(24, 78 / events.length)}%`, transform: portrait ? 'translateY(-50%)' : 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', gap: portrait ? 12 * unit : 35 * unit, opacity: reveal(frame, fps, event.cueSeconds) }}>
          <div data-fit style={{ alignSelf: portrait ? 'flex-start' : 'center', padding: `${8 * unit}px ${18 * unit}px`, background: theme.paper, color: '#201B15', fontFamily: FONTS.serif, fontSize: 38 * unit, lineHeight: 1.1, overflowWrap: 'anywhere', boxShadow: `0 ${4 * unit}px ${16 * unit}px #0003` }}>{event.date.approximate ? 'c. ' : ''}{event.date.display}</div>
          <div style={{ padding: 12 * unit, background: theme.background, textAlign: portrait ? 'left' : 'center' }}><Copy style={style} size={30}>{event.label}</Copy></div>
          {event.image && <div style={{ height: 100 * unit, width: 140 * unit, alignSelf: portrait ? 'flex-start' : 'center' }}><SourceImage image={event.image} presentation={presentation} style={style} /></div>}
        </div>
      </React.Fragment>)}
    </div><Copy style={style} size={24}>{spacing === 'equal' ? 'Authored order · spacing is not elapsed time' : 'Elapsed years · BCE / CE, no year zero'}</Copy>
  </div>;
}
