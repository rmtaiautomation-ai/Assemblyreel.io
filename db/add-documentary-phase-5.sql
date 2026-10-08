-- Apply AFTER add-documentary-phase-4.sql. Review against a backed-up staging DB first.
-- No saved rows, allowed-family selections, channel defaults or billing flags are changed.
begin;
do $$ begin
  if to_regprocedure('public.documentary_image_slots_phase4(jsonb)') is null then
    alter function public.documentary_image_slots(jsonb) rename to documentary_image_slots_phase4;
  end if;
end $$;
revoke all on function public.documentary_image_slots_phase4(jsonb) from public,anon,authenticated;

-- Generated from advanced-families.ts by scripts/presentations/phase-5-shape-contract.mjs.
-- The SQL regression test checks exact contract parity. Custom refinements follow below.
create or replace function public.phase5_shape_contract() returns jsonb
language sql immutable set search_path=public,pg_temp as $$
  select '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"journey-map":{"type":"object","properties":{"heading":{"$ref":"#/$defs/__schema0"},"mapId":{"type":"string","const":"west-asia-v1"},"viewport":{"$ref":"#/$defs/__schema1"},"mode":{"type":"string","enum":["schematic","supplied-route"]},"route":{"maxItems":128,"type":"array","items":{"$ref":"#/$defs/__schema2"}},"source":{"$ref":"#/$defs/__schema3"},"stops":{"minItems":2,"maxItems":5,"type":"array","items":{"$ref":"#/$defs/__schema4"}}},"required":["heading","mapId","viewport","mode","route","source","stops"],"additionalProperties":false},"territory-change":{"type":"object","properties":{"heading":{"$ref":"#/$defs/__schema0"},"mapId":{"type":"string","const":"west-asia-v1"},"viewport":{"$ref":"#/$defs/__schema1"},"dataset":{"type":"string","minLength":1,"maxLength":80},"states":{"minItems":2,"maxItems":4,"type":"array","items":{"$ref":"#/$defs/__schema6"}}},"required":["heading","mapId","viewport","dataset","states"],"additionalProperties":false},"then-now":{"type":"object","properties":{"heading":{"$ref":"#/$defs/__schema0"},"images":{"type":"array","prefixItems":[{"$ref":"#/$defs/__schema8"},{"$ref":"#/$defs/__schema8"}]},"labels":{"type":"array","prefixItems":[{"type":"string","minLength":1,"maxLength":35},{"type":"string","minLength":1,"maxLength":35}]},"method":{"type":"string","enum":["wipe","side-by-side"]},"alignmentReviewed":{"type":"boolean"},"cueSeconds":{"$ref":"#/$defs/__schema5"},"crops":{"type":"array","prefixItems":[{"type":"object","properties":{"x":{"type":"number","minimum":0,"maximum":1},"y":{"type":"number","minimum":0,"maximum":1},"width":{"type":"number","exclusiveMinimum":0,"maximum":1},"height":{"type":"number","exclusiveMinimum":0,"maximum":1}},"required":["x","y","width","height"],"additionalProperties":false},{"type":"object","properties":{"x":{"type":"number","minimum":0,"maximum":1},"y":{"type":"number","minimum":0,"maximum":1},"width":{"type":"number","exclusiveMinimum":0,"maximum":1},"height":{"type":"number","exclusiveMinimum":0,"maximum":1}},"required":["x","y","width","height"],"additionalProperties":false}]}},"required":["heading","images","labels","method","alignmentReviewed","cueSeconds","crops"],"additionalProperties":false},"layered-parallax":{"type":"object","properties":{"heading":{"$ref":"#/$defs/__schema0"},"preparedReviewed":{"type":"boolean"},"motion":{"type":"string","enum":["left","right","up","down"]},"focalPoint":{"type":"object","properties":{"x":{"type":"number","minimum":0.15,"maximum":0.85},"y":{"type":"number","minimum":0.15,"maximum":0.85}},"required":["x","y"],"additionalProperties":false},"layers":{"minItems":2,"maxItems":4,"type":"array","items":{"$ref":"#/$defs/__schema9"}}},"required":["heading","preparedReviewed","motion","focalPoint","layers"],"additionalProperties":false},"structure-cutaway":{"type":"object","properties":{"heading":{"$ref":"#/$defs/__schema0"},"image":{"$ref":"#/$defs/__schema8"},"diagramReviewed":{"type":"boolean"},"sections":{"minItems":2,"maxItems":4,"type":"array","items":{"$ref":"#/$defs/__schema10"}}},"required":["heading","image","diagramReviewed","sections"],"additionalProperties":false},"manuscript-comparison":{"type":"object","properties":{"heading":{"$ref":"#/$defs/__schema0"},"passages":{"type":"array","prefixItems":[{"$ref":"#/$defs/__schema11"},{"$ref":"#/$defs/__schema11"}]},"mappings":{"maxItems":3,"type":"array","items":{"$ref":"#/$defs/__schema12"}}},"required":["heading","passages","mappings"],"additionalProperties":false},"evidence-board":{"type":"object","properties":{"heading":{"$ref":"#/$defs/__schema0"},"cards":{"minItems":3,"maxItems":5,"type":"array","items":{"$ref":"#/$defs/__schema13"}},"links":{"minItems":2,"maxItems":4,"type":"array","items":{"$ref":"#/$defs/__schema14"}}},"required":["heading","cards","links"],"additionalProperties":false},"animated-chart":{"type":"object","properties":{"heading":{"$ref":"#/$defs/__schema0"},"kind":{"type":"string","enum":["bar","line"]},"unit":{"type":"string","minLength":1,"maxLength":20},"axisLabel":{"type":"string","minLength":1,"maxLength":40},"points":{"minItems":2,"maxItems":6,"type":"array","items":{"$ref":"#/$defs/__schema15"}},"source":{"$ref":"#/$defs/__schema3"},"caveat":{"type":"string","minLength":1,"maxLength":100}},"required":["heading","kind","unit","axisLabel","points","source","caveat"],"additionalProperties":false},"competing-explanations":{"type":"object","properties":{"heading":{"$ref":"#/$defs/__schema0"},"explanations":{"minItems":2,"maxItems":3,"type":"array","items":{"$ref":"#/$defs/__schema16"}}},"required":["heading","explanations"],"additionalProperties":false},"chapter-recap":{"type":"object","properties":{"heading":{"type":"string","minLength":1,"maxLength":90},"nextCue":{"type":"string","minLength":1,"maxLength":70},"items":{"minItems":2,"maxItems":4,"type":"array","items":{"$ref":"#/$defs/__schema17"}}},"required":["heading","nextCue","items"],"additionalProperties":false}},"required":["journey-map","territory-change","then-now","layered-parallax","structure-cutaway","manuscript-comparison","evidence-board","animated-chart","competing-explanations","chapter-recap"],"$defs":{"__schema0":{"type":"string","maxLength":100},"__schema1":{"type":"object","properties":{"west":{"type":"number","minimum":20,"maximum":65},"east":{"type":"number","minimum":20,"maximum":65},"south":{"type":"number","minimum":12,"maximum":50},"north":{"type":"number","minimum":12,"maximum":50}},"required":["west","east","south","north"],"additionalProperties":false},"__schema2":{"type":"array","prefixItems":[{"type":"number","minimum":20,"maximum":65},{"type":"number","minimum":12,"maximum":50}]},"__schema3":{"type":"object","properties":{"credit":{"type":"string","maxLength":90},"url":{"type":"string","maxLength":1000},"classification":{"type":"string","enum":["historical","illustration","reconstruction","unknown"]}},"required":["credit","url","classification"],"additionalProperties":false},"__schema4":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"label":{"type":"string","minLength":1,"maxLength":40},"date":{"type":"string","maxLength":35},"point":{"$ref":"#/$defs/__schema2"},"approximate":{"type":"boolean"},"cueSeconds":{"$ref":"#/$defs/__schema5"},"source":{"$ref":"#/$defs/__schema3"}},"required":["id","label","date","point","approximate","cueSeconds","source"],"additionalProperties":false},"__schema5":{"type":"number","minimum":0},"__schema6":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"date":{"type":"string","minLength":1,"maxLength":35},"year":{"type":"integer","minimum":-9999,"maximum":9999},"label":{"type":"string","minLength":1,"maxLength":50},"approximate":{"type":"boolean"},"cueSeconds":{"$ref":"#/$defs/__schema5"},"source":{"$ref":"#/$defs/__schema3"},"polygons":{"minItems":1,"maxItems":4,"type":"array","items":{"$ref":"#/$defs/__schema7"}}},"required":["id","date","year","label","approximate","cueSeconds","source","polygons"],"additionalProperties":false},"__schema7":{"minItems":3,"maxItems":64,"type":"array","items":{"$ref":"#/$defs/__schema2"}},"__schema8":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"asset":{"type":"object","properties":{"kind":{"type":"string","const":"media"},"mediaId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"required":["kind","mediaId"],"additionalProperties":false},"label":{"type":"string","minLength":1,"maxLength":60},"fit":{"type":"string","enum":["cover","contain"]},"focalPoint":{"type":"object","properties":{"x":{"type":"number","minimum":0,"maximum":1},"y":{"type":"number","minimum":0,"maximum":1}},"required":["x","y"],"additionalProperties":false},"source":{"$ref":"#/$defs/__schema3"}},"required":["id","asset","label","fit","focalPoint","source"],"additionalProperties":false},"__schema9":{"type":"object","properties":{"image":{"$ref":"#/$defs/__schema8"},"role":{"type":"string","enum":["background","transparent"]},"depth":{"type":"number","minimum":0,"maximum":1}},"required":["image","role","depth"],"additionalProperties":false},"__schema10":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"label":{"type":"string","minLength":1,"maxLength":40},"description":{"type":"string","minLength":1,"maxLength":80},"x":{"type":"number","minimum":0,"maximum":1},"y":{"type":"number","minimum":0,"maximum":1},"width":{"type":"number","exclusiveMinimum":0,"maximum":1},"height":{"type":"number","exclusiveMinimum":0,"maximum":1},"cueSeconds":{"$ref":"#/$defs/__schema5"}},"required":["id","label","description","x","y","width","height","cueSeconds"],"additionalProperties":false},"__schema11":{"type":"object","properties":{"text":{"type":"string","minLength":1,"maxLength":170},"edition":{"type":"string","minLength":1,"maxLength":70},"language":{"type":"string","minLength":1,"maxLength":40},"script":{"type":"string","enum":["latin","hebrew","syriac","ethiopic","cuneiform","transliteration-only"]},"direction":{"type":"string","enum":["ltr","rtl"]},"transliteration":{"type":"string","maxLength":170},"fallbackReviewed":{"type":"boolean"},"source":{"$ref":"#/$defs/__schema3"}},"required":["text","edition","language","script","direction","transliteration","fallbackReviewed","source"],"additionalProperties":false},"__schema12":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"label":{"type":"string","minLength":1,"maxLength":50},"leftStart":{"type":"integer","minimum":0,"maximum":9007199254740991},"leftEnd":{"type":"integer","exclusiveMinimum":0,"maximum":9007199254740991},"rightStart":{"type":"integer","minimum":0,"maximum":9007199254740991},"rightEnd":{"type":"integer","exclusiveMinimum":0,"maximum":9007199254740991},"cueSeconds":{"$ref":"#/$defs/__schema5"}},"required":["id","label","leftStart","leftEnd","rightStart","rightEnd","cueSeconds"],"additionalProperties":false},"__schema13":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"label":{"type":"string","minLength":1,"maxLength":45},"detail":{"type":"string","minLength":1,"maxLength":70},"image":{"anyOf":[{"$ref":"#/$defs/__schema8"},{"type":"null"}]},"source":{"$ref":"#/$defs/__schema3"}},"required":["id","label","detail","image","source"],"additionalProperties":false},"__schema14":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"from":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"to":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"label":{"type":"string","minLength":1,"maxLength":50},"source":{"$ref":"#/$defs/__schema3"},"cueSeconds":{"$ref":"#/$defs/__schema5"}},"required":["id","from","to","label","source","cueSeconds"],"additionalProperties":false},"__schema15":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"label":{"type":"string","minLength":1,"maxLength":25},"x":{"type":"number","minimum":-1000000000000,"maximum":1000000000000},"value":{"anyOf":[{"type":"number","minimum":0,"maximum":1000000000000},{"type":"null"}]},"low":{"anyOf":[{"type":"number","minimum":0,"maximum":1000000000000},{"type":"null"}]},"high":{"anyOf":[{"type":"number","minimum":0,"maximum":1000000000000},{"type":"null"}]},"estimated":{"type":"boolean"}},"required":["id","label","x","value","low","high","estimated"],"additionalProperties":false},"__schema16":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"name":{"type":"string","minLength":1,"maxLength":45},"support":{"type":"string","minLength":1,"maxLength":120},"limitation":{"type":"string","minLength":1,"maxLength":100},"source":{"$ref":"#/$defs/__schema3"}},"required":["id","name","support","limitation","source"],"additionalProperties":false},"__schema17":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"sceneId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"image":{"$ref":"#/$defs/__schema8"},"takeaway":{"type":"string","minLength":1,"maxLength":70}},"required":["id","sceneId","image","takeaway"],"additionalProperties":false}}}'::jsonb
