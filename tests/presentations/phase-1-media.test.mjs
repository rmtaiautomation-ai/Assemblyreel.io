import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from './load-source.mjs';
import { envelope, assets, projectId, timing } from './phase-1-fixtures.mjs';

const configUrl = 'data:text/javascript,export function getLambdaConfig(){return {region:"us-east-1",functionName:"fixture-only",bucketName:"fixture-only",serveUrl:"https://fixture.example"}}';
const { resolvePresentation } = await loadSource(new URL('../../src/lib/presentations/compiler.ts', import.meta.url));
const { syncPayloadMediaToS3 } = await loadSource(new URL('../../src/server/rendering/s3-sync.ts', import.meta.url), { './lambda-config': configUrl });
const lambdaIo = `data:text/javascript,${encodeURIComponent('export const calls=[]; export async function renderMediaOnLambda(args){calls.push(args); return {renderId:"fixture-only",bucketName:"fixture-only"}} export async function getRenderProgress(){throw new Error("Not a progress test")}')}`;
const io = await import(lambdaIo);
const { startLambdaRender } = await loadSource(new URL('../../src/server/rendering/lambda-render.ts', import.meta.url), { './lambda-config': configUrl, '@remotion/lambda/client': lambdaIo });

test('the actual cloud preparation traverses nested image slots using the existing media URL mapper', async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.supabase.co';
  try {
    const presentation = resolvePresentation(envelope, timing, 6, 30, assets, projectId).presentation;
    const payload = { projectId, scenes: [{ id: 'fixture', mediaUrl: '/media/base.svg', presentation }], audioClips: [], audioUrl: '/audio/fixture.mp3' };
    const result = await syncPayloadMediaToS3(payload, 'https://app.example');
    assert.equal(result.scenes[0].presentation.assets[0].url, 'https://fixture.supabase.co/storage/v1/object/public/project-media/fixture-1.svg');
    assert.equal(result.scenes[0].mediaUrl, 'https://fixture.supabase.co/storage/v1/object/public/project-media/base.svg');
    assert.equal(result.audioUrl, 'https://fixture.supabase.co/storage/v1/object/public/project-media/audio/fixture.mp3');
    assert.equal(payload.scenes[0].presentation.assets[0].url, '/media/fixture-1.svg');
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
  }
});

test('the actual Lambda submission selects the required composition without making an AWS request', async () => {
  await startLambdaRender({ scenes: [{ presentation: { envelope } }] });
  assert.equal(io.calls.at(-1).composition, 'MainVideo-Documentary-v1');
  await startLambdaRender({ scenes: [{ presentation: { envelope: { ...envelope,theme: { ...envelope.theme,version: 2 } } } }] });
  assert.equal(io.calls.at(-1).composition, 'MainVideo-Documentary-v2');
  await startLambdaRender({ scenes: [{ id: 'legacy' }] });
  assert.equal(io.calls.at(-1).composition, 'MainVideo');
  assert.equal(io.calls.at(-1).serveUrl, 'https://fixture.example');
});
