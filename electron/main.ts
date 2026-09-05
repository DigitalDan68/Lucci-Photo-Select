import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import sharp from 'sharp'

type Flag = 'none'|'pick'|'reject'
type Photo = { id:string; stem:string; jpegPath?:string; rawPath?:string; previewUrl:string; fullPreviewUrl?:string; width:number; height:number; capturedAt?:string; camera?:string; lens?:string; score:number; stars:number; sharpness:number; exposure:number; noise:number; framing:number; bookmarked:boolean; flag?:Flag; note:string; importedAt:string }
type Library = { name:string; source:string; cacheDir?:string; photos:Photo[]; createdAt:string }
let win: BrowserWindow | null = null
let library: Library | null = null
const imageExts=new Set(['.jpg','.jpeg']); const rawExts=['.arw','.cr2','.cr3','.nef','.raf','.orf','.rw2','.dng']
const dataDir=()=>path.join(app.getPath('userData'),'photo-library')
const dbFile=()=>path.join(dataDir(),'library.json')
const cacheRoot=()=>path.join(dataDir(),'cache')

function photoUrl(file:string){ return 'photo://local/'+encodeURIComponent(file) }
function photoPath(url:string){
  const encoded=url.startsWith('photo://local/')?url.slice('photo://local/'.length):url.slice('photo://'.length)
  return decodeURIComponent(encoded)
}

async function save(){ await fs.mkdir(dataDir(),{recursive:true}); await fs.writeFile(dbFile(),JSON.stringify(library,null,2)) }
async function load(){
  const normalize=()=>{for(const p of library?.photos||[]){p.previewUrl=photoUrl(photoPath(p.previewUrl));if(p.fullPreviewUrl)p.fullPreviewUrl=photoUrl(photoPath(p.fullPreviewUrl))}return library}
  try { library=JSON.parse(await fs.readFile(dbFile(),'utf8')); return normalize() }
  catch {
    // Preserve catalogs created before the product was renamed from PhotoApp.
    try { const legacy=path.join(app.getPath('appData'),'PhotoApp','photo-library','library.json'); library=JSON.parse(await fs.readFile(legacy,'utf8')); normalize(); await save(); return library }
    catch { return null }
  }
}
function sendProgress(phase:string,current:number,total:number,file?:string){ win?.webContents.send('import:progress',{phase,current,total,file}) }
function stars(score:number){ return Math.max(1,Math.min(5,Math.round(score))) }

async function analyze(file:string, previewDir:string, index:number, total:number):Promise<Photo>{
  const stem=path.parse(file).name; sendProgress('Analyzing',index,total,path.basename(file))
  const img=sharp(file,{failOn:'none'}).rotate(); const meta=await img.metadata()
  const {data,info}=await img.clone().resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).greyscale().raw().toBuffer({resolveWithObject:true})
  const a=new Uint8Array(data); const w=info.width,h=info.height; let sum=0, dark=0, bright=0, lapSum=0,lapSq=0,edge=0,edgeN=0
  for(let i=0;i<a.length;i++){ const v=a[i]; sum+=v; if(v<8)dark++; if(v>247)bright++ }
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){ const i=y*w+x; const lap=-4*a[i]+a[i-1]+a[i+1]+a[i-w]+a[i+w]; lapSum+=lap;lapSq+=lap*lap; if((x+y)%4===0){edge+=Math.abs(a[i]-a[i+1]);edgeN++} }
  const n=(w-2)*(h-2), mean=sum/a.length, lapVar=Math.max(0,lapSq/n-(lapSum/n)**2)
  const sharpness=Math.min(1,Math.log1p(lapVar)/10.2); const clipping=(dark+bright)/a.length
  const exposure=Math.max(0,Math.exp(-Math.pow((mean-126)/78,2))*(1-Math.min(.9,clipping*2.5)))
  const noise=Math.min(1,(edge/Math.max(1,edgeN))/35); const framing=.72 // neutral until optional subject recognition is added
  const score=Math.max(1,Math.min(5,1+4*(sharpness*.48+exposure*.30+(1-noise)*.14+framing*.08)))
  const preview=path.join(previewDir,stem+'.jpg'); await img.clone().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:88}).toFile(preview)
  const captured=meta.exif ? undefined : undefined
  return {id:stem,stem,jpegPath:file,previewUrl:photoUrl(preview),width:meta.width||0,height:meta.height||0,capturedAt:captured,camera:undefined,lens:undefined,score:+score.toFixed(2),stars:stars(score),sharpness:+(sharpness*5).toFixed(2),exposure:+(exposure*5).toFixed(2),noise:+(noise*5).toFixed(2),framing:+(framing*5).toFixed(2),bookmarked:false,flag:'none',note:'',importedAt:new Date().toISOString()}
}

