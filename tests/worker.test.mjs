import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {preset,parameters,rasterize} from '../src/model.js';
import {CPUSolver} from '../src/cpu.js';
function next(worker){return new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});}
test('Worker message protocol, transferable field, and reference solver agree exactly',async()=>{
 const w=new Worker(new URL('./worker-fixture.mjs',import.meta.url));
 try{await next(w);const c=preset('cylinder');c.domain.nx=96;const p=parameters(c),mask=rasterize(c,p),ref=new CPUSolver(p,mask);
  let response=next(w);w.postMessage({id:1,type:'init',p,mask});assert.equal((await response).type,'ready');
  ref.step(120);response=next(w);w.postMessage({id:2,type:'step',steps:120});const out=await response;assert.equal(out.iteration,120);assert(out.field instanceof Float32Array);assert.deepEqual(out.field,ref.field);
  ref.step(1);response=next(w);w.postMessage({id:3,type:'step',steps:1});assert.deepEqual((await response).field,ref.field);
 }finally{await w.terminate();}
});
