import {contextBridge,ipcRenderer} from 'electron'
contextBridge.exposeInMainWorld('photoAPI',{
  previewRename:(ids:string[],options:unknown)=>ipcRenderer.invoke('photos:rename-preview',ids,options),renamePhotos:(token:string)=>ipcRenderer.invoke('photos:rename',token),
  onMenuAction:(callback:(action:string)=>void)=>{const fn=(_:unknown,action:string)=>callback(action);ipcRenderer.on('menu:action',fn);return()=>ipcRenderer.removeListener('menu:action',fn)},
  profiles:()=>ipcRenderer.invoke('profiles:list'),addProfile:()=>ipcRenderer.invoke('profiles:add'),setProfileEngine:()=>ipcRenderer.invoke('profiles:engine'),
  platform:process.platform,loadLibrary:()=>ipcRenderer.invoke('library:load'),importCard:()=>ipcRenderer.invoke('library:import'),
  updatePhotos:(ids:string[],patch:unknown)=>ipcRenderer.invoke('photo:update',ids,patch),inspect:(id:string,mode?:string)=>ipcRenderer.invoke('photo:inspect',id,mode),
  suggest:(n:number,v:number)=>ipcRenderer.invoke('selection:suggest',n,v),undo:(redo=false)=>ipcRenderer.invoke('history:undo',redo),
  exportPhotos:(ids:string[],mode:string)=>ipcRenderer.invoke('photos:export',ids,mode),saveGrid:()=>ipcRenderer.invoke('grid:save'),openGrid:()=>ipcRenderer.invoke('grid:open'),
  relink:()=>ipcRenderer.invoke('grid:relink'),rerank:()=>ipcRenderer.invoke('library:rerank'),cancel:()=>ipcRenderer.invoke('operation:cancel'),clearLibrary:()=>ipcRenderer.invoke('library:clear'),
  onImportProgress:(callback:(p:unknown)=>void)=>{const fn=(_:unknown,p:unknown)=>callback(p);ipcRenderer.on('import:progress',fn);return()=>ipcRenderer.removeListener('import:progress',fn)}
})
