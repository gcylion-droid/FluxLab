import {CPUSolver} from './cpu.js';
let solver;
self.onmessage=({data})=>{
  try{
    if(data.type==='init'){solver=new CPUSolver(data.p,new Uint32Array(data.mask));self.postMessage({id:data.id,type:'ready'});}
    else if(data.type==='step'){if(!solver)throw new Error('Solver not initialized');solver.step(data.steps);const field=solver.field.slice();self.postMessage({id:data.id,iteration:solver.iteration,field},[field.buffer]);}
  }catch(e){self.postMessage({id:data.id,error:e.message});}
};