async function extractRawPreview(rawFile:string, output:string){
  const bytes=await fs.readFile(rawFile), soi=Buffer.from([0xff,0xd8,0xff]), eoi=Buffer.from([0xff,0xd9])
  let cursor=0, best:Buffer|undefined
  while(cursor<bytes.length){
    const start=bytes.indexOf(soi,cursor); if(start<0)break
    const end=bytes.indexOf(eoi,start+3); if(end<0)break
    const candidate=bytes.subarray(start,end+2)
    if(candidate.length>50000&&(!best||candidate.length>best.length))best=candidate
    cursor=end+2
  }
  if(!best)throw new Error(`No embedded JPEG preview was found in ${path.basename(rawFile)}`)
  await fs.writeFile(output,best); return output
}

async function importCard(){
  const pick=await dialog.showOpenDialog(win!,{title:'Select photos',buttonLabel:'Import selected files',properties:['openFile','multiSelections'],filters:[{name:'Photos',extensions:['jpg','jpeg','arw','cr2','cr3','nef','raf','orf','rw2','dng']},{name:'All files',extensions:['*']}]}); if(pick.canceled)return null
  const all=pick.filePaths.filter(f=>imageExts.has(path.extname(f).toLowerCase())||rawExts.includes(path.extname(f).toLowerCase()))
  if(!all.length){ await dialog.showMessageBox(win!,{type:'warning',message:'No supported photos selected'}); return null }
  const parents=[...new Set(all.map(f=>path.dirname(f)))], source=parents.length===1?parents[0]:'Multiple locations'
  const cache=path.join(cacheRoot(),Date.now().toString()), originals=path.join(cache,'originals'), previews=path.join(cache,'previews'); await fs.mkdir(originals,{recursive:true}); await fs.mkdir(previews,{recursive:true})
  const byStem=new Map(all.map(f=>[path.parse(f).name.toLowerCase()+path.extname(f).toLowerCase(),f]))
  const groups=new Map<string,{stem:string;jpeg?:string;raw?:string}>()
  for(const file of all){const stem=path.parse(file).name,key=stem.toLowerCase(),ext=path.extname(file).toLowerCase(),g=groups.get(key)||{stem};if(imageExts.has(ext))g.jpeg=file;else g.raw=file;groups.set(key,g)}
  const entries=[...groups.values()], photos:Photo[]=[]
  for(let i=0;i<entries.length;i++){
    const entry=entries[i], stem=entry.stem, originalJpeg=entry.jpeg
    sendProgress('Copying to fast local cache',i+1,entries.length,path.basename(originalJpeg||entry.raw!))
    let jpgCopy:string|undefined
    if(originalJpeg){jpgCopy=path.join(originals,path.basename(originalJpeg));await fs.copyFile(originalJpeg,jpgCopy)}
    let rawCopy:string|undefined
    const siblingDir=path.dirname(originalJpeg||entry.raw!)
    for(const ext of rawExts){ const raw=entry.raw||byStem.get(stem.toLowerCase()+ext)||[ext,ext.toUpperCase()].map(x=>path.join(siblingDir,stem+x)).find(existsSync); if(raw){ rawCopy=path.join(originals,path.basename(raw)); await fs.copyFile(raw,rawCopy); break } }
    let analysisFile=jpgCopy, rawPreview:string|undefined
    if(!analysisFile&&rawCopy){rawPreview=path.join(previews,stem+'-raw-full.jpg');try{await extractRawPreview(rawCopy,rawPreview);analysisFile=rawPreview}catch(err){sendProgress('Skipped RAW without preview',i+1,entries.length,path.basename(rawCopy));continue}}
    if(!analysisFile)continue
    const p=await analyze(analysisFile,previews,i+1,entries.length); p.jpegPath=jpgCopy; p.rawPath=rawCopy; p.fullPreviewUrl=photoUrl(rawPreview||jpgCopy||analysisFile); photos.push(p)
  }
  if(!photos.length){await fs.rm(cache,{recursive:true,force:true});await dialog.showMessageBox(win!,{type:'warning',message:'No viewable photos found',detail:'The selected RAW files did not contain embedded JPEG previews.'});return null}
  const previousCache=library?.cacheDir
  photos.sort((a,b)=>b.score-a.score); library={name:parents.length===1?path.basename(source):`${photos.length} selected photos`,source,cacheDir:cache,photos,createdAt:new Date().toISOString()}; await save()
  if(previousCache&&previousCache.startsWith(cacheRoot())&&previousCache!==cache) await fs.rm(previousCache,{recursive:true,force:true})
  sendProgress('Complete',photos.length,photos.length); return library
}

