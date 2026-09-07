export type Photo = {
  id:string; stem:string; jpegPath?:string; rawPath?:string; sourceJpeg?:string; sourceRaw?:string;
  previewUrl:string; fullPreviewUrl?:string; decodedPath?:string; hash?:string;
  width:number; height:number; capturedAt?:string; camera?:string; lens?:string; iso?:number;
  shutter?:number; aperture?:number; whiteBalance?:string; colorLabel?:'none'|'red'|'yellow'|'green'|'blue'|'purple';
  review?:boolean; missing?:boolean; missingRaw?:boolean; missingJpeg?:boolean; ratingSource?:'manual'|'automatic'; viewingProfile?:string;
  score:number; stars:number; sharpness:number; exposure:number; noise:number; framing:number;
  eyeSharpness?:number; faceCount?:number; ratingVersion?:number; ratingNotes?:string[];
  signature?:number[]; burstId?:string; bookmarked:boolean; flag?:'none'|'pick'|'reject'; note:string; importedAt:string;
}
export type Library={name:string;source:string;cacheDir?:string;photos:Photo[];createdAt:string;projectPath?:string}
export type Progress={phase:string;current:number;total:number;file?:string}
export type Report={title:string;completed:number;skipped:number;cancelled:boolean;errors:string[];folder?:string}
export type Patch=Partial<Pick<Photo,'stars'|'flag'|'bookmarked'|'note'|'colorLabel'|'review'|'viewingProfile'>>
export type Inspection={url:string;width:number;height:number;kind:'RAW decoded'|'JPEG'|'Camera preview';warning?:string}
export const imageExts=new Set(['.jpg','.jpeg'])
export const rawExts=new Set(['.arw','.cr2','.cr3','.nef','.raf','.orf','.rw2','.dng'])
export function photoUrl(file:string){return 'photo://local/'+encodeURIComponent(file)}
export function photoPath(url:string){return decodeURIComponent(url.startsWith('photo://local/')?url.slice(14):url.startsWith('photo://')?url.slice(8):url)}
export function similarity(a:number[]=[],b:number[]=[]){if(!a.length||a.length!==b.length)return 1;return a.reduce((n,v,i)=>n+Math.abs(v-b[i]),0)/a.length/255}
export function groupBursts(photos:Photo[]){
  const sorted=[...photos].sort((a,b)=>(a.capturedAt||a.stem).localeCompare(b.capturedAt||b.stem));let previous:Photo|undefined
  for(const p of sorted){const seconds=previous&&p.capturedAt&&previous.capturedAt?Math.abs(Date.parse(p.capturedAt)-Date.parse(previous.capturedAt))/1000:Infinity
    p.burstId=previous&&seconds<=3&&similarity(p.signature,previous.signature)<.16?previous.burstId:p.id;previous=p}
}
export function bestN(photos:Photo[],n:number,variety:number){
  const pool=photos.filter(p=>p.flag!=='reject').sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)), chosen:Photo[]=[];const counts=new Map<string,number>(),near=new Set<string>()
  if(n>=pool.length||variety===0)return pool.slice(0,n).map(p=>p.id)
  while(pool.length&&chosen.length<n){let best=0,bestScore=-Infinity;for(let i=0;i<pool.length;i++){const p=pool[i],count=counts.get(p.burstId||p.id)||0;const score=p.score-variety*(count*1.5+(near.has(p.id)?.75:0));if(score>bestScore){best=i;bestScore=score}}
    const p=pool.splice(best,1)[0];chosen.push(p);counts.set(p.burstId||p.id,(counts.get(p.burstId||p.id)||0)+1);for(const candidate of pool)if(!near.has(candidate.id)&&similarity(p.signature,candidate.signature)<.055)near.add(candidate.id)}return chosen.map(p=>p.id)
}
