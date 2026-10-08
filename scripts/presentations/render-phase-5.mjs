import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { familyFixture, maximumFixture, assets, projectId, sceneId, references } from '../../tests/presentations/phase-5-fixtures.mjs';
import { loadSource } from '../../tests/presentations/load-source.mjs';
const label=process.argv[2]; if(!label||!/^[a-z0-9-]+$/.test(label))throw Error('Provide a fresh lowercase artifact label.');
const output=path.resolve('out/presentations-phase-5',label);await mkdir(path.dirname(output),{recursive:true});await mkdir(output);
const publicDir=path.join(output,'empty-public');await mkdir(publicDir);
const started=performance.now(),serveUrl=await bundle({entryPoint:path.resolve('src/remotion/index.ts'),outDir:path.join(output,'bundle'),publicDir});
const {resolvePresentation}=await loadSource(new URL('../../src/lib/presentations/compiler.ts',import.meta.url));
const {PHASE_5_FAMILIES,presentationCompositionId}=await loadSource(new URL('../../src/lib/presentations/registry.ts',import.meta.url));
const {presentationImages}=await loadSource(new URL('../../src/lib/presentations/content.ts',import.meta.url));
const svg=await Promise.all(['comparison-a','comparison-b','parallax-foreground'].map(async name=>`data:image/svg+xml;base64,${Buffer.from(await readFile(new URL(`../../tests/presentations/assets/${name}.svg`,import.meta.url))).toString('base64')}`));
const browser=await openBrowser('chrome'),captures=[],videos=[],expectedRejections=[],failures=[],errors=[],costs=[];
const ratios=[['landscape',1920,1080],['portrait',1080,1920],['square',1080,1080]];
function propsFor(fixture,width,height,fps=30,duration=30){
  const refs=fixture.templateId==='chapter-recap'?fixture.content.items.map((item,i)=>({id:item.sceneId,sequence:i+1,mediaId:item.image.asset.mediaId})).concat([{id:sceneId,sequence:20,mediaId:null}]):references;
  const result=resolvePresentation(fixture,{start_time:0,duration,duration_mode:'scene-remainder'},duration,fps,assets,projectId,{sceneId,scenes:refs});
  if(!result.presentation)throw Error(result.issues.join(' '));
  const images=presentationImages(fixture),presentation={...result.presentation,assets:result.presentation.assets.map(asset=>({...asset,url:svg[assets.findIndex(item=>item.id===images.find(image=>image.id===asset.itemId)?.asset.mediaId)]}))};
  return {fps,width,height,scenes:[{id:sceneId,durationInSeconds:duration,trimStartInSeconds:0,mediaType:'image',mediaUrl:'',presentation}],showCaptions:true,captionWords:[{text:'Caption safe area',startMs:0,endMs:duration*1000}]};
}
async function capture(fixture,theme,ratio,width,height,name,frames=[8,240,895],fps=30,duration=30){
  fixture.theme.id=theme;const props=propsFor(fixture,width,height,fps,duration),id=presentationCompositionId(props.scenes);assert.equal(id,'MainVideo-Documentary-v4');
  const composition=await selectComposition({serveUrl,id,inputProps:props,puppeteerInstance:browser});
  for(const frame of frames){const began=performance.now();await renderStill({serveUrl,composition,inputProps:props,puppeteerInstance:browser,frame,output:path.join(output,`${name}-${frame}.png`),scale:.4,onBrowserLog:log=>{if(log.type==='error')errors.push(`${name}: ${log.text}`);}});captures.push(`${name}-${frame}`);costs.push({family:fixture.templateId,ratio,fps,kind:'still',frame,elapsedMs:Math.round(performance.now()-began)});}
  return {props,composition};
}
try{
  for(const id of PHASE_5_FAMILIES)for(const theme of ['dark-documentary','parchment-archive'])for(const [ratio,width,height]of ratios){
    const name=`${id}-${theme}-${ratio}`;
    try{const {props,composition}=await capture(familyFixture(id),theme,ratio,width,height,name);
      if(theme==='dark-documentary'&&ratio==='landscape'){const began=performance.now();await renderMedia({serveUrl,composition,inputProps:props,puppeteerInstance:browser,codec:'h264',frameRange:[0,239],outputLocation:path.join(output,`${name}.mp4`),scale:.4,concurrency:2});videos.push(name);costs.push({family:id,ratio,fps:30,kind:'clip',renderedSeconds:8,elapsedMs:Math.round(performance.now()-began)});}
      console.log(`Verified ${name}`);
    }catch(error){failures.push({name,error:error.message});console.log(`FAILED ${name}: ${error.message.split('\n')[0]}`);}
  }
  for(const id of PHASE_5_FAMILIES)for(const [ratio,width,height]of ratios){try{await capture(maximumFixture(id),'dark-documentary',ratio,width,height,`maximum-${id}-${ratio}`,[240]);}catch(error){failures.push({name:`maximum-${id}-${ratio}`,error:error.message});}}
  const variants=[['supplied-route',()=>{const f=familyFixture('journey-map');f.content.mode='supplied-route';f.content.route=[f.content.stops[0].point,[44,33],f.content.stops[1].point];return f;}],['side-by-side',()=>{const f=familyFixture('then-now');f.content.method='side-by-side';f.content.alignmentReviewed=false;return f;}],['hebrew-passages',()=>{const f=familyFixture('manuscript-comparison');f.content.mappings=[];f.content.passages=f.content.passages.map(p=>({...p,text:'שָׁלוֹם',script:'hebrew',direction:'rtl',language:'Hebrew font sample'}));return f;}],['board-image',()=>{const f=familyFixture('evidence-board');f.content.cards[0].image=familyFixture('then-now').content.images[0];return f;}]];
  for(const [name,make]of variants)for(const [ratio,width,height]of ratios){try{await capture(make(),'parchment-archive',ratio,width,height,`${name}-${ratio}`,[240]);}catch(error){failures.push({name:`${name}-${ratio}`,error:error.message});}}
  for(const [id,frames,ratio,width,height]of [['journey-map',[30,60,90,120,150],'portrait',1080,1920],['territory-change',[45,105,165,225],'landscape',1920,1080],['structure-cutaway',[30,60,90,120],'landscape',1920,1080],['evidence-board',[30,60,90,120],'square',1080,1080],['competing-explanations',[150,450,750],'square',1080,1080]]){try{await capture(maximumFixture(id),'dark-documentary',ratio,width,height,`cue-${id}`,frames);}catch(error){failures.push({name:`cue-${id}`,error:error.message});}}
  for(const [ratio,width,height]of ratios){const f=familyFixture('animated-chart');f.content.points=f.content.points.map((point,i)=>({...point,value:i?1e12:1e-7,low:null,high:null}));try{await capture(f,'dark-documentary',ratio,width,height,`extreme-chart-${ratio}`,[240]);}catch(error){failures.push({name:`extreme-chart-${ratio}`,error:error.message});}}
  for(const fps of [24,60])for(const id of ['journey-map','then-now','animated-chart']){try{await capture(familyFixture(id),'dark-documentary','landscape',1920,1080,`${id}-${fps}fps`,[fps*3],fps);}catch(error){failures.push({name:`${id}-${fps}fps`,error:error.message});}}
  for(const [ratio,width,height]of ratios){const f=familyFixture('manuscript-comparison');f.content.mappings=[];f.content.passages[0].text='Source\n'+'\n'.repeat(140)+'End';try{await capture(f,'dark-documentary',ratio,width,height,`unsafe-newlines-${ratio}`,[240],30,120);failures.push({name:`unsafe-newlines-${ratio}`,error:'Unsafe text unexpectedly fit.'});}catch(error){if(/Documentary text does not fit/.test(error.message))expectedRejections.push(`unsafe-newlines-${ratio}`);else failures.push({name:`unsafe-newlines-${ratio}`,error:error.message});}}
  // Source-pixel safety is checked by the renderer, not fabricated by author metadata.
  const bad=familyFixture('then-now');bad.content.crops[0]={x:0,y:0,width:.01,height:.01};bad.content.method='side-by-side';
  const badLayers=familyFixture('layered-parallax');badLayers.content.layers[1].image.asset.mediaId=assets[1].id;
  try{await capture(badLayers,'dark-documentary','landscape',1920,1080,'mismatched-depth-dimensions',[240]);failures.push({name:'mismatched-depth-dimensions',error:'Unregistered layers unexpectedly passed.'});}catch(error){if(/identical source dimensions/.test(error.message))expectedRejections.push('mismatched-depth-dimensions');else failures.push({name:'mismatched-depth-dimensions',error:error.message});}
  const badWipe=familyFixture('then-now');badWipe.content.crops[1]={x:0,y:0,width:1,height:1};
  try{await capture(badWipe,'dark-documentary','landscape',1920,1080,'mismatched-wipe-ratio',[240]);failures.push({name:'mismatched-wipe-ratio',error:'Mismatched crop ratios unexpectedly passed.'});}catch(error){if(/matching aspect ratios/.test(error.message))expectedRejections.push('mismatched-wipe-ratio');else failures.push({name:'mismatched-wipe-ratio',error:error.message});}
  try{await capture(bad,'dark-documentary','landscape',1920,1080,'unsafe-tiny-crop',[240]);failures.push({name:'unsafe-tiny-crop',error:'Tiny crop unexpectedly passed.'});}catch(error){if(/60 source pixels/.test(error.message))expectedRejections.push('unsafe-tiny-crop');else failures.push({name:'unsafe-tiny-crop',error:error.message});}
}finally{await browser.close({silent:true});await writeFile(path.join(output,'report.json'),JSON.stringify({captures,videos,expectedRejections,failures,errors,costs,elapsedMs:Math.round(performance.now()-started),scope:'Local synthetic fixtures; still/clip output scale .4, two render workers. Not a production SLA or hosted cost estimate.'},null,2));}
console.log(JSON.stringify({stills:captures.length,videos:videos.length,expectedRejections,failures,errors}));if(failures.length||errors.length)process.exitCode=1;
