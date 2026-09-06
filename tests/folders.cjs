const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path')
const {photoFilesInFolder}=require('../dist-electron/folders')

test('folder import discovers supported photos recursively and skips hidden folders',async t=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'lpv-folder-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'nested'));await fs.mkdir(path.join(root,'.hidden'));await Promise.all([fs.writeFile(path.join(root,'one.JPG'),'x'),fs.writeFile(path.join(root,'nested','two.ARW'),'x'),fs.writeFile(path.join(root,'nested','notes.txt'),'x'),fs.writeFile(path.join(root,'.hidden','three.JPG'),'x')]);const files=await photoFilesInFolder(root);assert.deepEqual(files.map(file=>path.basename(file)).sort(),['one.JPG','two.ARW'])})

test('folder import stops at its safety limit',async t=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'lpv-folder-limit-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.writeFile(path.join(root,'one.jpg'),'x');await fs.writeFile(path.join(root,'two.jpg'),'x');await assert.rejects(photoFilesInFolder(root,1),/more than 1 supported/)})
