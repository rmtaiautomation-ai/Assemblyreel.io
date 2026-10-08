// Read-only pixel comparison of two local render artifacts using Chromium's PNG decoder.
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { openBrowser } from '@remotion/renderer';
const root=path.resolve('out')+path.sep;
const paths=process.argv.slice(2).map(file=>path.resolve(file));
if(paths.length!==2||paths.some(file=>!file.startsWith(root)||!file.endsWith('.png')))throw Error('Provide two PNG files within out/.');
const data=await Promise.all(paths.map(async file=>`data:image/png;base64,${(await readFile(file)).toString('base64')}`));
const browser=await openBrowser('chrome');
try{
 const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:0,onBrowserLog:()=>{},onLog:()=>{}});
 const result=await page.evaluate(async urls=>{
  const images=await Promise.all(urls.map(url=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=url;})));
  if(images[0].width!==images[1].width||images[0].height!==images[1].height)throw Error('Image dimensions differ');
  const width=images[0].width,height=images[0].height,pixels=images.map(image=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');context.drawImage(image,0,0);return context.getImageData(0,0,width,height).data;});
  let channels=0,changedPixels=0,maxDelta=0;for(let i=0;i<pixels[0].length;i+=4){let changed=false;for(let c=0;c<4;c++){const delta=Math.abs(pixels[0][i+c]-pixels[1][i+c]);if(delta){channels++;changed=true;maxDelta=Math.max(maxDelta,delta);}}if(changed)changedPixels++;}
  return {width,height,channels,changedPixels,maxDelta,totalChannelValues:pixels[0].length};
 },data);console.log(JSON.stringify(result));
}finally{await browser.close({silent:true});}
