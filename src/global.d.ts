import type { ImportProgress, Library, Photo } from './types'
declare global { interface Window { photoAPI: {
  platform: string;
  importCard(): Promise<Library | null>; loadLibrary(): Promise<Library | null>;
  updatePhoto(id:string, patch:Partial<Photo>): Promise<boolean>; exportPhotos(ids:string[]): Promise<{exported:number;folder?:string}|null>;
  saveGrid(): Promise<{saved:boolean;file?:string}|null>; openGrid(): Promise<Library|null>;
  clearLibrary(): Promise<boolean>; onImportProgress(callback:(p:ImportProgress)=>void):()=>void;
} } }
export {}
