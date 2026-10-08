"use client";
import React, { useEffect } from 'react';

interface RecoveryProps { children: React.ReactNode; resetKey: string; label: string }
export class EditorRecovery extends React.Component<RecoveryProps, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(previous: RecoveryProps) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }
  render() {
    if (this.state.failed) return <div role="alert" className="p-4 text-xs text-ed-text-dim space-y-3">
      <p>{this.props.label} could not be displayed. You can select another item or retry.</p>
      <button className="underline text-ed-accent-text" onClick={() => this.setState({ failed: false })}>Retry {this.props.label.toLowerCase()}</button>
    </div>;
    return this.props.children;
  }
}

/** Evaluate inspector expressions inside the boundary, not in its parent render. */
export function EditorPanelContent({ render }: { render: () => React.ReactNode }) { return render(); }

export function PreviewFailure({ message, onFailure, onRetry }: { message: string; onFailure: () => void; onRetry: () => void }) {
  useEffect(onFailure, [onFailure]);
  return <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ed-media text-white p-5 text-center text-xs">
    <p>Preview could not be displayed.</p>
    <p className="max-w-sm break-words opacity-70">{message}</p>
    <button className="rounded border border-white/50 px-3 py-2" onClick={onRetry}>Retry preview</button>
  </div>;
}
