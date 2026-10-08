type Row = Record<string, unknown>;
export interface TimelineInput { project: unknown; scenes: unknown; media: unknown; items: unknown; overlays: unknown }
export function validateTimelineInput(input: TimelineInput): string[] {
  const errors: string[] = [];
  const validId = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
  const project = input.project as Row | null;
  if (!project || !validId(project.id)) errors.push('Project identity is missing.');
  const check = (value: unknown, label: string, timing: Record<string, 'positive' | 'nonnegative'>, required: string[] = []) => {
    if (!Array.isArray(value)) { errors.push(label + ' data is unavailable.'); return; }
    const ids = new Set<string>();
    value.forEach((unknownRow, index) => {
      const row = unknownRow as Row | null;
      if (!row || typeof row !== 'object' || !validId(row.id) || ids.has(row.id)) {
        errors.push(label + ' row ' + (index + 1) + ' has a missing or duplicate identity.');
        return;
      }
      ids.add(row.id);
      for (const [field, rule] of Object.entries(timing)) {
        const time = row[field];
        // Preserve existing missing-value defaults. Never repair or write loaded timing.
        if (time == null && !required.includes(field)) continue;
        if (typeof time !== 'number' || !Number.isFinite(time) || (rule === 'positive' ? time <= 0 : time < 0)) {
          errors.push(label + ' row ' + (index + 1) + ' has invalid ' + field + '.');
        }
      }
    });
  };
  check(input.scenes, 'Scene', { video_duration: 'positive', trim_start: 'nonnegative', transition_duration: 'nonnegative' });
  check(input.media, 'Media', { duration_seconds: 'nonnegative' });
  check(input.items, 'Audio clip', { start_time: 'nonnegative', duration: 'positive', trim_start: 'nonnegative' }, ['start_time', 'duration']);
  check(input.overlays, 'Overlay', { start_time: 'nonnegative', duration: 'positive', x_percent: 'nonnegative', y_percent: 'nonnegative', font_size: 'positive' }, ['start_time', 'duration']);
  return errors;
}
