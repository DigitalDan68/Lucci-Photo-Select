import {parentPort,workerData} from 'node:worker_threads'
import {bestN} from './model'
parentPort?.postMessage(bestN(workerData.photos,workerData.n,workerData.variety))
