import {app,BrowserWindow,dialog,ipcMain,protocol,Menu,shell} from 'electron'
import {menuTemplate} from './menu'
import {GithubRelease,macInstaller,newerVersion} from './update'
import {photoFilesInFolder} from './folders'
import fs from 'node:fs/promises'
import path from 'node:path'
import {existsSync,readFileSync} from 'node:fs'
import {Catalog} from './library'
import {photoPath,Patch} from './model'
let win:BrowserWindow|null=null;let catalog:Catalog
let appSettings={autoUpdates:true,hardwareAcceleration:true},settingsFile=path.join(app.getPath('userData'),'settings.json')
try{const early=JSON.parse(readFileSync(settingsFile,'utf8'));appSettings={autoUpdates:early.autoUpdates!==false,hardwareAcceleration:early.hardwareAcceleration!==false}}catch{/* Defaults are used on first launch. */}
if(!appSettings.hardwareAcceleration)app.disableHardwareAcceleration()
async function saveAppSettings(){const temp=settingsFile+'.tmp';await fs.writeFile(temp,JSON.stringify(appSettings,null,2));await fs.rename(temp,settingsFile);return appSettings}
let checkForUpdates=async(manual=false)=>{if(manual&&win)await dialog.showMessageBox(win,{type:'info',message:'Updates are available in installed builds.',detail:'Automatic updates are disabled while running from source.'})}
let offeredMacVersion=''
async function checkMacUpdate(manual=false){try{const response=await fetch('https://api.github.com/repos/DigitalDan68/Lucci-Photo-Select/releases/latest',{headers:{accept:'application/vnd.github+json','user-agent':'Lucci-Photo-Select-Updater'}});if(!response.ok)throw new Error(`GitHub returned ${response.status}`);const release=await response.json() as GithubRelease,version=release.tag_name||'',installer=macInstaller(release);if(!newerVersion(app.getVersion(),version)){if(manual&&win)await dialog.showMessageBox(win,{message:'You have the latest version.'});return}if(!installer)throw new Error('The latest release does not contain a macOS DMG installer.');if(!manual&&offeredMacVersion===version)return;offeredMacVersion=version;if(!win)return;const answer=await dialog.showMessageBox(win,{type:'info',buttons:['Download installer','Later'],defaultId:0,cancelId:1,message:`Version ${version.replace(/^v/,'')} is available`,detail:'The installer will download in your browser. Open the DMG when it finishes; this app will not replace itself automatically.'});if(answer.response===0)await shell.openExternal(installer)}catch(error){if(manual)dialog.showErrorBox('Update check failed',(error as Error).message)}}
app.setName("Lucci's Photo Select")
if(!app.isPackaged&&process.env.LPV_TEST_DATA)app.setPath('userData',process.env.LPV_TEST_DATA)
protocol.registerSchemesAsPrivileged([{scheme:'photo',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}])
async function windowCreate(){win=new BrowserWindow({title:app.name,width:1480,height:920,minWidth:1100,minHeight:740,backgroundColor:'#1b191e',titleBarStyle:process.platform==='darwin'?'hiddenInset':'default',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false}});await win.loadFile(path.join(__dirname,'../dist/index.html'));win.on('closed',()=>win=null)}
app.whenReady().then(async()=>{
  try{const saved=JSON.parse(await fs.readFile(settingsFile,'utf8'));appSettings={autoUpdates:saved.autoUpdates!==false,hardwareAcceleration:saved.hardwareAcceleration!==false}}catch{/* Defaults are used on first launch. */}
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate(process.platform,action=>action==='check-updates'?void checkForUpdates(true):win?.webContents.send('menu:action',action))))
  catalog=new Catalog(path.join(app.getPath('userData'),'photo-library'),p=>win?.webContents.send('import:progress',p));await catalog.load()
  protocol.handle('photo',async req=>{try{let file=photoPath(req.url);const photos=catalog.library?.photos||[];const item=photos.find(p=>[p.previewUrl,p.fullPreviewUrl, p.jpegPath ? 'photo://local/'+encodeURIComponent(p.jpegPath) : '',p.sourceJpeg ? 'photo://local/'+encodeURIComponent(p.sourceJpeg) : ''].includes(req.url)||p.decodedPath===file||catalog.inspectionUrls.get(p.id)?.has(req.url))
    // Only serve images authorized by the active catalog.
    if(!item)return new Response('Unknown photo',{status:404});if(!existsSync(file))file=catalog.resolve(item,'jpeg')||file
    return new Response(new Uint8Array(await fs.readFile(file)),{headers:{'content-type':path.extname(file)==='.png'?'image/png':'image/jpeg'}})
  }catch{return new Response('Photo unavailable',{status:404})}})
  await windowCreate()
  if(app.isPackaged){if(process.platform==='darwin')checkForUpdates=checkMacUpdate;else{const {autoUpdater}=require('electron-updater');autoUpdater.autoDownload=true;autoUpdater.autoInstallOnAppQuit=true;autoUpdater.on('error',()=>{/* Manual checks report errors; automatic checks retry later. */});autoUpdater.on('update-downloaded',async(info:{version:string})=>{if(!win)return;const answer=await dialog.showMessageBox(win,{type:'info',buttons:['Restart and update','Later'],defaultId:0,cancelId:1,message:`Version ${info.version} is ready`,detail:'Restart now to install it. Your catalogs and original photos will not be changed.'});if(answer.response===0)autoUpdater.quitAndInstall()});checkForUpdates=async(manual=false)=>{try{const result=await autoUpdater.checkForUpdates(),version=result?.updateInfo?.version||app.getVersion();if(manual&&win)await dialog.showMessageBox(win,newerVersion(app.getVersion(),version)?{type:'info',message:`Downloading version ${version}`,detail:'The update is downloading in the background. You will be prompted to restart when it is ready.'}:{type:'info',message:'You have the latest version.',detail:`Installed version: ${app.getVersion()}`})}catch(error){if(manual)dialog.showErrorBox('Update check failed',(error as Error).message)}}}if(appSettings.autoUpdates)setTimeout(()=>void checkForUpdates(),5000);setInterval(()=>{if(appSettings.autoUpdates)void checkForUpdates()},4*60*60*1000)}
})
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});app.on('activate',()=>{if(!win)void windowCreate()})
ipcMain.handle('library:load',()=>catalog.library)
ipcMain.handle('photos:rename-preview',(_e,ids,options)=>catalog.previewRename(ids,options))
ipcMain.handle('photos:rename',(_e,token)=>catalog.renamePhotos(token))
ipcMain.handle('profiles:list',()=>catalog.profiles.list())
ipcMain.handle('profiles:add',async()=>{const result=await dialog.showOpenDialog(win!,{title:'Choose camera-matching DCP profile',properties:['openFile'],filters:[{name:'Camera profiles',extensions:['dcp']}]});return result.canceled?catalog.profiles.list():catalog.profiles.add(result.filePaths[0])})
ipcMain.handle('profiles:engine',async()=>{const result=await dialog.showOpenDialog(win!,{title:'Choose rawtherapee-cli renderer',properties:['openFile']});return result.canceled?catalog.profiles.list():catalog.profiles.setEngine(result.filePaths[0])})
ipcMain.handle('library:import',async()=>{const p=await dialog.showOpenDialog(win!,{title:'Select files',properties:['openFile','multiSelections'],filters:[{name:'Photos',extensions:['jpg','jpeg','arw','cr2','cr3','nef','raf','orf','rw2','dng']}]});return p.canceled?null:catalog.importFiles(p.filePaths)})
ipcMain.handle('library:import-folder',async()=>{const p=await dialog.showOpenDialog(win!,{title:'Select a photo folder',properties:['openDirectory']});if(p.canceled)return null;const files=await photoFilesInFolder(p.filePaths[0]);if(!files.length){dialog.showErrorBox('No supported photos found','Choose a folder containing JPEG or supported RAW photos.');return null}return catalog.importFiles(files)})
ipcMain.handle('library:clear',()=>catalog.clear())
ipcMain.handle('library:rerank',()=>catalog.rerank())
ipcMain.handle('operation:cancel',()=>catalog.cancel())
ipcMain.handle('photo:update',(_e,ids:string[],patch:Patch)=>catalog.change(ids,patch))
ipcMain.handle('photo:inspect',(_e,id:string,mode?:string)=>catalog.inspect(id,mode))
ipcMain.handle('selection:suggest',(_e,n:number,v:number)=>catalog.suggest(n,v))
ipcMain.handle('history:undo',(_e,redo:boolean)=>catalog.undo(redo))
ipcMain.handle('photos:export',async(_e,ids:string[],mode:'rename'|'skip')=>{const p=await dialog.showOpenDialog(win!,{title:'Export originals',properties:['openDirectory','createDirectory']});return p.canceled?null:catalog.export(ids,p.filePaths[0],mode==='skip'?'skip':'rename')})
ipcMain.handle('grid:save',async()=>{if(!catalog.library)return null;const p=await dialog.showSaveDialog(win!,{title:'Save portable project',defaultPath:catalog.library.projectPath||catalog.library.name+'.LPV',filters:[{name:'Lucci Photo Select',extensions:['LPV']}]});return p.canceled||!p.filePath?null:catalog.saveProject(p.filePath.toLowerCase().endsWith('.lpv')?p.filePath:p.filePath+'.LPV')})
ipcMain.handle('grid:new',async()=>{const p=await dialog.showSaveDialog(win!,{title:'Create blank catalog',defaultPath:'Untitled.LPV',filters:[{name:'Lucci Photo Select',extensions:['LPV']}]});if(p.canceled||!p.filePath)return null;const file=p.filePath.toLowerCase().endsWith('.lpv')?p.filePath:p.filePath+'.LPV';return catalog.newProject(file)})
ipcMain.handle('updates:check',()=>checkForUpdates(true))
ipcMain.handle('settings:load',()=>appSettings)
ipcMain.handle('settings:save',async(_event,value:{autoUpdates?:unknown;hardwareAcceleration?:unknown})=>{appSettings={autoUpdates:value?.autoUpdates!==false,hardwareAcceleration:value?.hardwareAcceleration!==false};return saveAppSettings()})
ipcMain.handle('grid:open',async()=>{const p=await dialog.showOpenDialog(win!,{title:'Open project',properties:['openFile'],filters:[{name:'Lucci Photo Select',extensions:['LPV','lpv']}]});return p.canceled?null:catalog.openProject(p.filePaths[0])})
ipcMain.handle('grid:relink',async()=>{const p=await dialog.showOpenDialog(win!,{title:'Locate missing files in folder',properties:['openDirectory']});return p.canceled?null:catalog.relink(p.filePaths[0])})
