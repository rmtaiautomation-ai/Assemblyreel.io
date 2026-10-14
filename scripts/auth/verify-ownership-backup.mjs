// Offline integrity and application-row replay. Does not restore remote data.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { verifyFiles } from './backup-ownership.mjs';

const root = resolve('scratch/account-backups');
const directory = resolve(process.argv[2] ?? '');
const within = relative(root,directory);
if (!within || within.startsWith('..') || isAbsolute(within)) throw new Error('Choose one backup directory inside scratch/account-backups.');
const bytes = await readFile(resolve(directory,'manifest.json'));
const manifest = JSON.parse(bytes);
const receipt = (await readFile(resolve(directory,'receipt.sha256'),'utf8')).trim().split(/\s+/)[0];
if (!manifest.complete || manifest.projectRef !== 'qgghjpfnbcktctbakuam' ||
    createHash('sha256').update(bytes).digest('hex') !== receipt) throw new Error('Completed matching backup receipt required.');
await verifyFiles(directory,manifest.files);
const schema = JSON.parse(await readFile(resolve(directory,'api-schema.json'),'utf8'));
const allowedTypes = new Set(['uuid','text','integer','numeric','boolean','jsonb','timestamp with time zone']);
const identifier = name => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error('Unexpected exported identifier.');
  return `"${name}"`;
};
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])]));
  return value;
};
const checks = [{name:'Manifest receipt and all saved file sizes/hashes',passed:true}];
const db = new PGlite();
try {
  // Match the source API's UTC serialization; PGlite otherwise uses the local timezone.
  await db.exec("set timezone='UTC'");
  for (const table of manifest.tables) {
    const definition = schema.definitions[table.name];
    const columns = Object.entries(definition.properties).map(([name,column]) => {
      const type = column.format ?? column.type;
      if (!allowedTypes.has(type)) throw new Error('Exported type needs explicit replay review.');
      return `${identifier(name)} ${type}${definition.required?.includes(name) ? ' not null' : ''}`;
    });
    await db.exec(`create table ${identifier(table.name)}(${columns.join(',')},primary key(id))`);
    const rows = JSON.parse(await readFile(resolve(directory,`${table.name}.json`),'utf8'));
    await db.query(`insert into ${identifier(table.name)} select * from jsonb_populate_recordset(null::${identifier(table.name)},$1)`,[rows]);
    const restored = (await db.query(`select to_jsonb(t) as row from ${identifier(table.name)} t order by id`)).rows.map(result => result.row);
    const passed = rows.length === table.rows && JSON.stringify(canonical(restored)) === JSON.stringify(canonical(rows));
    checks.push({name:`Typed offline value replay: ${table.name}`,passed,rows:rows.length});
    console.log(`${passed ? 'PASS' : 'FAIL'}: offline ${table.name} replay (${rows.length} rows).`);
  }
} finally { await db.close(); }
const report = {checkedAt:new Date().toISOString(),manifestReceipt:receipt,checks,
  scope:'Local file integrity and exact application-row values replayed using API column types; not full DDL/Auth restore or remote recovery.'};
await writeFile(resolve(directory,'offline-verification.json'),JSON.stringify(report,null,2));
process.exitCode = checks.every(check => check.passed) ? 0 : 1;
console.log(`${process.exitCode === 0 ? 'PASS' : 'FAIL'}: offline backup verification.`);
