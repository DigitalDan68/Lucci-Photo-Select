import fs from 'node:fs/promises';
import createRaw from '../node_modules/libraw-wasm/dist/libraw.js';
const wasmBinary=await fs.readFile(new URL('../node_modules/libraw-wasm/dist/libraw.wasm',import.meta.url));
const m=await createRaw({wasmBinary});
const raw=new m.LibRaw();
raw.open(new Uint8Array(await fs.readFile(process.argv[2])),{useCameraWb:true,outputBps:8,halfSize:false});
console.log(raw.metadata());
const pixels=raw.imageData();console.log(Object.keys(pixels),pixels.width,pixels.height,pixels.data?.length);
