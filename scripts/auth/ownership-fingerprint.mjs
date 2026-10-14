import { PGlite } from '@electric-sql/pglite';

// PostgreSQL JSONB compares numerically equal values despite decimal scale.
// Normalize that scale before SHA-256 so 1.00 and 1 produce the same guard.
// Preserve string contents, nulls, booleans, object keys and array order.
export const fingerprintSQL = `
create temp table pg_temp.ownership_reviewed_catalog(data jsonb) on commit drop;
alter table pg_temp.ownership_reviewed_catalog enable row level security;
revoke all on pg_temp.ownership_reviewed_catalog from public;
do $$declare role_name text; begin
  foreach role_name in array array['anon','authenticated','service_role'] loop
    if exists(select 1 from pg_catalog.pg_roles where rolname=role_name) then
      execute pg_catalog.format('revoke all on pg_temp.ownership_reviewed_catalog from %I',role_name);
    end if;
  end loop;
end $$;
create or replace function pg_temp.ownership_canonical(value jsonb) returns jsonb
language plpgsql immutable strict set search_path='' as $$
declare result jsonb; begin
  case pg_catalog.jsonb_typeof(value)
    when 'number' then return pg_catalog.to_jsonb(pg_catalog.trim_scale((value#>>'{}')::numeric));
    when 'array' then
      select coalesce(pg_catalog.jsonb_agg(pg_temp.ownership_canonical(item) order by position),'[]'::jsonb)
        into result from pg_catalog.jsonb_array_elements(value) with ordinality as items(item,position);
      return result;
    when 'object' then
      select coalesce(pg_catalog.jsonb_object_agg(key,pg_temp.ownership_canonical(item)),'{}'::jsonb)
        into result from pg_catalog.jsonb_each(value) as items(key,item);
      return result;
    else return value;
  end case;
end $$;
create or replace function pg_temp.ownership_fingerprint(value jsonb) returns text
language sql immutable strict set search_path='' as $$
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_temp.ownership_canonical(value)::text,'UTF8')),'hex')
$$;
revoke all on function pg_temp.ownership_canonical(jsonb),pg_temp.ownership_fingerprint(jsonb) from public;
`;

export async function fingerprintJSON(values) {
  const db = new PGlite();
  try {
    await db.exec(fingerprintSQL);
    return Object.fromEntries(await Promise.all(Object.entries(values).map(async ([name,value]) => {
      const result=await db.query('select pg_temp.ownership_fingerprint($1::jsonb) as hash',[JSON.stringify(value)]);
      return [name,result.rows[0].hash];
    })));
  } finally { await db.close(); }
}
