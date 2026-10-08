-- Phase 0 inventory. Run against an explicitly selected environment before a
-- future migration. This file only reads; it does not repair or rewrite rows.
-- Results contain row/project IDs and shape flags, never headline/bullet copy.
-- If overlay_clips is absent, stop after the schema check; do not create it here.
begin read only;

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'overlay_clips'
order by ordinal_position;

select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'overlay_clips';

-- to_jsonb(row) allows inspection of pre-kind/origin schemas without selecting
-- a missing column. The schema result above remains the source of readiness.
with raw as (
  select to_jsonb(c) as row_data from public.overlay_clips c
), cards as (
  select row_data,
         case when jsonb_typeof(row_data -> 'template_data') = 'object'
              then row_data -> 'template_data' else '{}'::jsonb end as data
  from raw
  where row_data ->> 'kind' in ('title-cutout-card', 'checklist-card')
), flags as (
  select row_data, data,
         not (data ? 'styleId') and jsonb_typeof(data -> 'style') = 'string'
           and data ->> 'style' <> '' as uses_legacy_style,
         row_data ->> 'kind' = 'checklist-card' and not (data ? 'bullets')
           and jsonb_typeof(data -> 'items') = 'array'
           and not exists (
             select 1 from jsonb_array_elements(
               case when jsonb_typeof(data -> 'items') = 'array'
                    then data -> 'items' else '[]'::jsonb end
             ) as item(value)
             where jsonb_typeof(item.value) <> 'string'
           ) as uses_legacy_items
  from cards
)
select row_data ->> 'id' as clip_id,
       row_data ->> 'project_id' as project_id,
       row_data ->> 'kind' as kind,
       row_data ->> 'origin' as origin,
       data ->> 'styleId' as canonical_style_id,
       data ->> 'style' as legacy_style,
       uses_legacy_style, uses_legacy_items,
       uses_legacy_style and row_data ->> 'text' = ''
         and jsonb_typeof(data -> 'text') = 'string' as recovers_nested_text
from flags
where uses_legacy_style or uses_legacy_items
order by project_id, clip_id;

commit;
