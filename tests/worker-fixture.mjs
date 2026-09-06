// Node test adapter for the browser worker protocol; the actual worker source is unchanged.
import {parentPort} from 'node:worker_threads';
globalThis.self=globalThis;
self.postMessage=(message,transfer)=>parentPort.postMessage(message,transfer);
await import('../src/worker.js');
parentPort.on('message',data=>self.onmessage({data}));
parentPort.postMessage({fixtureReady:true});
