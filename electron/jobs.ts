import {Worker} from 'node:worker_threads'
import path from 'node:path'
export function imageJob(task:string,file:string,out:string,signal?:AbortSignal):Promise<any>{return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(new Error('Cancelled'))
  const worker=new Worker(path.join(__dirname,'image-worker.js'),{workerData:{task,file,out}})
  const stop=()=>finish(new Error('Cancelled'));const timer=setTimeout(()=>finish(new Error('Image processing timed out')),180000)
  let done=false
  function finish(error?:Error,result?:unknown){if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',stop);void worker.terminate();error?reject(error):resolve(result)}
  signal?.addEventListener('abort',stop,{once:true});worker.once('message',m=>finish(m.error?new Error(m.error):undefined,m.result));worker.once('error',e=>finish(e instanceof Error?e:new Error(String(e))));worker.once('exit',code=>{if(!done)finish(new Error(`Image worker exited (${code})`))})
})}
