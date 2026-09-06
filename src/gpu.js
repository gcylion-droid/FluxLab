import {initialState} from './model.js';
import {CPUSolver} from './cpu.js';
async function shader(device,path){const res=await fetch(new URL(path,import.meta.url));if(!res.ok)throw new Error(`Cannot load shader ${path}`);const mod=device.createShaderModule({label:path,code:await res.text()});const info=await mod.getCompilationInfo();const errors=info.messages.filter(m=>m.type==='error');if(errors.length)throw new Error(errors.map(m=>`${path}:${m.lineNum}: ${m.message}`).join('\n'));return mod;}
export class GPUSolver {
  static async create(p,mask,onLost){
    if(!globalThis.isSecureContext||!navigator.gpu)throw new Error('WebGPU is not available in this browser/context.');
    const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw new Error('No WebGPU adapter is available.');
    const bytes=p.n*9*4;if(bytes>adapter.limits.maxStorageBufferBindingSize)throw new Error('Mesh exceeds GPU storage-buffer limits.');
    const device=await adapter.requestDevice({label:'FluxLab D2Q9 device'});
    const engine=new GPUSolver(device,p,mask);engine.adapter=adapter;
    device.lost.then(info=>{if(info.reason!=='destroyed')onLost?.(`GPU device lost: ${info.message}`);});
    device.addEventListener('uncapturederror',e=>onLost?.(`WebGPU validation: ${e.error.message}`));
    try{await engine.initialize();return engine;}catch(e){engine.destroy();throw e;}
  }
  constructor(device,p,mask){this.device=device;this.p=p;this.mask=mask;this.iteration=0;this.index=0;this.resources=[];this.dead=false;this.pending=null;}
  buffer(label,size,usage,data){const b=this.device.createBuffer({label,size:Math.max(4,size),usage});this.resources.push(b);if(data)this.device.queue.writeBuffer(b,0,data);return b;}
  async initialize(){
    const d=this.device,p=this.p,state=initialState(p,this.mask);this.initial=state.field;
    this.uniform=this.buffer('Solver parameters',32,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
    const raw=new ArrayBuffer(32),u=new Uint32Array(raw),f=new Float32Array(raw);u.set([p.nx,p.ny,p.mode,p.profile]);f.set([p.omega,p.odd,p.u,0],4);d.queue.writeBuffer(this.uniform,0,raw);
    const usage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC;
    this.pop=[this.buffer('Populations A',state.f.byteLength,usage,state.f),this.buffer('Populations B',state.f.byteLength,usage,state.f)];
    this.maskBuffer=this.buffer('Solid-cell mask',this.mask.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,this.mask);
    this.fieldBuffer=this.buffer('Velocity / density field',state.field.byteLength,usage,state.field);
    this.readback=this.buffer('Asynchronous field readback',state.field.byteLength,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
    this.pipeline=await d.createComputePipelineAsync({label:'Pull + boundary + TRT',layout:'auto',compute:{module:await shader(d,'./solver.wgsl'),entryPoint:'main'}});
    this.groups=[0,1].map(i=>d.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniform}},{binding:1,resource:{buffer:this.pop[i]}},{binding:2,resource:{buffer:this.pop[1-i]}},{binding:3,resource:{buffer:this.maskBuffer}},{binding:4,resource:{buffer:this.fieldBuffer}}]}));
  }
  step(steps){if(this.dead)return;const e=this.device.createCommandEncoder({label:`${steps} LBM steps`}),pass=e.beginComputePass();pass.setPipeline(this.pipeline);for(let i=0;i<steps;i++){pass.setBindGroup(0,this.groups[this.index]);pass.dispatchWorkgroups(Math.ceil(this.p.n/128));this.index=1-this.index;}pass.end();this.device.queue.submit([e.finish()]);this.iteration+=steps;}
  snapshot(){
    if(this.pending)return this.pending;if(this.dead)return Promise.reject(new Error('Disposed GPU solver'));
    const iteration=this.iteration;
    this.pending=(async()=>{const e=this.device.createCommandEncoder();e.copyBufferToBuffer(this.fieldBuffer,0,this.readback,0,this.p.n*16);this.device.queue.submit([e.finish()]);await this.readback.mapAsync(GPUMapMode.READ);const field=new Float32Array(this.readback.getMappedRange().slice(0));this.readback.unmap();return{field,iteration};})().finally(()=>{this.pending=null;});return this.pending;
  }
  async makeRenderer(canvas){const d=this.device,context=canvas.getContext('webgpu');if(!context)throw new Error('Cannot create WebGPU canvas');const format=navigator.gpu.getPreferredCanvasFormat();context.configure({device:d,format,alphaMode:'opaque'});
    const uniform=this.buffer('Viewport uniforms',80,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
    const module=await shader(d,'./render.wgsl');const pipeline=await d.createRenderPipelineAsync({layout:'auto',vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format}]},primitive:{topology:'triangle-list'}});
    const group=d.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniform}},{binding:1,resource:{buffer:this.fieldBuffer}}]});
    return {render:(data)=>{if(this.dead)return;d.queue.writeBuffer(uniform,0,data);const e=d.createCommandEncoder(),pass=e.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),clearValue:{r:.028,g:.039,b:.071,a:1},loadOp:'clear',storeOp:'store'}]});pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.draw(3);pass.end();d.queue.submit([e.finish()]);},destroy:()=>context.unconfigure()};
  }
  destroy(){this.dead=true;for(const b of this.resources)b.destroy();this.device.destroy();}
}
export class WorkerSolver {
  static async create(p,mask){const e=new WorkerSolver(p,mask);let timer;try{await Promise.race([e.request({type:'init',p,mask}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Worker initialization timed out.')),4000);})]);return e;}catch(error){e.destroy();throw error;}finally{clearTimeout(timer);}}
  constructor(p,mask){this.p=p;this.mask=mask;this.initial=initialState(p,mask).field;this.iteration=0;this.worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});this.requests=new Map();this.seq=0;
    this.worker.onmessage=({data})=>{const item=this.requests.get(data.id);if(!item)return;this.requests.delete(data.id);data.error?item.reject(new Error(data.error)):item.resolve(data);};
    this.worker.onerror=e=>{for(const t of this.requests.values())t.reject(new Error(e.message||'Worker execution is unavailable in this browser context.'));this.requests.clear();};
  }
  request(message){return new Promise((resolve,reject)=>{const id=++this.seq;this.requests.set(id,{resolve,reject});this.worker.postMessage({...message,id});});}
  async step(steps){const r=await this.request({type:'step',steps});this.iteration=r.iteration;this.latest=r;return r;}
  async snapshot(){return this.latest??{field:this.initial,iteration:0};}
  destroy(){this.worker.terminate();for(const r of this.requests.values())r.reject(new Error('Solver disposed'));this.requests.clear();}
}

/** Last-resort real solver for contexts that disable workers. It yields between every time step. */
export class CooperativeSolver {
  constructor(p,mask){this.p=p;this.mask=mask;this.solver=new CPUSolver(p,mask);this.initial=this.solver.field.slice();this.iteration=0;this.dead=false;}
  async step(steps){for(let i=0;i<steps;i++){if(this.dead)throw new Error('Solver disposed');this.solver.step(1);if(globalThis.scheduler?.yield)await scheduler.yield();else await new Promise(resolve=>setTimeout(resolve,0));}this.iteration=this.solver.iteration;return this.snapshot();}
  async snapshot(){return {field:this.solver.field.slice(),iteration:this.solver.iteration};}
  destroy(){this.dead=true;}
}