$$;
revoke all on function public.phase5_shape_contract() from public;

create or replace function public.phase5_utf16_length(p_text text) returns integer
language sql immutable set search_path=public,pg_temp as $$
  select coalesce(sum(case when ascii(substr(p_text,i,1))>65535 then 2 else 1 end),0)::integer from generate_series(1,length(p_text)) i
$$;
revoke all on function public.phase5_utf16_length(text) from public;

-- Deliberately bounded JSON-schema subset, private and used only with the pinned contract.
create or replace function public.phase5_shape_valid(p_value jsonb,p_spec jsonb,p_root jsonb,p_depth integer default 0) returns boolean
language plpgsql immutable set search_path=public,pg_temp as $$
declare spec jsonb:=p_spec; item jsonb; key text; expected text; n numeric; count_items integer; i integer;
begin
  if p_depth>20 or spec is null or p_value is null then return false; end if;
  if spec ? '$ref' then spec:=p_root#>string_to_array(substr(spec->>'$ref',3),'/'); end if;
  if spec ? 'anyOf' then
    for item in select value from jsonb_array_elements(spec->'anyOf') loop if public.phase5_shape_valid(p_value,item,p_root,p_depth+1) then return true; end if; end loop;
    return false;
  end if;
  if spec ? 'const' and p_value<>spec->'const' then return false; end if;
  if spec ? 'enum' and not exists(select 1 from jsonb_array_elements(spec->'enum') x where x=p_value) then return false; end if;
  expected:=spec->>'type';
  if expected='integer' then
    if jsonb_typeof(p_value)<>'number' or (p_value#>>'{}')::numeric<>trunc((p_value#>>'{}')::numeric) then return false; end if;
  elsif jsonb_typeof(p_value) is distinct from expected then return false; end if;
  case expected
    when 'object' then
      if exists(select 1 from jsonb_array_elements_text(spec->'required') r where not p_value ? r) then return false; end if;
      if spec->>'additionalProperties'='false' and exists(select 1 from jsonb_object_keys(p_value) k where not (spec->'properties') ? k) then return false; end if;
      for key,item in select * from jsonb_each(p_value) loop
        if not public.phase5_shape_valid(item,spec#>array['properties',key],p_root,p_depth+1) then return false; end if;
        if key='source' and not public.phase4_source_valid(item) then return false; end if;
      end loop;
    when 'array' then
      count_items:=jsonb_array_length(p_value);
      if spec ? 'minItems' and count_items<(spec->>'minItems')::int or spec ? 'maxItems' and count_items>(spec->>'maxItems')::int then return false; end if;
      if spec ? 'prefixItems' then
        if count_items<>jsonb_array_length(spec->'prefixItems') then return false; end if;
        for i in 0..count_items-1 loop if not public.phase5_shape_valid(p_value->i,spec->'prefixItems'->i,p_root,p_depth+1) then return false; end if; end loop;
      else
        for item in select value from jsonb_array_elements(p_value) loop if not public.phase5_shape_valid(item,spec->'items',p_root,p_depth+1) then return false; end if; end loop;
      end if;
    when 'string' then
      if spec ? 'minLength' and public.phase5_utf16_length(trim(p_value#>>'{}'))<(spec->>'minLength')::int or spec ? 'maxLength' and public.phase5_utf16_length(p_value#>>'{}')>(spec->>'maxLength')::int then return false; end if;
      if spec ? 'pattern' and (p_value#>>'{}') !~ (spec->>'pattern') then return false; end if;
    when 'number','integer' then
      n:=(p_value#>>'{}')::numeric;
      if spec ? 'minimum' and n<(spec->>'minimum')::numeric or spec ? 'maximum' and n>(spec->>'maximum')::numeric or spec ? 'exclusiveMinimum' and n<=(spec->>'exclusiveMinimum')::numeric then return false; end if;
    else null;
  end case;
  return true;
end $$;
revoke all on function public.phase5_shape_valid(jsonb,jsonb,jsonb,integer) from public;

create or replace function public.phase5_orientation(a jsonb,b jsonb,c jsonb) returns numeric
language sql immutable set search_path=public,pg_temp as $$
  select ((b->>0)::numeric-(a->>0)::numeric)*((c->>1)::numeric-(a->>1)::numeric)-((b->>1)::numeric-(a->>1)::numeric)*((c->>0)::numeric-(a->>0)::numeric)
$$;
create or replace function public.phase5_between(a jsonb,b jsonb,c jsonb) returns boolean
language sql immutable set search_path=public,pg_temp as $$
  select abs(public.phase5_orientation(a,b,c))<1e-9 and (c->>0)::numeric between least((a->>0)::numeric,(b->>0)::numeric) and greatest((a->>0)::numeric,(b->>0)::numeric)
    and (c->>1)::numeric between least((a->>1)::numeric,(b->>1)::numeric) and greatest((a->>1)::numeric,(b->>1)::numeric)
$$;
create or replace function public.phase5_segments_intersect(a jsonb,b jsonb,c jsonb,d jsonb) returns boolean
language sql immutable set search_path=public,pg_temp as $$
  select public.phase5_orientation(a,b,c)*public.phase5_orientation(a,b,d)<0 and public.phase5_orientation(c,d,a)*public.phase5_orientation(c,d,b)<0
    or public.phase5_between(a,b,c) or public.phase5_between(a,b,d) or public.phase5_between(c,d,a) or public.phase5_between(c,d,b)
$$;
create or replace function public.phase5_inside(point jsonb,polygon jsonb) returns boolean
language plpgsql immutable set search_path=public,pg_temp as $$
declare i integer; a jsonb; b jsonb; result boolean:=false; n integer:=jsonb_array_length(polygon);
begin
  for i in 0..n-1 loop
    a:=polygon->i; b:=polygon->((i+1)%n);
    if ((a->>1)::numeric>(point->>1)::numeric) <> ((b->>1)::numeric>(point->>1)::numeric) then
      if (point->>0)::numeric < ((b->>0)::numeric-(a->>0)::numeric)*((point->>1)::numeric-(a->>1)::numeric)/((b->>1)::numeric-(a->>1)::numeric)+(a->>0)::numeric then result:=not result; end if;
    end if;
  end loop;
  return result;
end $$;
create or replace function public.phase5_polygon_valid(polygon jsonb,viewport jsonb) returns boolean
language plpgsql immutable set search_path=public,pg_temp as $$
declare i integer; j integer; a jsonb; b jsonb; n integer:=jsonb_array_length(polygon); area numeric:=0;
begin
  if (select count(distinct x) from jsonb_array_elements(polygon) x)<>n then return false; end if;
  for i in 0..n-1 loop
    a:=polygon->i; b:=polygon->((i+1)%n);
    if (a->>0)::numeric not between (viewport->>'west')::numeric and (viewport->>'east')::numeric or (a->>1)::numeric not between (viewport->>'south')::numeric and (viewport->>'north')::numeric then return false; end if;
    area:=area+(a->>0)::numeric*(b->>1)::numeric-(b->>0)::numeric*(a->>1)::numeric;
    if abs(public.phase5_orientation(polygon->((i+n-1)%n),a,b))<=1e-9 then return false; end if;
    for j in i+1..n-1 loop
      if j=i+1 or i=0 and j=n-1 then continue; end if;
      if public.phase5_segments_intersect(a,b,polygon->j,polygon->((j+1)%n)) then return false; end if;
    end loop;
  end loop;
  return abs(area)>=1e-6;
end $$;
create or replace function public.phase5_polygon_overlap(a jsonb,b jsonb) returns boolean
language plpgsql immutable set search_path=public,pg_temp as $$
declare i integer; j integer; na integer:=jsonb_array_length(a); nb integer:=jsonb_array_length(b);
begin
  for i in 0..na-1 loop for j in 0..nb-1 loop if public.phase5_segments_intersect(a->i,a->((i+1)%na),b->j,b->((j+1)%nb)) then return true; end if; end loop; end loop;
  return public.phase5_inside(a->0,b) or public.phase5_inside(b->0,a);
end $$;
revoke all on function public.phase5_orientation(jsonb,jsonb,jsonb), public.phase5_between(jsonb,jsonb,jsonb), public.phase5_segments_intersect(jsonb,jsonb,jsonb,jsonb), public.phase5_inside(jsonb,jsonb), public.phase5_polygon_valid(jsonb,jsonb), public.phase5_polygon_overlap(jsonb,jsonb) from public;

create or replace function public.documentary_image_slots(p_envelope jsonb) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
declare kind text:=p_envelope->>'templateId'; c jsonb:=p_envelope->'content'; contract jsonb:=public.phase5_shape_contract(); item jsonb; other jsonb; polygon jsonb; slots jsonb:='[]'; items jsonb; ids text[]; visited text[]; pending text; point jsonb; last_cue numeric:=-1; last_year integer:=-10000; last_depth numeric:=-1; last_x numeric; span numeric; cursor integer:=-1; position integer; i integer; j integer; n integer; measured_value numeric; low numeric; high numeric; passage jsonb; displayed text; side text; offset_start integer; offset_end integer; previous_end integer;
begin
  if not (contract->'properties') ? kind or kind is null then return public.documentary_image_slots_phase4(p_envelope); end if;
  if not public.phase5_shape_valid(c,contract#>array['properties',kind],contract) then raise exception 'INVALID_PRESENTATION'; end if;
  case kind
    when 'journey-map' then
      items:=c->'stops';
      if c->>'mode'='schematic' and jsonb_array_length(c->'route')<>0 then raise exception 'INVALID_PRESENTATION'; end if;
      if (select count(distinct x->'point') from jsonb_array_elements(items) x)<>jsonb_array_length(items) then raise exception 'INVALID_PRESENTATION'; end if;
      for item in select value from jsonb_array_elements(items) loop
        if (item->>'cueSeconds')::numeric<last_cue then raise exception 'INVALID_PRESENTATION'; end if; last_cue:=(item->>'cueSeconds')::numeric;
        if c->>'mode'='supplied-route' then
          select min(ordinality::int-1) into position from jsonb_array_elements(c->'route') with ordinality where ordinality-1>cursor and abs((value->>0)::numeric-(item#>>'{point,0}')::numeric)<1e-6 and abs((value->>1)::numeric-(item#>>'{point,1}')::numeric)<1e-6;
          if position is null then raise exception 'INVALID_PRESENTATION'; end if; cursor:=position;
        end if;
      end loop;
      for point in select value from jsonb_array_elements((c->'route')||(select jsonb_agg(x->'point') from jsonb_array_elements(items) x)) loop
        if (point->>0)::numeric not between (c#>>'{viewport,west}')::numeric and (c#>>'{viewport,east}')::numeric or (point->>1)::numeric not between (c#>>'{viewport,south}')::numeric and (c#>>'{viewport,north}')::numeric then raise exception 'INVALID_PRESENTATION'; end if;
      end loop;
    when 'territory-change' then
      items:=c->'states';
      for item in select value from jsonb_array_elements(items) loop
        if (item->>'year')::int=0 or (item->>'year')::int<=last_year or (item->>'cueSeconds')::numeric<last_cue+(case when last_cue<0 then 0 else 2 end) or item#>>'{source,classification}' not in ('historical','reconstruction') then raise exception 'INVALID_PRESENTATION'; end if;
        last_year:=(item->>'year')::int; last_cue:=(item->>'cueSeconds')::numeric;
        n:=jsonb_array_length(item->'polygons');
        for i in 0..n-1 loop
          polygon:=item->'polygons'->i;
          if not public.phase5_polygon_valid(polygon,c->'viewport') then raise exception 'INVALID_PRESENTATION'; end if;
          for j in i+1..n-1 loop if public.phase5_polygon_overlap(polygon,item->'polygons'->j) then raise exception 'INVALID_PRESENTATION'; end if; end loop;
        end loop;
      end loop;
    when 'then-now' then
      slots:=c->'images';
      if c->>'method'='wipe' and c->>'alignmentReviewed'<>'true' then raise exception 'INVALID_PRESENTATION'; end if;
      for item in select value from jsonb_array_elements(c->'crops') loop if (item->>'x')::numeric+(item->>'width')::numeric>1.000001 or (item->>'y')::numeric+(item->>'height')::numeric>1.000001 then raise exception 'INVALID_PRESENTATION'; end if; end loop;
    when 'layered-parallax' then
      if c->>'preparedReviewed'<>'true' or c#>>'{layers,0,role}'<>'background' or (c#>>'{layers,0,depth}')::numeric<>0 then raise exception 'INVALID_PRESENTATION'; end if;
      for item in select value from jsonb_array_elements(c->'layers') loop
        if (item->>'depth')::numeric<=last_depth or last_depth>=0 and item->>'role'<>'transparent' then raise exception 'INVALID_PRESENTATION'; end if;
        last_depth:=(item->>'depth')::numeric; slots:=slots||jsonb_build_array(item->'image');
      end loop;
    when 'structure-cutaway' then
      items:=c->'sections'; slots:=jsonb_build_array(c->'image');
      if c->>'diagramReviewed'<>'true' or c#>>'{image,source,classification}'='unknown' then raise exception 'INVALID_PRESENTATION'; end if;
      for item in select value from jsonb_array_elements(items) loop
        if (item->>'x')::numeric+(item->>'width')::numeric>1.000001 or (item->>'y')::numeric+(item->>'height')::numeric>1.000001 or (item->>'cueSeconds')::numeric<last_cue then raise exception 'INVALID_PRESENTATION'; end if;
        last_cue:=(item->>'cueSeconds')::numeric;
      end loop;
    when 'manuscript-comparison' then
      items:=c->'mappings';
      for i in 0..1 loop
        passage:=c->'passages'->i;
        if passage->>'direction'<>(case when passage->>'script' in ('hebrew','syriac') then 'rtl' else 'ltr' end) or passage->>'script'='transliteration-only' and (passage->>'fallbackReviewed'<>'true' or length(trim(passage->>'transliteration'))=0) then raise exception 'INVALID_PRESENTATION'; end if;
        displayed:=case when passage->>'script'='transliteration-only' then passage->>'transliteration' else passage->>'text' end;
        side:=case when i=0 then 'left' else 'right' end; previous_end:=0;
        for item in select value from jsonb_array_elements(items) order by (value->>(side||'Start'))::int loop
          offset_start:=(item->>(side||'Start'))::int; offset_end:=(item->>(side||'End'))::int;
          if offset_start<previous_end or offset_end<=offset_start or offset_end>public.phase5_utf16_length(displayed) then raise exception 'INVALID_PRESENTATION'; end if;
          -- Offsets cannot bisect astral glyphs. Server validation additionally checks whole grapheme clusters and supported-script coverage.
          if not exists(select 1 from generate_series(0,length(displayed)) as offsets(pos) where public.phase5_utf16_length(left(displayed,offsets.pos))=offset_start) or not exists(select 1 from generate_series(0,length(displayed)) as offsets(pos) where public.phase5_utf16_length(left(displayed,offsets.pos))=offset_end) then raise exception 'INVALID_PRESENTATION'; end if;
          previous_end:=offset_end;
        end loop;
      end loop;
    when 'evidence-board' then
      items:=(c->'cards')||(c->'links'); ids:=array(select x->>'id' from jsonb_array_elements(c->'cards') x); visited:=array[ids[1]];
      if jsonb_array_length(c->'links')<>cardinality(ids)-1 or (select count(distinct least(x->>'from',x->>'to')||':'||greatest(x->>'from',x->>'to')) from jsonb_array_elements(c->'links') x)<>jsonb_array_length(c->'links') then raise exception 'INVALID_PRESENTATION'; end if;
      for item in select value from jsonb_array_elements(c->'cards') loop if item->'image'<>'null'::jsonb then slots:=slots||jsonb_build_array(item->'image'); end if; end loop;
      for item in select value from jsonb_array_elements(c->'links') loop
        if not (item->>'from'=any(ids)) or not (item->>'to'=any(ids)) or item->>'from'=item->>'to' or (item->>'cueSeconds')::numeric<last_cue then raise exception 'INVALID_PRESENTATION'; end if; last_cue:=(item->>'cueSeconds')::numeric;
      end loop;
      for i in 1..cardinality(ids) loop for item in select value from jsonb_array_elements(c->'links') loop
        if item->>'from'=any(visited) and not item->>'to'=any(visited) then visited:=array_append(visited,item->>'to'); end if;
        if item->>'to'=any(visited) and not item->>'from'=any(visited) then visited:=array_append(visited,item->>'from'); end if;
      end loop; end loop;
      if cardinality(visited)<>cardinality(ids) then raise exception 'INVALID_PRESENTATION'; end if;
    when 'animated-chart' then
      items:=c->'points'; span:=(items->(jsonb_array_length(items)-1)->>'x')::numeric-(items->0->>'x')::numeric;
      if not exists(select 1 from jsonb_array_elements(items) x where (x->>'value')::numeric>0) then raise exception 'INVALID_PRESENTATION'; end if;
      for item in select value from jsonb_array_elements(items) loop
        measured_value:=(item->>'value')::numeric; low:=(item->>'low')::numeric; high:=(item->>'high')::numeric;
        if measured_value is null and (low is not null or high is not null) or (low is null)<>(high is null) or low>measured_value or high<measured_value then raise exception 'INVALID_PRESENTATION'; end if;
        if c->>'kind'='line' and last_x is not null and ((item->>'x')::numeric<=last_x or ((item->>'x')::numeric-last_x)/nullif(span,0)<.08) then raise exception 'INVALID_PRESENTATION'; end if;
        last_x:=(item->>'x')::numeric;
      end loop;
    when 'competing-explanations' then items:=c->'explanations';
    when 'chapter-recap' then
      items:=c->'items';
      if (select count(distinct x->>'sceneId') from jsonb_array_elements(items) x)<>jsonb_array_length(items) then raise exception 'INVALID_PRESENTATION'; end if;
      select jsonb_agg(x->'image') into slots from jsonb_array_elements(items) x;
  end case;
  last_cue:=-1;
  if items is not null then
    for item in select value from jsonb_array_elements(items) where value ? 'cueSeconds' loop
      if (item->>'cueSeconds')::numeric<last_cue then raise exception 'INVALID_PRESENTATION'; end if;
      last_cue:=(item->>'cueSeconds')::numeric;
    end loop;
  end if;
  if items is not null and (select count(distinct x->>'id') from jsonb_array_elements(items) x)<>jsonb_array_length(items) then raise exception 'INVALID_PRESENTATION'; end if;
  if (select count(distinct x->>'id') from jsonb_array_elements(slots) x)<>jsonb_array_length(slots) then raise exception 'INVALID_PRESENTATION'; end if;
  if kind in ('journey-map','territory-change') and ((c#>>'{viewport,east}')::numeric-(c#>>'{viewport,west}')::numeric<6 or (c#>>'{viewport,north}')::numeric-(c#>>'{viewport,south}')::numeric<6) then raise exception 'INVALID_PRESENTATION'; end if;
  return slots;
end $$;
revoke all on function public.documentary_image_slots(jsonb) from public;

-- Shared write gate covers manual saves, source packets, reviewed AI apply and service-role writes.
-- Existing CAS/origin/replay/lock services are not replaced.
create or replace function public.guard_phase5_references() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare envelope jsonb; item jsonb; source_scene public.scenes%rowtype; current_sequence numeric; available numeric; current_duration numeric; max_cue numeric;
begin
  envelope:=case when tg_table_name='overlay_clips' then to_jsonb(new)->'template_data' else to_jsonb(new)->'envelope' end;
  if not (public.phase5_shape_contract()->'properties') ? (envelope->>'templateId') then return new; end if;
  perform public.documentary_image_slots(envelope);
  if tg_table_name='presentation_evidence' and exists(select 1 from jsonb_path_query(envelope->'content','strict $.** ? (@.type() == "object" && exists(@.source)).source') as sources(value) where value->>'classification'='unknown') then raise exception 'INVALID_EVIDENCE'; end if;
  if tg_table_name='overlay_clips' then
    select (to_jsonb(s)->>'sequence_number')::numeric,s.video_duration into current_sequence,current_duration from public.scenes s where s.id=new.scene_id and s.project_id=new.project_id;
    available:=greatest(0,current_duration-new.start_time);
    if new.duration_mode='fixed' then available:=least(available,new.duration); end if;
    select max((value->>'cueSeconds')::numeric) into max_cue from jsonb_path_query(envelope->'content','strict $.** ? (@.type() == "object" && exists(@.cueSeconds))') as cues(value);
    if max_cue+1.5>available then raise exception 'INVALID_PRESENTATION'; end if;
  end if;
  if envelope->>'templateId'='chapter-recap' then
    -- Lock all referenced scene rows before checking links/order, preventing a concurrent reorder/delete crossing this write.
    perform 1 from public.scenes s where s.project_id=new.project_id and s.id in (select (value->>'sceneId')::uuid from jsonb_array_elements(envelope#>'{content,items}')) order by s.id for share;
    for item in select value from jsonb_array_elements(envelope#>'{content,items}') loop
      select * into source_scene from public.scenes s where s.project_id=new.project_id and s.id=(item->>'sceneId')::uuid;
      if not found or (to_jsonb(source_scene)->>'media_id') is distinct from item#>>'{image,asset,mediaId}' or tg_table_name='overlay_clips' and (current_sequence is null or (to_jsonb(source_scene)->>'sequence_number')::numeric is null or (to_jsonb(source_scene)->>'sequence_number')::numeric>=current_sequence) then raise exception 'RECAP_REFERENCE_INVALID'; end if;
    end loop;
  end if;
  return new;
end $$;
revoke all on function public.guard_phase5_references() from public;
drop trigger if exists phase5_overlay_references on public.overlay_clips;
create trigger phase5_overlay_references before insert or update on public.overlay_clips for each row when (new.kind='scene-template') execute function public.guard_phase5_references();
drop trigger if exists phase5_evidence_references on public.presentation_evidence;
create trigger phase5_evidence_references before insert or update on public.presentation_evidence for each row execute function public.guard_phase5_references();

-- Call the original owned snapshot directly, then pin registry revision 3. No wrapper chains on reruns.
create or replace function public.presentation_suggestion_snapshot(p_project uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare snapshot jsonb; inputs jsonb;
begin
  snapshot:=public.presentation_suggestion_snapshot_phase3(p_project);
  inputs:=jsonb_set(snapshot->'inputs','{registryVersion}','3');
  return snapshot||jsonb_build_object('inputs',inputs,'inputHash',md5(inputs::text));
end $$;
revoke all on function public.presentation_suggestion_snapshot(uuid) from public;
grant execute on function public.presentation_suggestion_snapshot(uuid) to authenticated;

-- Visuals CAS is appended from the reviewed Phase 4 implementation, changing only the allowlist bounds.
create or replace function public.mutate_presentation_visuals(p_scope text,p_id uuid,p_expected_revision integer,p_settings jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare current_revision integer; blueprint jsonb; visual jsonb; next_revision integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not coalesce(p_settings->>'version'='1' and p_settings->>'themeVersion'='2' and p_settings->>'themeId' in ('dark-documentary','parchment-archive') and p_settings->>'motionIntensity' in ('calm','standard','expressive') and p_settings->>'background' in ('plain','grid','paper','halo') and p_settings->>'density' in ('spacious','compact') and p_settings->>'dateConvention' in ('BCE/CE','BC/AD') and p_settings->>'cleanPreference' in ('balanced','clean-first','graphics-rich'),false) then raise exception 'INVALID_VISUALS'; end if;
  if exists(select 1 from jsonb_object_keys(p_settings) key where key not in ('version','themeVersion','themeId','motionIntensity','background','density','dateConvention','cleanPreference','accent','allowedFamilies')) then raise exception 'INVALID_VISUALS'; end if;
  if p_settings ? 'accent' and p_settings->>'accent' !~ '^#[0-9a-fA-F]{6}$' then raise exception 'INVALID_VISUALS'; end if;
  if jsonb_typeof(p_settings->'allowedFamilies') is distinct from 'array' or jsonb_array_length(p_settings->'allowedFamilies') > 24 then raise exception 'INVALID_VISUALS'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_settings->'allowedFamilies') id where id not in ('historical-timeline','person-introduction','image-comparison','archival-explainer','map-locator','artifact-spotlight','detail-annotation','manuscript-highlight','text-translation','relationship-diagram','cause-effect','scale-comparison','fact-reveal','claim-evidence','journey-map','territory-change','then-now','layered-parallax','structure-cutaway','manuscript-comparison','evidence-board','animated-chart','competing-explanations','chapter-recap')) then raise exception 'INVALID_VISUALS'; end if;
  if (select count(distinct id) from jsonb_array_elements_text(p_settings->'allowedFamilies') id) <> jsonb_array_length(p_settings->'allowedFamilies') then raise exception 'INVALID_VISUALS'; end if;
  if p_scope='workspace' then
    select coalesce(format_blueprint_version,0),coalesce(format_blueprint,'{}') into current_revision,blueprint from public.workspaces where id=p_id and user_id=auth.uid() for update;
    if not found then raise exception 'OWNERSHIP_REQUIRED'; end if;
    if p_expected_revision is distinct from current_revision then raise exception 'REVISION_CONFLICT'; end if;
    next_revision := current_revision+1;
    visual := coalesce(blueprint->'visual','{}') || jsonb_build_object('presentation',p_settings);
    update public.workspaces set format_blueprint=blueprint || jsonb_build_object('visual',visual),format_blueprint_version=next_revision where id=p_id;
  elsif p_scope='project' then
    select p.presentation_visual_revision into current_revision from public.video_projects p join public.workspaces w on w.id=p.workspace_id where p.id=p_id and w.user_id=auth.uid() for update of p;
    if not found then raise exception 'OWNERSHIP_REQUIRED'; end if;
    if p_expected_revision is distinct from current_revision then raise exception 'REVISION_CONFLICT'; end if;
    next_revision := current_revision+1;
    update public.video_projects set presentation_visual_settings=p_settings,presentation_visual_revision=next_revision where id=p_id;
  else raise exception 'INVALID_VISUALS'; end if;
  return jsonb_build_object('settings',p_settings,'revision',next_revision);
end $$;
revoke all on function public.mutate_presentation_visuals(text,uuid,integer,jsonb) from public;
grant execute on function public.mutate_presentation_visuals(text,uuid,integer,jsonb) to authenticated;
commit;
