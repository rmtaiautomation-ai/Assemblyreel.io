import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { fingerprintSQL, fingerprintJSON } from '../../scripts/auth/ownership-fingerprint.mjs';

test('compact fingerprints match JSONB numeric equality without losing strings, keys or array order',async()=>{
  const db=new PGlite();
  try {
    await db.exec(fingerprintSQL);
    const hash=async value=>(await db.query('select pg_temp.ownership_fingerprint($1::jsonb) value',[value])).rows[0].value;
    const equalPairs=[['{"a":1.00,"nested":[0.000,-0.0,2e2]}','{"nested":[0,0,200.0],"a":1}'],
      ['{"n":12345678901234567890.1200}','{"n":12345678901234567890.12}'],['{}','{}'],['[]','[]']];
    for(const [a,b] of equalPairs)assert.equal(await hash(a),await hash(b));
    const distinctPairs=[['[1,2]','[2,1]'],['{"a":null}','{}'],['{"a":true}','{"a":1}'],
      ['{"a":"1.00"}','{"a":"1"}'],['{"a":1.0001}','{"a":1.0002}'],
      ['{"a":"é"}','{"a":"e"}'],['null','"null"'],['{"a":1}','{"b":1}']];
    for(const [a,b] of distinctPairs)assert.notEqual(await hash(a),await hash(b));
    const canonical=(await db.query("select pg_temp.ownership_canonical($1::jsonb)::text value",['{"a":1.00}'])).rows[0].value;
    assert.equal(await hash('{"a":1.00}'),createHash('sha256').update(canonical,'utf8').digest('hex'));
    const generated=await fingerprintJSON({review:{a:1}});
    assert.equal(generated.review,await hash('{"a":1.00}'));
  }finally{await db.close();}
});

test('temporary reviewed catalog enables RLS and revokes inherited public and browser grants',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;
      alter default privileges grant all on tables to public,anon,authenticated,service_role;
      begin;`);
    await db.exec(fingerprintSQL);
    const rls=(await db.query("select relrowsecurity value from pg_class where oid='pg_temp.ownership_reviewed_catalog'::regclass")).rows[0].value;
    assert.equal(rls,true);
    for(const role of ['anon','authenticated','service_role']){
      assert.equal((await db.query("select has_table_privilege($1,'pg_temp.ownership_reviewed_catalog','SELECT') value",[role])).rows[0].value,false);
    }
    await db.exec("insert into pg_temp.ownership_reviewed_catalog values('{}');set local role authenticated");
    await assert.rejects(db.query('select * from pg_temp.ownership_reviewed_catalog'),error=>error.code==='42501');
    // The denied statement aborts the transaction; rollback also removes the temp table.
    await db.exec('rollback');
    assert.equal((await db.query("select to_regclass('pg_temp.ownership_reviewed_catalog') value")).rows[0].value,null);
  }finally{await db.close();}
});
