import type {ImportProgress,Library,Report,Patch,Inspection} from './types'
declare global {interface Window {photoAPI:{
  previewRename(ids:string[],options:{start:number}):Promise<import('../electron/rename-types').RenamePreview>;renamePhotos(token:string):Promise<{library:Library;report:Report}>;onMenuAction(fn:(action:string)=>void):()=>void;
  profiles():Promise<{engine?:string;profiles:{id:string;name:string;camera:string;file:string}[]}>;addProfile():ReturnType<Window['photoAPI']['profiles']>;setProfileEngine():ReturnType<Window['photoAPI']['profiles']>;
  platform:string;loadLibrary():Promise<Library|null>;importCard():Promise<{library:Library|null;report:Report}|null>;
  updatePhotos(ids:string[],patch:Patch):Promise<Library|null>;inspect(id:string,mode?:string):Promise<Inspection>;suggest(n:number,v:number):Promise<string[]>;undo(redo?:boolean):Promise<Library|null>;
  exportPhotos(ids:string[],mode:'rename'|'skip'):Promise<Report|null>;saveGrid():Promise<Report|null>;openGrid():Promise<Library|null>;relink():Promise<{library:Library|null;report:Report}|null>;
  rerank():Promise<{library:Library|null;report:Report}>;cancel():Promise<void>;clearLibrary():Promise<void>;onImportProgress(fn:(p:ImportProgress)=>void):()=>void;
}}}
export {}
