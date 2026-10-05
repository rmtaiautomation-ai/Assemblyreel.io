alter table public.video_projects
add column if not exists workflow_mode text not null default 'step_by_step' check (workflow_mode in ('step_by_step', 'autopilot'));