protocol.registerSchemesAsPrivileged([{scheme:'photo',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}])
app.setName("Lucci's Photo Select")
app.whenReady().then(async()=>{
  protocol.handle('photo',async req=>{
    const requested=photoPath(req.url)
    let file=requested
    if(!existsSync(file)){
      const item=library?.photos.find(p=>p.previewUrl===req.url||path.basename(photoPath(p.previewUrl))===path.basename(requested))
      const sourceFallback=item&&item.jpegPath&&library!.source!=='Multiple locations'?path.join(library!.source,path.basename(item.jpegPath)):''
      file=item?.jpegPath&&existsSync(item.jpegPath)?item.jpegPath:sourceFallback&&existsSync(sourceFallback)?sourceFallback:''
    }
    if(!file)return new Response('Photo not found',{status:404})
    try { return new Response(new Uint8Array(await fs.readFile(file)),{headers:{'content-type':'image/jpeg','cache-control':'public, max-age=3600'}}) }
    catch { return new Response('Photo not found',{status:404}) }
  })
  win=new BrowserWindow({title:"Lucci's Photo Select",width:1480,height:920,minWidth:1080,minHeight:700,backgroundColor:'#161719',titleBarStyle:process.platform==='darwin'?'hiddenInset':'default',icon:path.join(__dirname,'../build/icon.png'),webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false}})
  if(process.env.VITE_DEV_SERVER_URL) await win.loadURL(process.env.VITE_DEV_SERVER_URL); else await win.loadFile(path.join(__dirname,'../dist/index.html'))
  await load()
})
app.on('window-all-closed',()=>{ if(process.platform!=='darwin') app.quit() })
ipcMain.handle('library:load',()=>load())
ipcMain.handle('library:import',()=>importCard())
ipcMain.handle('photo:update',async(_e,id:string,patch:Partial<Photo>)=>{ const p=library?.photos.find(x=>x.id===id); if(!p)return false; Object.assign(p,patch); await save(); return true })
ipcMain.handle('library:clear',async()=>{ const old=library?.cacheDir; library=null; try{await fs.rm(dbFile())}catch{} if(old&&old.startsWith(cacheRoot()))await fs.rm(old,{recursive:true,force:true}); return true })
ipcMain.handle('photos:export',async(_e,ids:string[])=>{ if(!library)return null; const pick=await dialog.showOpenDialog(win!,{title:'Choose export folder',properties:['openDirectory','createDirectory']}); if(pick.canceled)return null; const dest=pick.filePaths[0]; let count=0; for(const p of library.photos.filter(x=>ids.includes(x.id))){ for(const f of [p.jpegPath,p.rawPath]) if(f&&existsSync(f)){ await fs.copyFile(f,path.join(dest,path.basename(f))); count++ } } return {exported:count,folder:dest} })
ipcMain.handle('grid:save',async()=>{if(!library)return null;const pick=await dialog.showSaveDialog(win!,{title:'Save Lucci Photo Select grid',defaultPath:`${library.name}.LPV`,filters:[{name:'Lucci Photo Select Grid',extensions:['LPV']}]});if(pick.canceled||!pick.filePath)return null;await fs.writeFile(pick.filePath,JSON.stringify({format:'LPV',version:1,library},null,2));return{saved:true,file:pick.filePath}})
ipcMain.handle('grid:open',async()=>{const pick=await dialog.showOpenDialog(win!,{title:'Open Lucci Photo Select grid',properties:['openFile'],filters:[{name:'Lucci Photo Select Grid',extensions:['LPV','lpv']}]});if(pick.canceled)return null;try{const doc=JSON.parse(await fs.readFile(pick.filePaths[0],'utf8'));if(doc.format!=='LPV'||!doc.library?.photos)throw new Error('Invalid LPV file');library=doc.library;await save();return library}catch{await dialog.showMessageBox(win!,{type:'error',message:'This LPV grid could not be opened'});return null}})
