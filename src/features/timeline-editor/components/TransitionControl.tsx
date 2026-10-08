import React, { memo } from 'react';
import type { LucideIcon } from 'lucide-react';

interface TransitionControlProps {
  sceneId: string; index: number; transitionType?: string; hasTransition: boolean;
  transitionWidth: number; leftPx: number; isDragOver: boolean; hidden: boolean; locked: boolean;
  slideTransition?: string; TransitionIcon: LucideIcon;
  blockRefs: { current: Record<string, HTMLElement | null> };
  onSelect: (event: React.MouseEvent, sceneId: string, index: number) => void;
  onResize: (event: React.PointerEvent, sceneId: string, index: number, edge: 'left' | 'right') => void;
  onApply: (sceneId: string, transitionType: string) => void;
  onDragOverScene: React.Dispatch<React.SetStateAction<string | null>>;
}

export const TransitionControl = memo(function TransitionControl({ sceneId, index, transitionType,
  hasTransition, transitionWidth, leftPx, isDragOver, hidden, locked, slideTransition, TransitionIcon,
  blockRefs, onSelect, onResize, onApply, onDragOverScene,
}: TransitionControlProps) {
  const handleTransitionDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (locked || index === 0 || !event.dataTransfer.types.includes('application/x-transition-card')) return;
    event.preventDefault();
    if (!isDragOver) onDragOverScene(sceneId);
  };
  const handleTransitionDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) onDragOverScene(previous => previous === sceneId ? null : previous);
  };
  const handleTransitionDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (locked || index === 0) return;
    let data: { type?: string; transitionType?: string } | null;
    try { data = JSON.parse(event.dataTransfer.getData('text/plain')); } catch { return; }
    if (data?.type !== 'transition' || typeof data.transitionType !== 'string') return;
    event.preventDefault(); event.stopPropagation();
    onDragOverScene(null);
    onApply(sceneId, data.transitionType);
  };
  return (<div
    ref={el => { blockRefs.current[`${sceneId}_transition`] = el; }}
    data-base-left={leftPx}
    data-timeline-transition={sceneId}
    data-scaled="0"
    draggable={false}
    onDragOver={handleTransitionDragOver}
    onDragLeave={handleTransitionDragLeave}
    onDrop={handleTransitionDrop}
    className={`absolute top-[10%] bottom-[10%] z-40 cursor-pointer flex items-center justify-center group/seam transition-colors ${
      hasTransition ? 'bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/40 shadow-sm' : ''
    } ${isDragOver ? 'bg-ed-warn/50' : ''}`}
    style={{
      width: `${transitionWidth}px`,
      left: `-${transitionWidth / 2}px`,
      borderRadius: hasTransition ? '2px' : '0px',
      transform: `translate3d(${leftPx}px, 0, 0)`,
      opacity: hidden ? 0.001 : 1,
      transition: slideTransition
    }}
    title={hasTransition ? `Transition in: ${transitionType}` : 'Click to add a transition'}
    onClick={(e) => {
      e.stopPropagation();
      if (locked) return;
      onSelect(e, sceneId, index);
    }}
  >
    {!hasTransition && (
      <div className="w-[2px] h-[80%] bg-white opacity-0 group-hover/seam:opacity-80 transition-opacity rounded-full shadow-sm" />
    )}

    {hasTransition && (
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
        <TransitionIcon size={12} className="text-white drop-shadow-md opacity-80" strokeWidth={2.5} />
      </div>
    )}

    {/* Left Drag Handle */}
    {hasTransition && (
      <div
        className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-white/60 opacity-0 group-hover/seam:opacity-100 transition-opacity rounded-l-[2px]"
        onPointerDown={(e) => onResize(e, sceneId, index, 'left')}
      />
    )}

    {/* Right Drag Handle */}
    {hasTransition && (
      <div
        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-white/60 opacity-0 group-hover/seam:opacity-100 transition-opacity rounded-r-[2px]"
        onPointerDown={(e) => onResize(e, sceneId, index, 'right')}
      />
    )}
  </div>);
});
