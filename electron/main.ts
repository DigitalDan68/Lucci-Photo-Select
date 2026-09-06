import {app,BrowserWindow,dialog,ipcMain,protocol,Menu} from 'electron'
import {menuTemplate} from './menu'
import fs from 'node:fs/promises'
import path from 'node:path'
import {existsSync} from 'node:fs'
import {Catalog} from './library'
import {photoPath,Patch} from './model'
let win:BrowserWindow|null=null;let catalog:Catalog
app.setName("Lucci's Photo Select")
if(!app.isPackaged&&process.env.LPV_TEST_DATA)app.setPath('userData',process.env.LPV_TEST_DATA)
protocol.registerSchemesAsPrivileged([{scheme:'photo',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}])
async function windowCreate(){win=new BrowserWindow({title:app.name,width:1480,height:920,minWidth:1100,minHeight:740,backgroundColor:'#1b191e',titleBarStyle:process.platform==='darwin'?'hiddenInset':'default',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false}});await win.loadFile(path.join(__dirname,'../dist/index.html'));win.on('closed',()=>win=null)}
app.whenReady().then(async()=>{
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate(process.platform,action=>win?.webContents.send('menu:action',action))))
  catalog=new Catalog(path.join(app.getPath('userData'),'photo-library'),p=>win?.webContents.send('import:progress',p));await catalog.load()
  protocol.handle('photo',async req=>{try{let file=photoPath(req.url);const photos=catalog.library?.photos||[];const item=photos.find(p=>[p.previewUrl,p.fullPreviewUrl, p.jpegPath ? 'photo://local/'+encodeURIComponent(p.jpegPath) : '',p.sourceJpeg ? 'photo://local/'+encodeURIComponent(p.sourceJpeg) : ''].includes(req.url)||p.decodedPath===file||catalog.inspectionUrls.get(p.id)?.has(req.url))
    // Only serve images authorized by the active catalog.
    if(!item)return new Response('Unknown photo',{status:404});if(!existsSync(file))file=catalog.resolve(item,'jpeg')||file
    return new Response(new Uint8Array(await fs.readFile(file)),{headers:{'content-type':path.extname(file)==='.png'?'image/png':'image/jpeg'}})
  }catch{return new Response('Photo unavailable',{status:404})}})
  await windowCreate()
})
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});app.on('activate',()=>{if(!win)void windowCreate()})
ipcMain.handle('library:load',()=>catalog.library)
ipcMain.handle('photos:rename-preview',(_e,ids,options)=>catalog.previewRename(ids,options))
ipcMain.handle('photos:rename',(_e,token)=>catalog.renamePhotos(token))
ipcMain.handle('profiles:list',()=>catalog.profiles.list())
ipcMain.handle('profiles:add',async()=>{const result=await dialog.showOpenDialog(win!,{title:'Choose camera-matching DCP profile',properties:['openFile'],filters:[{name:'Camera profiles',extensions:['dcp']}]});return result.canceled?catalog.profiles.list():catalog.profiles.add(result.filePaths[0])})
ipcMain.handle('profiles:engine',async()=>{const result=await dialog.showOpenDialog(win!,{title:'Choose rawtherapee-cli renderer',properties:['openFile']});return result.canceled?catalog.profiles.list():catalog.profiles.setEngine(result.filePaths[0])})
ipcMain.handle('library:import',async()=>{const p=await dialog.showOpenDialog(win!,{title:'Select files',properties:['openFile','multiSelections'],filters:[{name:'Photos',extensions:['jpg','jpeg','arw','cr2','cr3','nef','raf','orf','rw2','dng']}]});return p.canceled?null:catalog.importFiles(p.filePaths)})
ipcMain.handle('library:clear',()=>catalog.clear())
ipcMain.handle('library:rerank',()=>catalog.rerank())
ipcMain.handle('operation:cancel',()=>catalog.cancel())
ipcMain.handle('photo:update',(_e,ids:string[],patch:Patch)=>catalog.change(ids,patch))
ipcMain.handle('photo:inspect',(_e,id:string,mode?:string)=>catalog.inspect(id,mode))
ipcMain.handle('selection:suggest',(_e,n:number,v:number)=>catalog.suggest(n,v))
ipcMain.handle('history:undo',(_e,redo:boolean)=>catalog.undo(redo))
ipcMain.handle('photos:export',async(_e,ids:string[],mode:'rename'|'skip')=>{const p=await dialog.showOpenDialog(win!,{title:'Export originals',properties:['openDirectory','createDirectory']});return p.canceled?null:catalog.export(ids,p.filePaths[0],mode==='skip'?'skip':'rename')})
ipcMain.handle('grid:save',async()=>{if(!catalog.library)return null;const p=await dialog.showSaveDialog(win!,{title:'Save portable project',defaultPath:catalog.library.projectPath||catalog.library.name+'.LPV',filters:[{name:'Lucci Photo Select',extensions:['LPV']}]});return p.canceled||!p.filePath?null:catalog.saveProject(p.filePath.toLowerCase().endsWith('.lpv')?p.filePath:p.filePath+'.LPV')})
ipcMain.handle('grid:open',async()=>{const p=await dialog.showOpenDialog(win!,{title:'Open project',properties:['openFile'],filters:[{name:'Lucci Photo Select',extensions:['LPV','lpv']}]});return p.canceled?null:catalog.openProject(p.filePaths[0])})
ipcMain.handle('grid:relink',async()=>{const p=await dialog.showOpenDialog(win!,{title:'Locate missing files in folder',properties:['openDirectory']});return p.canceled?null:catalog.relink(p.filePaths[0])})
