import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('photoAPI', {
  platform: process.platform,
  importCard: () => ipcRenderer.invoke('library:import'),
  loadLibrary: () => ipcRenderer.invoke('library:load'),
  updatePhoto: (id:string, patch:unknown) => ipcRenderer.invoke('photo:update', id, patch),
  exportPhotos: (ids:string[]) => ipcRenderer.invoke('photos:export', ids),
  saveGrid: () => ipcRenderer.invoke('grid:save'),
  openGrid: () => ipcRenderer.invoke('grid:open'),
  clearLibrary: () => ipcRenderer.invoke('library:clear'),
  onImportProgress: (callback:(p:unknown)=>void) => { const fn=(_:unknown,p:unknown)=>callback(p); ipcRenderer.on('import:progress',fn); return ()=>ipcRenderer.removeListener('import:progress',fn) }
})
