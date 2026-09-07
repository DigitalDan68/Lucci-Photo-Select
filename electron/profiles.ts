import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
const execute=promisify(execFile)
export type CameraProfile={id:string;name:string;camera:string;file:string}
export function dcpIdentity(bytes:Buffer){
 if(bytes.length<8||bytes.length>32*1024*1024)throw new Error('Invalid DCP size')
 const endian=bytes.toString('ascii',0,2);if(!['II','MM'].includes(endian))throw new Error('Invalid DCP header')
 const u16=(n:number)=>endian==='II'?bytes.readUInt16LE(n):bytes.readUInt16BE(n),u32=(n:number)=>endian==='II'?bytes.readUInt32LE(n):bytes.readUInt32BE(n)
 if(![42,0x4352].includes(u16(2)))throw new Error('Not a TIFF/DCP profile')
 const offset=u32(4),count=u16(offset);if(offset+2+count*12>bytes.length)throw new Error('Invalid DCP directory')
 const strings=new Map<number,string>();let matrix=false
 for(let i=0;i<count;i++){const entry=offset+2+i*12,tag=u16(entry),type=u16(entry+2),length=u32(entry+4);if(tag===50721||tag===50722)matrix=true;if(type!==2)continue;const start=length<=4?entry+8:u32(entry+8);if(start+length>bytes.length)throw new Error('Invalid DCP string');strings.set(tag,bytes.toString('utf8',start,start+length).replace(/\0.*$/s,'').trim())}
 const camera=strings.get(50708),name=strings.get(50936)||strings.get(18246);if(!matrix||!camera||!name)throw new Error('DCP must identify its camera, profile name, and color matrix')
 return {camera,name}
}
export const cameraMatches=(a:string,b:string)=>a.toLowerCase().replace(/^sony\s*/,'').replace(/[^a-z0-9]/g,'')===b.toLowerCase().replace(/^sony\s*/,'').replace(/[^a-z0-9]/g,'')
export function profileSettings(file:string){return `[Version]\nAppVersion=5.12\nVersion=352\n[Exposure]\nAuto=false\nCompensation=0\n[White Balance]\nEnabled=true\nSetting=Camera\n[Crop]\nEnabled=false\n[Resize]\nEnabled=false\n[Color Management]\nInputProfile=file:${file.replaceAll('\\','/').replace(/[\r\n]/g,'')}\nToneCurve=true\nApplyLookTable=true\nApplyBaselineExposureOffset=true\nApplyHueSatMap=true\nDCPIlluminant=0\nWorkingProfile=ProPhoto\nOutputProfile=RT_sRGB\n`}
export class ProfileStore{
 constructor(private root:string){}
 async list():Promise<{engine?:string;profiles:CameraProfile[]}>{
  const currentFile=path.join(this.root,'camera-profiles.json'),dataRoot=path.dirname(path.dirname(this.root)),files=[currentFile,path.join(dataRoot,"Lucci's Photo Select",'photo-library','camera-profiles.json'),path.join(dataRoot,'photoapp','photo-library','camera-profiles.json')]
  const states:{file:string;engine?:string;profiles:CameraProfile[]}[]=[]
  for(const file of [...new Set(files)])try{const value=JSON.parse(await fs.readFile(file,'utf8'));if(Array.isArray(value.profiles))states.push({file,engine:typeof value.engine==='string'?value.engine:undefined,profiles:value.profiles.filter((p:CameraProfile)=>p&&typeof p.id==='string'&&typeof p.name==='string'&&typeof p.camera==='string'&&typeof p.file==='string')})}catch{/* Missing legacy profile stores are expected. */}
  const current=states.find(state=>state.file===currentFile)||{file:currentFile,profiles:[]},profiles=new Map(current.profiles.map(profile=>[profile.id,profile]))
  for(const state of states.filter(state=>state.file!==currentFile))for(const profile of state.profiles)if(!profiles.has(profile.id))try{await fs.access(profile.file);profiles.set(profile.id,profile)}catch{/* Ignore stale profile references. */}
  const merged={engine:current.engine||states.find(state=>state.engine)?.engine,profiles:[...profiles.values()]}
  if(merged.profiles.length>current.profiles.length)await this.save(merged)
  return merged
 }
 private async save(value:unknown){await fs.mkdir(this.root,{recursive:true});const file=path.join(this.root,'camera-profiles.json'),tmp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify(value));await fs.rename(tmp,file)}
 async add(file:string){if(path.extname(file).toLowerCase()!=='.dcp')throw new Error('Choose a .dcp camera profile');const bytes=await fs.readFile(file),identity=dcpIdentity(bytes),state=await this.list(),id='dcp:'+createHash('sha256').update(bytes).digest('hex');state.profiles=state.profiles.filter(p=>p.id!==id);state.profiles.push({id,...identity,file});await this.save(state);return state}
 async setEngine(file:string){if(!/^rawtherapee-cli(?:\.exe)?$/i.test(path.basename(file)))throw new Error('Choose rawtherapee-cli from a RawTherapee installation');await fs.access(file);const state=await this.list();state.engine=file;await this.save(state);return state}
 async render(raw:string,camera:string,id:string,out:string){const state=await this.list(),profile=state.profiles.find(p=>p.id===id);if(!profile)throw new Error('Camera profile is unavailable. Add its .dcp file in RAW viewing profiles.');if(!cameraMatches(profile.camera,camera))throw new Error(`Profile is for ${profile.camera}, not ${camera}. Choose a matching camera profile.`);if(!state.engine)throw new Error('Set the RawTherapee renderer in RAW viewing profiles to use DCP camera profiles.');await fs.access(profile.file);await fs.mkdir(path.dirname(out),{recursive:true});const settings=out+'.'+randomUUID()+'.pp3';try{await fs.writeFile(settings,profileSettings(profile.file));await execute(state.engine,['-o',out,'-p',settings,'-Y','-n','-c',raw],{windowsHide:true,timeout:180000,maxBuffer:2*1024*1024});await fs.access(out)}finally{await fs.rm(settings,{force:true})}}
}
