import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import type {Photo} from './model'

import type {RenameOptions,RenameFile,RenameEntry} from './rename-types'
export type {RenameOptions,RenamePreview} from './rename-types'
const key=(file:string)=>path.resolve(file).toLowerCase()
const pad=(n:number)=>String(n).padStart(2,'0')
export function renameStem(photo:Photo,number:number){
 if(!photo.capturedAt||!Number.isFinite(Date.parse(photo.capturedAt)))throw new Error('Capture date/time is missing. This photo cannot be automatically renamed.')
 if(!photo.camera?.trim())throw new Error('Camera model is missing. This photo cannot be automatically renamed.')
 const d=new Date(photo.capturedAt),camera=photo.camera.trim().replace(/[^a-z0-9-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,60)
 if(!camera)throw new Error('Camera model contains no usable filename characters.')
 return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_${camera}_${String(number).padStart(4,'0')}`
}
async function exists(file:string){try{await fs.lstat(file);return true}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e}}
export async function planRename(photos:Photo[],ids:string[],options:RenameOptions):Promise<RenameEntry[]>{
 if(!Array.isArray(ids)||!ids.length||ids.some(id=>typeof id!=='string'))throw new Error('Select photos to rename.')
 if(!Number.isSafeInteger(options?.start)||options.start<1||options.start+ids.length>10000000)throw new Error('Choose a valid starting photo number (1–9999999).')
 const requested=new Set(ids),selected=photos.filter(p=>requested.has(p.id)).sort((a,b)=>(a.capturedAt||'').localeCompare(b.capturedAt||'')||a.stem.localeCompare(b.stem)||a.id.localeCompare(b.id))
 if(selected.length!==requested.size)throw new Error('The selection changed. Preview the rename again.')
 const entries:RenameEntry[]=[],sources=new Set<string>(),targets=new Set<string>()
 for(let i=0;i<selected.length;i++){
  const p=selected[i],entry:RenameEntry={id:p.id,before:p.stem,after:'',files:[]}
  try{entry.after=renameStem(p,options.start+i)
   for(const kind of ['raw','jpeg'] as const){const stored=kind==='raw'?p.rawPath:p.jpegPath,original=kind==='raw'?p.sourceRaw:p.sourceJpeg;if(!stored&&!original)continue
    // Prefer the imported original over a legacy cached copy. Never silently rename a cache when the original is missing.
    const from=path.resolve(original||stored!),stat=await fs.lstat(from)
    if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Only regular original files can be renamed.')
    const to=path.join(path.dirname(from),entry.after+path.extname(from))
    if(sources.has(key(from))||targets.has(key(to)))throw new Error('Duplicate file or destination in this batch.')
    if(key(from)!==key(to)&&await exists(to))throw new Error(`A file named ${path.basename(to)} already exists.`)
    sources.add(key(from));targets.add(key(to));entry.files.push({kind,from,to,size:stat.size,mtime:stat.mtimeMs})
   }
   if(!entry.files.length)throw new Error('Original files are missing. Use Locate missing files.')
  }catch(e){entry.error=(e as NodeJS.ErrnoException).code==='ENOENT'?'An original is missing. Locate it before renaming this pair.':(e as Error).message}
  entries.push(entry)
 }
 return entries
}
export function applyRenamePaths(photos:Photo[],entries:RenameEntry[]){
 const moves=new Map(entries.flatMap(e=>e.files.map(f=>[key(f.from),f.to] as const))),byId=new Map(entries.map(e=>[e.id,e]))
 for(const photo of photos){const entry=byId.get(photo.id);if(entry){photo.stem=entry.after;for(const file of entry.files){if(file.kind==='raw'){photo.rawPath=file.to;photo.sourceRaw=file.to}else{photo.jpegPath=file.to;photo.sourceJpeg=file.to}}}
  for(const field of ['rawPath','jpegPath','sourceRaw','sourceJpeg'] as const){if(photo[field]&&moves.has(key(photo[field]!)))photo[field]=moves.get(key(photo[field]!))}
  for(const field of ['previewUrl','fullPreviewUrl'] as const){const value=photo[field];if(value?.startsWith('photo://local/')){const moved=moves.get(key(decodeURIComponent(value.slice(14))));if(moved)photo[field]='photo://local/'+encodeURIComponent(moved)}}
 }
}
export async function executeRename(entries:RenameEntry[],root:string,commit:()=>Promise<void>,signal?:AbortSignal){
 if(entries.some(e=>e.error))throw new Error('Resolve the errors in the rename preview first.')
 const files=entries.flatMap(e=>e.files).filter(f=>f.from!==f.to)
 const dir=path.join(root,'rename-history');await fs.mkdir(dir,{recursive:true});const journal=path.join(dir,randomUUID()+'.json')
 await fs.writeFile(journal,JSON.stringify({state:'pending',files},null,2),{flag:'wx'})
 const moved:RenameFile[]=[]
 try{for(const file of files){if(signal?.aborted)throw new Error('Rename cancelled.')
   const stat=await fs.lstat(file.from);if(stat.size!==file.size||stat.mtimeMs!==file.mtime)throw new Error('An original changed since preview. Preview the rename again.')
   if(await exists(file.to))throw new Error(`Destination already exists: ${file.to}`)
   await fs.rename(file.from,file.to);moved.push(file)
  }
  await commit()
 }catch(e){const failures:string[]=[];for(const file of moved.reverse()){try{if(await exists(file.from))throw new Error('Original path is occupied');await fs.rename(file.to,file.from)}catch{failures.push(`${file.to} → ${file.from}`)}}
  await fs.writeFile(journal,JSON.stringify({state:failures.length?'recovery-required':'rolled-back',files,failures},null,2))
  throw new Error(`${(e as Error).message}${failures.length?` Some files need recovery; the exact paths are recorded in ${journal}`:' No rename changes were retained.'}`)
 }
 // A log failure must not roll back files after the catalog has committed.
 await fs.writeFile(journal,JSON.stringify({state:'complete',files},null,2)).catch(()=>{})
 return journal
}
