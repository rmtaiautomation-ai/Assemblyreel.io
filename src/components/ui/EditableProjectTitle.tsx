"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { updateProjectTopic } from "@/app/actions/video-actions";

/**
 * The project title in the Scene Board's top bar — an `<input>` styled to read as an
 * `<h1>`, editable in place. Was a static heading with no path to change it at all once
 * a project existed; `topic` is read live on every Act's Script Writer call (see
 * `updateProjectTopic`'s doc comment), so there was never a technical reason it had to
 * be create-time-only.
 *
 * Save-on-blur, same contract as `NarrationEditor` on this page's own Inspector panel —
 * one editable-text pattern for the whole Scene Board rather than a second one invented
 * here.
 */
export default function EditableProjectTitle({
  projectId,
  initialTopic,
}: {
  projectId: string;
  initialTopic: string;
}) {
  const [value, setValue] = useState(initialTopic);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  // The route re-renders `page.tsx` on navigation with whatever is in the database now
  // — keep this input in sync with that rather than freezing on the value it mounted
  // with, the same trap SceneBoard's own top-level `useEffect` documents for `acts`.
  useEffect(() => setValue(initialTopic), [initialTopic]);

  const handleBlur = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      // Reject silently rather than saving an empty topic — every prompt downstream
      // reads this column directly, and a blank one breaks generation with no error
      // until the next Act write fails for an unrelated-looking reason.
      setValue(initialTopic);
      return;
    }
    if (trimmed === initialTopic.trim()) return;

    setState("saving");
    const result = await updateProjectTopic(projectId, trimmed);
    if (result.success) {
      setValue(trimmed);
      setState("saved");
    } else {
      setValue(initialTopic);
      setState("error");
    }
  };

  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setState("idle");
        }}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter") inputRef.current?.blur();
          if (e.key === "Escape") {
            setValue(initialTopic);
            requestAnimationFrame(() => inputRef.current?.blur());
          }
        }}
        title={value}
        placeholder="Untitled Video"
        // No max-width: this fills whatever room the header's flex layout actually
        // gives it (see the width comment on this component's parent group in
        // page.tsx), so a long topic shows in full on any reasonably wide window
        // instead of being capped well short of it. `truncate` is only the fallback
        // for when a title genuinely exceeds the available width or the window is
        // narrow — the native `title` attribute above still shows the rest on hover.
        className="text-[13px] font-bold text-ed-text bg-transparent border border-transparent rounded px-1.5 py-0.5 -mx-1.5 truncate min-w-0 w-full focus:outline-none focus:bg-ed-well focus:border-ed-accent-border hover:bg-ed-hover/50 transition-colors"
      />
      {state === "saving" && (
        <Loader2 size={12} className="animate-spin text-ed-text-faint shrink-0" />
      )}
      {state === "saved" && (
        <span title="Saved" className="shrink-0">
          <Check size={12} className="text-ed-ok" />
        </span>
      )}
      {state === "error" && (
        <span className="text-[10px] text-ed-danger shrink-0" title="Could not save">
          !
        </span>
      )}
    </div>
  );
}
