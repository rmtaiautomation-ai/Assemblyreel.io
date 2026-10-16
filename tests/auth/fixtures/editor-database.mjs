import { readFile } from 'node:fs/promises';
import { fixture } from './owned-database.mjs';

export const editorActorA='10000000-0000-4000-8000-000000000001';
export const editorActorB='10000000-0000-4000-8000-000000000002';
export const editorId=n=>`e0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export function emptyDocument() {
  return {scenes:[],items:[],settings:{captions_enabled:false,track_states:Object.fromEntries(['V1','A1','A2'].map(id=>[id,{locked:false,muted:false,volume:1}]))}};
}
export async function editorFixture() {
  const db=await fixture();
  await db.exec(`alter table public.video_projects add track_states jsonb,add captions_enabled boolean;
    alter table public.scenes add sequence_number integer not null default 1,add voice_over_beat text not null default '',
      add final_video_prompt text not null default '',add video_duration numeric default 5,add trim_start numeric default 0;
    alter table public.media add status text default 'ready',add duration_seconds numeric;
    alter table public.timeline_items add track_id text not null default 'A1',add start_time numeric not null default 0,
      add duration numeric not null default 5,add trim_start numeric not null default 0;`);
  await db.exec(await readFile(new URL('../../../db/auth/existing-project/004-owned-records-text-projects.sql',import.meta.url),'utf8'));
  await db.exec('create schema account_ownership_backup_20261014');
  await db.exec(await readFile(new URL('../../../db/auth/existing-project/008-owned-draft-editor.sql',import.meta.url),'utf8'));
  async function actor(user=editorActorA,anonymous=false) {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[user,JSON.stringify({sub:user,is_anonymous:anonymous})]);
    await db.exec('set role authenticated');
  }
  await actor();
  await db.query('select public.create_owned_workspace($1,$2)',[{name:'Editor A',content_theme:'Manual'},editorId(1)]);
  await db.query('select public.create_owned_project($1,$2)',[{workspace_id:editorId(1),topic:'Draft A'},editorId(2)]);
  await actor(editorActorB);
  await db.query('select public.create_owned_workspace($1,$2)',[{name:'Editor B',content_theme:'Manual'},editorId(3)]);
  await db.query('select public.create_owned_project($1,$2)',[{workspace_id:editorId(3),topic:'Draft B'},editorId(4)]);
  await db.exec('reset role');
  await db.query("insert into public.media(id,project_id,media_type,status,duration_seconds) values($1,$2,'audio','ready',20),($3,$4,'audio','ready',20)",[editorId(5),editorId(2),editorId(6),editorId(4)]);
  await actor();
  return {db,actor,
    async read(project=editorId(2)) {return (await db.query('select public.read_owned_editor($1) value',[project])).rows[0].value;},
    async save(document,revision=0,operation=editorId(10),project=editorId(2)) {
      return (await db.query('select public.save_owned_editor($1,$2,$3,$4) value',[project,revision,operation,document])).rows[0].value;
    },
    async close(){await db.close();}};
}
