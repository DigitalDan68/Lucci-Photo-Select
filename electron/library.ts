import fs from 'node:fs/promises'
import {createReadStream,createWriteStream,constants,existsSync} from 'node:fs'
import {pipeline} from 'node:stream/promises'
import {createHash,randomUUID} from 'node:crypto'
import path from 'node:path'
import sharp from 'sharp'
import {planRename,executeRename,applyRenamePaths,RenamePreview,RenameOptions} from './rename'
import {readMetadata} from './metadata'
import {ProfileStore} from './profiles'
import {Worker} from 'node:worker_threads'
import {imageJob} from './jobs'
import {Photo,Library,Report,Progress,Patch,Inspection,imageExts,rawExts,photoUrl,photoPath,groupBursts,bestN} from './model'

export async function digest(file:string,signal?:AbortSignal){const hash=createHash('sha256');for await(const b of createReadStream(file)){if(signal?.aborted)throw new Error('Cancelled');hash.update(b)}return hash.digest('hex')}
export async function space(dir:string,bytes:number){await fs.mkdir(dir,{recursive:true});const s=await fs.statfs(dir);if(s.bavail*s.bsize<bytes+256*1024*1024)throw new Error('Not enough free disk space. Free some space and try again.')}
export async function safeCopy(src:string,dst:string,signal?:AbortSignal){await fs.mkdir(path.dirname(dst),{recursive:true});const part=dst+'.'+randomUUID()+'.part';try{await pipeline(createReadStream(src),createWriteStream(part,{flags:'wx'}),{signal});if((await fs.stat(src)).size!==(await fs.stat(part)).size)throw new Error('Incomplete copy');await fs.copyFile(part,dst,constants.COPYFILE_EXCL);await fs.unlink(part)}catch(e){await fs.rm(part,{force:true});throw e}}
async function atomic(file:string,value:unknown){const temp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify(value,null,2));await fs.rename(temp,file)}
function safeRelative(root:string,value:string){const result=path.resolve(root,value.replaceAll('\\','/'));if(!result.startsWith(path.resolve(root)+path.sep))throw new Error('Invalid project asset path');return result}
const report=(title:string):Report=>({title,completed:0,skipped:0,cancelled:false,errors:[]})
export class Catalog {
  private renamePreview?:RenamePreview & {ids:string[];options:RenameOptions;library:Library}
  async previewRename(ids:string[],options:RenameOptions){if(this.busy||!this.library)throw new Error('Open a library and wait for other operations.');const library=this.library,entries=await planRename(library.photos,ids,options);const preview={token:randomUUID(),entries,ids,options,library};this.renamePreview=preview;return {token:preview.token,entries}}
  async renamePhotos(token:string){const signal=this.start();try{const preview=this.renamePreview;this.renamePreview=undefined;if(!preview||preview.token!==token||preview.library!==this.library)throw new Error('Preview the rename again.');const entries=await planRename(this.library!.photos,preview.ids,preview.options);if(JSON.stringify(entries)!==JSON.stringify(preview.entries))throw new Error('Files changed since preview. Preview again.');const before=structuredClone(this.library!),next=structuredClone(before);applyRenamePaths(next.photos,entries);await this.writes;
    const project=before.projectPath,oldProject=project?await fs.readFile(project):undefined;
    await executeRename(entries,this.root,async()=>{let projectWritten=false;try{if(project){const copy=structuredClone(next);delete copy.projectPath;delete copy.cacheDir;for(const p of copy.photos){delete p.decodedPath;delete p.fullPreviewUrl;p.previewUrl=''}await atomic(project,{format:'LPV',version:3,library:copy});projectWritten=true}await atomic(path.join(this.root,'library.json'),next)}catch(e){if(projectWritten&&project&&oldProject){const temp=project+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,oldProject);await fs.rename(temp,project)}throw e}},signal);
    this.library=next;for(const photos of [...this.history,...this.future])applyRenamePaths(photos,entries);this.inspections.clear();this.inspectionUrls.clear();return {library:next,report:{...report('Rename'),completed:entries.length}}
  }finally{this.controller=undefined}}
  private inspections=new Map<string,Promise<Inspection>>()
  inspectionUrls=new Map<string,Set<string>>()
  library:Library|null=null; controller?:AbortController; private history:Photo[][]=[];private future:Photo[][]=[];private writes=Promise.resolve()
  constructor(public root:string,private progress:(p:Progress)=>void){}
  get profiles(){return new ProfileStore(this.root)}
  get busy(){return !!this.controller}
  private start(){if(this.busy)throw new Error('Another operation is running');this.controller=new AbortController();return this.controller.signal}
  cancel(){this.controller?.abort()}
  async persist(){const value=structuredClone(this.library);this.writes=this.writes.catch(()=>{}).then(async()=>{await fs.mkdir(this.root,{recursive:true});await atomic(path.join(this.root,'library.json'),value)});await this.writes}
  async load(){try{this.library=JSON.parse(await fs.readFile(path.join(this.root,'library.json'),'utf8'));this.normalize();await this.refreshReferences()}catch{}return this.library}
  normalize(){for(const p of this.library?.photos||[]){if(p.previewUrl)p.previewUrl=photoUrl(photoPath(p.previewUrl));if(p.fullPreviewUrl)p.fullPreviewUrl=photoUrl(photoPath(p.fullPreviewUrl))}}
  private remember(){if(!this.library)return;this.history.push(structuredClone(this.library.photos));if(this.history.length>40)this.history.shift();this.future=[]}
  async change(ids:string[],patch:Patch){if(this.busy)throw new Error('Wait for the current operation');if(!this.library)return null;this.remember();const set=new Set(ids);for(const p of this.library.photos){if(!set.has(p.id))continue;if(patch.stars!==undefined)p.stars=Math.max(0,Math.min(5,Math.round(patch.stars)));if(patch.note!==undefined)p.note=String(patch.note).slice(0,20000);if(patch.bookmarked!==undefined)p.bookmarked=!!patch.bookmarked;if(patch.flag&&['none','pick','reject'].includes(patch.flag))p.flag=patch.flag;if(patch.stars!==undefined)p.ratingSource='manual';if(patch.review!==undefined)p.review=!!patch.review;if(patch.colorLabel&&['none','red','yellow','green','blue','purple'].includes(patch.colorLabel))p.colorLabel=patch.colorLabel;if(patch.viewingProfile&&(['neutral','camera'].includes(patch.viewingProfile)||/^dcp:[a-f0-9]{64}$/.test(patch.viewingProfile)))p.viewingProfile=patch.viewingProfile}await this.persist();return this.library}
  async undo(redo=false){if(this.busy)throw new Error('Wait for the current operation');if(!this.library)return null;const from=redo?this.future:this.history,to=redo?this.history:this.future;const prev=from.pop();if(prev){to.push(structuredClone(this.library.photos));this.library.photos=prev;await this.persist()}return this.library}
  async suggest(n:number,variety:number){const signal=this.start();try{return await new Promise<string[]>((resolve,reject)=>{const worker=new Worker(path.join(__dirname,'selection-worker.js'),{workerData:{photos:this.library?.photos||[],n:Math.max(1,Math.floor(n)),variety:Math.max(0,Math.min(1,variety))}});const stop=()=>{void worker.terminate();reject(new Error('Selection cancelled'))};signal.addEventListener('abort',stop,{once:true});worker.once('message',ids=>{signal.removeEventListener('abort',stop);void worker.terminate();resolve(ids)});worker.once('error',e=>{signal.removeEventListener('abort',stop);reject(e)})})}finally{this.controller=undefined}}
  async clear(){if(this.busy)throw new Error('Wait for the current operation');this.library=null;this.history=[];this.future=[];await this.persist()}
  async importFiles(files:string[]){const signal=this.start(),r=report('Import'),cache=path.join(this.root,'cache',randomUUID()),photos:Photo[]=[]
    try{const groups=new Map<string,{stem:string;jpeg?:string;raw?:string}>()
      for(const file of files){const ext=path.extname(file).toLowerCase();if(!imageExts.has(ext)&&!rawExts.has(ext)){r.skipped++;continue}const key=path.join(path.dirname(file),path.parse(file).name.toLowerCase()),g=groups.get(key)||{stem:path.parse(file).name};if(imageExts.has(ext))g.jpeg=file;else g.raw=file;groups.set(key,g)}
      // Pair only within the same directory, never across two cameras' folders.
      for(const g of groups.values()){const file=g.jpeg||g.raw!;const siblings=await fs.readdir(path.dirname(file));for(const name of siblings){if(path.parse(name).name.toLowerCase()!==g.stem.toLowerCase())continue;const ext=path.extname(name).toLowerCase();if(!g.jpeg&&imageExts.has(ext))g.jpeg=path.join(path.dirname(file),name);if(!g.raw&&rawExts.has(ext))g.raw=path.join(path.dirname(file),name)}}
      let bytes=0;for(const g of groups.values())for(const f of[g.jpeg,g.raw])if(f)bytes+=(await fs.stat(f)).size;await space(cache,groups.size*2*1024*1024)
      const seen=new Set<string>();let index=0
      for(const g of groups.values()){if(signal.aborted)break;index++;this.progress({phase:'Importing and ranking',current:index,total:groups.size,file:g.stem})
        const dir=path.join(cache,randomUUID());try{const hash=await digest(g.raw||g.jpeg!,signal);if(seen.has(hash)){r.skipped++;continue}seen.add(hash);await fs.mkdir(dir,{recursive:true})
          const jpeg=g.jpeg,raw=g.raw
          let analysis=jpeg;const full=path.join(dir,'camera-preview.jpg')
          if(!analysis){try{await imageJob('extract',raw!,full,signal);analysis=full}catch(e){if(signal.aborted)throw e;analysis=path.join(dir,'raw-decoded.png');await imageJob('decode',raw!,analysis,signal)}}
          const preview=path.join(dir,'grid.jpg'),metrics=await imageJob('analyze',analysis!,preview,signal)
          Object.assign(metrics,await readMetadata(raw||jpeg!))
          photos.push({id:randomUUID(),stem:g.stem,jpegPath:jpeg,rawPath:raw,sourceJpeg:g.jpeg,sourceRaw:g.raw,hash,previewUrl:photoUrl(preview),fullPreviewUrl:photoUrl(analysis!),bookmarked:false,flag:'none',ratingSource:'automatic',colorLabel:'none',note:'',importedAt:new Date().toISOString(),...metrics});r.completed++
        }catch(e){if(signal.aborted)break;r.errors.push(`${g.stem}: ${String((e as Error).message)}`)}}
      r.cancelled=signal.aborted
      if(!r.cancelled&&photos.length){groupBursts(photos);this.library={name:path.basename(path.dirname(files[0])),source:path.dirname(files[0]),cacheDir:cache,photos,createdAt:new Date().toISOString()};this.history=[];this.future=[];await this.persist()}
      else {await fs.rm(cache,{recursive:true,force:true});r.completed=0}
      return{library:this.library,report:r}
    }finally{this.controller=undefined}
  }
  async rerank(){const signal=this.start(),r=report('Reanalyze');try{if(!this.library)return{library:null,report:r};const result=structuredClone(this.library.photos);for(let i=0;i<result.length;i++){if(signal.aborted)break;const p=result[i];this.progress({phase:'Reanalyzing',current:i+1,total:result.length,file:p.stem});try{const source=this.resolve(p,'jpeg')||photoPath(p.fullPreviewUrl||p.previewUrl);const out=path.join(this.root,'cache','analysis',p.id+'.jpg');await fs.mkdir(path.dirname(out),{recursive:true});const m=await imageJob('analyze',source,out,signal);Object.assign(p,m,await readMetadata(this.resolve(p,'raw')||source),{stars:p.stars,ratingSource:p.ratingSource,previewUrl:photoUrl(out)});r.completed++}catch(e){if(!signal.aborted)r.errors.push(`${p.stem}: ${(e as Error).message}`)}}r.cancelled=signal.aborted;if(!r.cancelled){this.remember();groupBursts(result);this.library.photos=result;await this.persist()}return{library:this.library,report:r}}finally{this.controller=undefined}}
  resolve(p:Photo,kind:'raw'|'jpeg'){const paths=kind==='raw'?[p.rawPath,p.sourceRaw]:[p.jpegPath,p.sourceJpeg];const stored=paths[0];if(stored&&this.library?.source&&this.library.source!=='Multiple locations')paths.push(path.join(this.library.source,path.basename(stored)));return paths.find(f=>f&&existsSync(f))}
  inspect(id:string,mode?:string):Promise<Inspection>{const key=id+':'+(mode||'neutral');let pending=this.inspections.get(key);if(!pending){pending=this.inspectOne(id,mode).then(result=>{const urls=this.inspectionUrls.get(id)||new Set<string>();urls.add(result.url);this.inspectionUrls.set(id,urls);return result}).finally(()=>this.inspections.delete(key));this.inspections.set(key,pending)}return pending}
  private async inspectOne(id:string,mode?:string):Promise<Inspection>{const p=this.library?.photos.find(p=>p.id===id);if(!p)throw new Error('Photo not found');const raw=this.resolve(p,'raw');let warning:string|undefined
    if(mode?.startsWith('dcp:')){if(!raw)throw new Error('The original RAW is needed to apply a camera profile. Use Locate missing files.');const out=path.join(this.root,'decoded','profiles',p.id+'-'+mode.slice(4)+'.png');if(!/^dcp:[a-f0-9]{64}$/.test(mode))throw new Error('Invalid profile');await this.profiles.render(raw,p.camera||'',mode,out);const m=await sharp(out).metadata();p.decodedPath=out;return {url:photoUrl(out),width:m.width!,height:m.height!,kind:'RAW decoded'}}
    if(mode==='camera'&&raw){const jpeg=this.resolve(p,'jpeg');let file=jpeg;try{if(!file){file=path.join(this.root,'decoded',p.id+'-camera.jpg');await fs.mkdir(path.dirname(file),{recursive:true});if(!existsSync(file))await imageJob('extract',raw,file)}const m=await sharp(file).metadata();p.fullPreviewUrl=photoUrl(file);return {url:photoUrl(file),width:m.width!,height:m.height!,kind:'Camera preview'}}catch{throw new Error('Camera preview unavailable. Choose Neutral RAW to decode this file.')}}
    if(raw){const out=path.join(this.root,'decoded','v2',p.id+'.png');await fs.mkdir(path.dirname(out),{recursive:true});try{if(!existsSync(out))await imageJob('decode',raw,out);const m=await sharp(out).metadata();p.decodedPath=out;return{url:photoUrl(out),width:m.width!,height:m.height!,kind:'RAW decoded'}}catch(e){warning=`RAW decode failed: ${(e as Error).message}. Showing available preview.`}}
    const file=this.resolve(p,'jpeg')||[p.fullPreviewUrl,p.previewUrl].filter(Boolean).map(v=>photoPath(v!)).find(existsSync);if(!file)throw new Error('Photo missing. Use Locate missing files.');const m=await sharp(file).rotate().toBuffer({resolveWithObject:true});return{url:photoUrl(file),width:m.info.width,height:m.info.height,kind:p.jpegPath?'JPEG':'Camera preview',warning}
  }
  async export(ids:string[],dest:string,mode:'rename'|'skip'){const signal=this.start(),r=report('Export');r.folder=dest;try{const list=(this.library?.photos||[]).filter(p=>ids.includes(p.id));let bytes=0;for(const p of list)for(const k of['raw','jpeg'] as const){const f=this.resolve(p,k);if(f)bytes+=(await fs.stat(f)).size}await space(dest,bytes)
    for(let i=0;i<list.length;i++){if(signal.aborted)break;const p=list[i];this.progress({phase:'Exporting',current:i+1,total:list.length,file:p.stem});const originals=[p.rawPath?this.resolve(p,'raw'):undefined,p.jpegPath?this.resolve(p,'jpeg'):undefined].filter(Boolean) as string[]
      if(originals.length!==Number(!!p.rawPath)+Number(!!p.jpegPath)){r.errors.push(`${p.stem}: missing original; pair skipped`);continue}
      let base=p.stem,suffix=1;while(originals.some(f=>existsSync(path.join(dest,base+path.extname(f))))){if(mode==='skip')break;base=`${p.stem}-${suffix++}`}
      if(mode==='skip'&&originals.some(f=>existsSync(path.join(dest,base+path.extname(f))))){r.skipped++;continue}
      const written:string[]=[];try{for(const f of originals){const out=path.join(dest,base+path.extname(f));await safeCopy(f,out,signal);written.push(out);if(await digest(f,signal)!==await digest(out,signal))throw new Error('Copy verification failed')}r.completed++}catch(e){for(const f of written)await fs.rm(f,{force:true});if(!signal.aborted)r.errors.push(`${p.stem}: ${(e as Error).message}`)}}r.cancelled=signal.aborted;return r
    }finally{this.controller=undefined}}
  async saveProject(file:string){const signal=this.start(),r=report('Save project');try{
    if(!this.library)throw new Error('No library');const copy=structuredClone(this.library)
    for(const p of copy.photos){if(signal.aborted)throw new Error('Cancelled')
      for(const [key,source] of [['rawPath','sourceRaw'],['jpegPath','sourceJpeg']] as const){if(p[source])p[key]=p[source];if(p[key])p[key]=path.resolve(p[key]!)}
      delete p.decodedPath;delete p.fullPreviewUrl;p.previewUrl='';r.completed++
    }
    delete copy.cacheDir;delete copy.projectPath
    await atomic(file,{format:'LPV',version:3,library:copy});this.library.projectPath=file;await this.persist();r.folder=path.dirname(file);return r
    }finally{this.controller=undefined}}
  async refreshReferences(){
    for(const p of this.library?.photos||[]){
      p.missing=!!((p.rawPath&&!this.resolve(p,'raw'))||(p.jpegPath&&!this.resolve(p,'jpeg')))
      const original=this.resolve(p,'raw')||this.resolve(p,'jpeg')
      if(original)Object.assign(p,await readMetadata(original))
      if(!p.previewUrl||!existsSync(photoPath(p.previewUrl))){
        const jpeg=this.resolve(p,'jpeg'),raw=this.resolve(p,'raw'),dir=path.join(this.root,'cache','references',p.id)
        try{await fs.mkdir(dir,{recursive:true});let input=jpeg
          if(!input&&raw){input=path.join(dir,'camera.jpg');try{await imageJob('extract',raw,input)}catch{input=path.join(dir,'decoded.png');await imageJob('decode',raw,input)}}
          if(input){const preview=path.join(dir,'grid.jpg');await sharp(input).rotate().resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).jpeg({quality:88}).toFile(preview);p.previewUrl=photoUrl(preview);p.fullPreviewUrl=photoUrl(input)}
        }catch{ /* Keep missing entries available for relinking. */ }
      }
    }
  }
  async openProject(file:string){if(this.busy)throw new Error('Another operation is running');const doc=JSON.parse(await fs.readFile(file,'utf8'));if(doc.format!=='LPV'||![1,2,3].includes(doc.version)||!Array.isArray(doc.library?.photos))throw new Error('Invalid LPV project');const lib=doc.library as Library
    if(lib.photos.length>100000)throw new Error('Project too large');for(const p of lib.photos){if(typeof p.id!=='string'||!/^[a-z0-9_-]{1,100}$/i.test(p.id)||typeof p.stem!=='string'||typeof p.previewUrl!=='string')throw new Error('Invalid photo entry');if(doc.version===2){for(const k of['rawPath','jpegPath'] as const)if(p[k])p[k]=safeRelative(path.dirname(file),p[k]!);for(const k of['previewUrl','fullPreviewUrl'] as const)if(p[k])p[k]=photoUrl(safeRelative(path.dirname(file),p[k]!))}}
    lib.projectPath=file;delete lib.cacheDir;this.library=lib;this.normalize();await this.refreshReferences();this.history=[];this.future=[];await this.persist();return lib}
  async relink(folder:string){const signal=this.start(),r=report('Locate missing files');try{if(!this.library)return{library:null,report:r};const names=new Map<string,string[]>();async function walk(dir:string){for(const e of await fs.readdir(dir,{withFileTypes:true})){if(signal.aborted)return;const f=path.join(dir,e.name);if(e.isDirectory()&&!e.name.startsWith('.'))await walk(f);else if(e.isFile()){const k=e.name.toLowerCase();names.set(k,[...(names.get(k)||[]),f])}}}await walk(folder)
    for(const p of this.library.photos){if(signal.aborted)break;for(const [key,kind] of[['rawPath','raw'],['jpegPath','jpeg']] as const){if(!p[key]||this.resolve(p,kind))continue;const candidates=names.get(path.basename(p[key]!).toLowerCase())||[];let match:string|undefined;if(p.hash&&(kind==='raw'||!p.rawPath)){for(const f of candidates)if(await digest(f,signal)===p.hash){match=f;break}}else if(candidates.length===1)match=candidates[0];if(match){p[key]=match;if(kind==='raw')p.sourceRaw=match;else p.sourceJpeg=match;delete p.decodedPath;await fs.rm(path.join(this.root,'decoded',p.id+'.png'),{force:true});r.completed++}else r.errors.push(`${p.stem}: ${kind} missing or ambiguous`)}
      if(!existsSync(photoPath(p.previewUrl))){const src=this.resolve(p,'jpeg');if(src)p.previewUrl=photoUrl(src)}}r.cancelled=signal.aborted;await this.refreshReferences();await this.persist();return{library:this.library,report:r}
    }finally{this.controller=undefined}}
}
