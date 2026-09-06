import fs from 'node:fs/promises'
import path from 'node:path'
import {imageExts,rawExts} from './model'

export async function photoFilesInFolder(root:string,limit=100000){
 const files:string[]=[]
 async function walk(folder:string){
  for(const entry of await fs.readdir(folder,{withFileTypes:true})){
   if(entry.name.startsWith('.'))continue
   const file=path.join(folder,entry.name)
   if(entry.isDirectory())await walk(file)
   else if(entry.isFile()&&(imageExts.has(path.extname(entry.name).toLowerCase())||rawExts.has(path.extname(entry.name).toLowerCase()))){files.push(file);if(files.length>limit)throw new Error(`Folder contains more than ${limit.toLocaleString()} supported photos. Choose a smaller folder.`)}
  }
 }
 await walk(root)
 return files
}
