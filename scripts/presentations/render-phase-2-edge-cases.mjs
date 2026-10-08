import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { openBrowser,renderStill,selectComposition } from '@remotion/renderer';
import { familyFixture,assets,projectId } from '../../tests/presentations/phase-2-fixtures.mjs';
import { loadSource } from '../../tests/presentations/load-source.mjs';
const label=process.argv[2];if(!label||!/^[a-z0-9-]+$/.test(label))throw Error('Provide a fresh label.');
const output=path.resolve('out/presentations-phase-2',label);await mkdir(path.dirname(output),{recursive:true});await mkdir(output);
const publicDir=path.join(output,'empty-public');await mkdir(publicDir);const serveUrl=await bundle({entryPoint:path.resolve('src/remotion/index.ts'),outDir:path.join(output,'bundle'),publicDir});
const { resolvePresentation }=await loadSource(new URL('../../src/lib/presentations/compiler.ts',import.meta.url));
const { presentationImages }=await loadSource(new URL('../../src/lib/presentations/content.ts',import.meta.url));
const svg=await Promise.all(['a','b'].map(async id=>`data:image/svg+xml;base64,${Buffer.from(await readFile(new URL(`../../tests/presentations/assets/comparison-${id}.svg`,import.meta.url))).toString('base64')}`));
const cases=[];
for(const [script,original,direction]of [['hebrew','בְּרֵאשִׁית','rtl'],['syriac','ܐܒܓܕ','rtl'],['ethiopic','ሀሁሂሃሄ','ltr'],['cuneiform','𒀀𒀁𒀂𒀃','ltr'],['latin','A supplied phrase','ltr']]){const data=familyFixture('text-translation');Object.assign(data.content,{script,original,direction,language:`${script} glyph sample`,translation:'Authored glyph fixture; not a verified translation.'});cases.push({name:`font-${script}`,data});}
for(const layout of ['chain','hub','tree']){
 const data=familyFixture('relationship-diagram'),source=data.content.edges[0].source;
 data.content.layout=layout;data.content.nodes=Array.from({length:6},(_,i)=>({id:`70000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,label:`Node ${i+1}`,image:null}));
 data.content.edges=Array.from({length:5},(_,i)=>({id:`71000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,from:data.content.nodes[layout==='chain'?i:layout==='hub'?0:i<3?0:1].id,to:data.content.nodes[i+1].id,label:`Link ${i+1}`,type:i===0?'influence':'tradition',source,cueSeconds:i*.3}));
 cases.push({name:`six-node-${layout}`,data});
}
const portrait=familyFixture('person-introduction');portrait.content.side='right';portrait.content.treatment='cutout';portrait.content.name='A longer supplied researcher name';portrait.content.role='Researcher in comparative manuscript traditions';cases.push({name:'long-person-mirrored',data:portrait});
const regions=familyFixture('detail-annotation');regions.content.regions=[{...regions.content.regions[0],x:.1,y:.15,width:.35,height:.5,label:'Left detail'},{...regions.content.regions[0],id:'72000000-0000-4000-8000-000000000001',x:.55,y:.2,width:.35,height:.5,label:'Right detail',cueSeconds:2}];cases.push({name:'two-regions-source-space',data:regions});
const map=familyFixture('map-locator');map.content.viewport={west:37,east:51,south:27,north:40};cases.push({name:'map-authored-zoom',data:map});
const time=familyFixture('historical-timeline');time.content.spacing='proportional';time.content.events[0].date={display:'100 BCE',year:-100,endYear:null,approximate:false};time.content.events[1].date={display:'100 CE',year:100,endYear:null,approximate:false};cases.push({name:'timeline-bce-ce',data:time});
const quote=familyFixture('archival-explainer');quote.content.textKind='quotation';quote.content.body='The same phrase appears twice: same phrase.';quote.content.highlights=[{start:31,end:42,cueSeconds:1}];cases.push({name:'exact-second-occurrence',data:quote});
const excessive=familyFixture('archival-explainer');excessive.content.body='W'.repeat(550);excessive.content.highlights=[];cases.push({name:'overflow-copy',data:excessive,reject:/Documentary text does not fit/});
const tiny=familyFixture('detail-annotation');cases.push({name:'insufficient-source-resolution',data:tiny,reject:/fewer than 60 source pixels/,tiny:true});
const captures=[],rejections=[],errors=[],browser=await openBrowser('chrome');
try{
 for(const item of cases)for(const [ratio,width,height]of [['landscape',1920,1080],['portrait',1080,1920],['square',1080,1080]]){
  const result=resolvePresentation(item.data,{start_time:0,duration:30,duration_mode:'scene-remainder'},30,30,assets,projectId);assert.ok(result.presentation,result.issues.join(' '));
  const images=presentationImages(item.data),presentation={...result.presentation,assets:result.presentation.assets.map(asset=>({...asset,url:item.tiny?`data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="tan"/></svg>').toString('base64')}`:svg[assets.findIndex(media=>media.id===images.find(image=>image.id===asset.itemId)?.asset.mediaId)]??svg[0]}))};
  const props={fps:30,width,height,showCaptions:true,captionWords:[{text:'Caption safe area',startMs:0,endMs:30000}],scenes:[{id:item.name,durationInSeconds:30,trimStartInSeconds:0,mediaUrl:'',mediaType:'image',presentation}]};
  const composition=await selectComposition({serveUrl,id:'MainVideo-Documentary-v2',inputProps:props,puppeteerInstance:browser});
  const name=`${item.name}-${ratio}`,render=()=>renderStill({serveUrl,composition,inputProps:props,puppeteerInstance:browser,frame:90,output:path.join(output,`${name}.png`),scale:.5,onBrowserLog:log=>{if(!item.reject&&log.type==='error')errors.push(log.text);}});
  if(item.reject){await assert.rejects(render,item.reject);rejections.push(name);}else{await render();captures.push(name);}console.log(`Verified ${name}`);
 }
}finally{await browser.close({silent:true});}
assert.deepEqual(errors,[]);await writeFile(path.join(output,'report.json'),JSON.stringify({captures,rejections,errors},null,2));console.log(JSON.stringify({stills:captures.length,expectedRejections:rejections.length,errors}));
