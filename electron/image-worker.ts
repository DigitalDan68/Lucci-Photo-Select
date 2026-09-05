import {parentPort,workerData} from 'node:worker_threads'
import {analyze,decodeRaw,embeddedPreview} from './imaging'
async function run(){const {task,file,out}=workerData;return task==='decode'?decodeRaw(file,out):task==='extract'?embeddedPreview(file,out):analyze(file,out)}
run().then(result=>parentPort?.postMessage({result}),error=>parentPort?.postMessage({error:String(error.message||error)}))
