// Local-only A7V profiles using installed Adobe donor data. Never bundle the output.
// Method: https://github.com/davrukin/Sony-A7V-Picture-Profile-Creator
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict')
const {ProfileStore,dcpIdentity}=require('../dist-electron/profiles')
function directory(bytes){const le=bytes.toString('ascii',0,2)==='II',u16=n=>le?bytes.readUInt16LE(n):bytes.readUInt16BE(n),u32=n=>le?bytes.readUInt32LE(n):bytes.readUInt32BE(n),offset=u32(4),entries=[];for(let i=0;i<u16(offset);i++){const at=offset+2+i*12;entries.push({at,tag:u16(at),type:u16(at+2),count:u32(at+4),offset:u32(at+8)})}return{le,entries}}
function value(bytes,entry){const size=entry.count*({2:1,10:8}[entry.type]||1);return bytes.subarray(size<=4?entry.at+8:entry.offset,(size<=4?entry.at+8:entry.offset)+size)}
function generate(donor,standard){let result=Buffer.from(donor);const d=directory(donor),source=directory(standard),write32=(n,at)=>d.le?result.writeUInt32LE(n,at):result.writeUInt32BE(n,at);const forward=[.7976749,.1351917,.0313534,.2880402,.7118741,.0000857,0,0,.82521]
 for(const entry of d.entries){let replacement
  if([50708,50709,50936,18246].includes(entry.tag)&&entry.type===2){let text=value(donor,entry).toString('utf8').replace(/\0.*$/s,'').replaceAll('DSC-RX1RM3','ILCE-7M5');if([50936,18246].includes(entry.tag))text+=' (A7V community)';replacement=Buffer.from(text+'\0')}
  if([50721,50722].includes(entry.tag)){const other=source.entries.find(x=>x.tag===entry.tag);assert(other&&other.type===10&&other.count===9,'Missing A7V matrix');replacement=Buffer.from(value(standard,other));if(d.le!==source.le)replacement.swap32()}
  if([50964,50965].includes(entry.tag)&&entry.type===10){assert.equal(entry.count,9);replacement=Buffer.alloc(72);for(let i=0;i<9;i++){if(d.le){replacement.writeInt32LE(Math.round(forward[i]*10000000),i*8);replacement.writeInt32LE(10000000,i*8+4)}else{replacement.writeInt32BE(Math.round(forward[i]*10000000),i*8);replacement.writeInt32BE(10000000,i*8+4)}}}
  if(replacement){const offset=result.length;result=Buffer.concat([result,replacement]);write32(entry.type===2?replacement.length:entry.count,entry.at+4);write32(offset,entry.at+8)}
 }
 assert.equal(dcpIdentity(result).camera.replace(/^Sony\s*/,''),'ILCE-7M5');return result
}
async function main(){const base=path.join(process.env.ProgramData,'Adobe','CameraRaw','CameraProfiles'),root=path.join(process.env.APPDATA,"Lucci's Photo Select",'photo-library'),out=path.join(root,'camera-profiles','Sony ILCE-7M5'),donors=path.join(base,'Camera','Sony DSC-RX1RM3');const standard=await fs.readFile(path.join(base,'Adobe Standard','Sony ILCE-7M5 Adobe Standard.dcp'));await fs.mkdir(out,{recursive:true});const store=new ProfileStore(root)
 for(const name of(await fs.readdir(donors)).filter(n=>n.endsWith('.dcp'))){const profile=generate(await fs.readFile(path.join(donors,name)),standard),file=path.join(out,name.replace('DSC-RX1RM3','ILCE-7M5').replace('.dcp',' (community).dcp'));try{await fs.writeFile(file,profile,{flag:'wx'})}catch(e){if(e.code!=='EEXIST')throw e;assert((await fs.readFile(file)).equals(profile),'Existing generated profile differs; not overwriting')}await store.add(file);console.log(dcpIdentity(profile).name)}console.log('Registered profiles in '+out)}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1})
module.exports={generate}
