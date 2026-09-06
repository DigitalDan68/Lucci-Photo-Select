import exifr from 'exifr'
import type {Photo} from './model'
export function metadataFields(tags:any):Partial<Photo>{
 const result:Partial<Photo>={}
 if(!tags)return result
 if(tags.DateTimeOriginal instanceof Date&&!isNaN(tags.DateTimeOriginal.getTime()))result.capturedAt=tags.DateTimeOriginal.toISOString()
 if(tags.Model)result.camera=String(tags.Model)
 if(tags.LensModel)result.lens=String(tags.LensModel)
 for(const [key,tag] of [['iso','ISO'],['shutter','ExposureTime'],['aperture','FNumber']] as const){const n=Number(tags[tag]);if(Number.isFinite(n)&&n>0)result[key]=n}
 if(tags.WhiteBalance!==undefined)result.whiteBalance=typeof tags.WhiteBalance==='string'?tags.WhiteBalance:tags.WhiteBalance===0?'Auto':tags.WhiteBalance===1?'Manual':String(tags.WhiteBalance)
 return result
}
export async function readMetadata(file:string){try{return metadataFields(await exifr.parse(file,{pick:['DateTimeOriginal','Model','ISO','LensModel','ExposureTime','FNumber','WhiteBalance']}))}catch{return {}}}
