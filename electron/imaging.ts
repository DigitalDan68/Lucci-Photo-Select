import fs from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import sharp from 'sharp'
import * as tf from '@tensorflow/tfjs'
import {BlazeFaceModel} from '@tensorflow-models/blazeface'
import exifr from 'exifr'

let detector:Promise<BlazeFaceModel>|undefined
async function facesModel(){return detector??= (async()=>{
  await tf.setBackend('cpu');await tf.ready()
  const dir=path.join(__dirname,'../models/face'),j=JSON.parse(await fs.readFile(path.join(dir,'model.json'),'utf8'))
  const weights=Buffer.concat(await Promise.all(j.weightsManifest.flatMap((g:any)=>g.paths.map((p:string)=>fs.readFile(path.join(dir,p))))))
  const graph=await tf.loadGraphModel(tf.io.fromMemory({modelTopology:j.modelTopology,weightSpecs:j.weightsManifest.flatMap((g:any)=>g.weights),weightData:weights.buffer.slice(weights.byteOffset,weights.byteOffset+weights.byteLength)}))
  return new BlazeFaceModel(graph,128,128,15,.3,.85)
})()}
const clamp=(v:number)=>Math.min(1,Math.max(0,v))
const median=(a:number[])=>a.length?a.sort((x,y)=>x-y)[Math.floor(a.length/2)]:0
function region(g:Uint8Array,w:number,h:number,x:number,y:number,rw:number,rh:number){let sum=0,n=0;for(let yy=Math.max(1,Math.floor(y));yy<Math.min(h-1,y+rh);yy++)for(let xx=Math.max(1,Math.floor(x));xx<Math.min(w-1,x+rw);xx++){const i=yy*w+xx,l=4*g[i]-g[i-1]-g[i+1]-g[i-w]-g[i+w];sum+=l*l;n++}return n?sum/n:0}
export async function analyze(file:string,preview:string){
  const oriented=await sharp(file).rotate().removeAlpha().toColourspace('srgb').toBuffer()
  const meta=await sharp(oriented).metadata();const {data:g,info}=await sharp(oriented).resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).greyscale().raw().toBuffer({resolveWithObject:true});const w=info.width,h=info.height
  const rgb=await sharp(oriented).resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).raw().toBuffer({resolveWithObject:true})
  const tensor=tf.tensor3d(new Uint8Array(rgb.data),[rgb.info.height,rgb.info.width,3],'int32')
  let faces:any[]=[];const notes:string[]=[]
  try{faces=await(await facesModel()).estimateFaces(tensor,false)}catch{notes.push('Face detection unavailable; regional focus used.')}finally{tensor.dispose()}
  const sx=w/rgb.info.width,sy=h/rgb.info.height
  const center=region(g,w,h,w*.2,h*.2,w*.6,h*.6),eyeValues:number[]=[];let edgeCut=0
  for(const f of faces){const [x,y]=f.topLeft as number[],[x2,y2]=f.bottomRight as number[];if(x<4||y<4||x2>rgb.info.width-4||y2>rgb.info.height-4)edgeCut++
    for(const [ex,ey] of (f.landmarks as number[][]||[]).slice(0,2)){const size=Math.max(8,(x2-x)*sx*.22);eyeValues.push(region(g,w,h,ex*sx-size/2,ey*sy-size/2,size,size))}}
  const focus=clamp(Math.log1p(eyeValues.length?median(eyeValues):center)/Math.log(1201))
  let dark=0,bright=0,total=0;const residuals:number[]=[]
  for(let y=2;y<h-2;y+=2)for(let x=2;x<w-2;x+=2){const i=y*w+x,v=g[i];total++;if(v<7)dark++;if(v>248)bright++
    const gradient=Math.abs(g[i-2]-g[i+2])+Math.abs(g[i-2*w]-g[i+2*w]);if(gradient<14&&v>15&&v<235)residuals.push(Math.abs(v-(g[i-1]+g[i+1]+g[i-w]+g[i+w])/4))}
  const noiseSigma=median(residuals)/.754;const noise=clamp(noiseSigma/12),exposure=clamp(1-(dark/total)*1.1-(bright/total)*3)
  // Framing is a measured crop-risk indicator, not an aesthetic judgment.
  const framing=faces.length?clamp(1-edgeCut/faces.length):undefined
  const score=1+4*clamp(focus*.65+exposure*.2+(1-noise)*.15-(framing===undefined?0:(1-framing)*.12))
  notes.push(eyeValues.length?'Focus measured around detected eyes.':'No reliable face found; central-region focus used.')
  if(noise>.4)notes.push('Visible noise estimated in flat areas; inspect at 100%.')
  if(bright/total>.05)notes.push('Clipped highlights detected.')
  if(edgeCut)notes.push('A detected face meets the frame edge.')
  if(framing===undefined)notes.push('Framing needs visual review.')
  let exif:any={};try{exif=await exifr.parse(file)||{}}catch{}
  const signature=Array.from(await sharp(oriented).resize(16,16,{fit:'fill'}).greyscale().raw().toBuffer())
  await sharp(oriented).resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).jpeg({quality:88}).toFile(preview)
  return {width:meta.width||w,height:meta.height||h,score:+score.toFixed(2),stars:Math.round(score),sharpness:focus*5,exposure:exposure*5,noise:noise*5,framing:framing===undefined?-1:framing*5,eyeSharpness:eyeValues.length?focus*5:undefined,faceCount:faces.length,ratingNotes:notes,ratingVersion:2,signature,capturedAt:exif.DateTimeOriginal instanceof Date?exif.DateTimeOriginal.toISOString():undefined,camera:exif.Model,lens:exif.LensModel,iso:exif.ISO}
}
export async function decodeRaw(file:string,out:string){
  const root=path.dirname(require.resolve('libraw-wasm'))
  const create=(await import(pathToFileURL(path.join(root,'libraw.js')).href)).default
  const m=await create({wasmBinary:await fs.readFile(path.join(root,'libraw.wasm'))})
  const raw=new m.LibRaw()
  try{raw.open(new Uint8Array(await fs.readFile(file)),{useCameraWb:true,outputColor:1,outputBps:8,halfSize:false,userQual:3});const metadata=raw.metadata();const p=raw.imageData()
    if(!p.data?.length||p.bits!==8||p.colors!==3)throw new Error('Unsupported decoded RAW pixel format')
    await sharp(Buffer.from(p.data),{raw:{width:p.width,height:p.height,channels:3}}).png().toFile(out)
    return{width:p.width,height:p.height,camera:metadata.camera_model,capturedAt:metadata.timestamp?new Date(metadata.timestamp*1000).toISOString():undefined}
  }finally{raw.delete?.()}
}
export async function embeddedPreview(file:string,out:string){const bytes=await fs.readFile(file),soi=Buffer.from([255,216,255]),eoi=Buffer.from([255,217]);let cursor=0,best:Buffer|undefined
  while(cursor<bytes.length){const start=bytes.indexOf(soi,cursor);if(start<0)break;const end=bytes.indexOf(eoi,start+3);if(end<0)break;const b=bytes.subarray(start,end+2);if(b.length>50000&&(!best||b.length>best.length)){try{await sharp(b).metadata();best=b}catch{}}cursor=end+2}
  if(!best)throw new Error('No camera preview');await fs.writeFile(out,best)
}
