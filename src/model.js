/** FluxLab case model. All persisted dimensions and fluid properties use SI units. */
export const VERSION = 1;
export const CX = new Int32Array([0, 1, 0, -1, 0, 1, -1, -1, 1]);
export const CY = new Int32Array([0, 0, 1, 0, -1, 1, 1, -1, -1]);
export const OPP = new Uint32Array([0, 3, 4, 1, 2, 7, 8, 5, 6]);
export const W = new Float64Array([4/9, 1/9, 1/9, 1/9, 1/9, 1/36, 1/36, 1/36, 1/36]);
export const clone = x => structuredClone(x);
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const uid = () => globalThis.crypto?.randomUUID?.() ?? `g-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const PRESETS = [
  { id: 'airfoil', title: 'Airfoil water tunnel', subtitle: 'NACA 0012 · external flow', icon: 'airfoil', description: 'A low-Reynolds-number airfoil in a water tunnel. Change incidence and inspect the wake.' },
  { id: 'cylinder', title: 'Flow around a cylinder', subtitle: 'Wake dynamics · transient', icon: 'circle', description: 'Explore separation and an evolving cylinder wake with a no-slip circular boundary.' },
  { id: 'cavity', title: 'Lid-driven cavity', subtitle: 'Recirculation · benchmark', icon: 'box', description: 'A moving top wall drives recirculation inside a square, closed cavity.' },
  { id: 'channel', title: 'Laminar channel', subtitle: 'Internal flow · entrance region', icon: 'flow', description: 'A straight no-slip channel with prescribed inlet velocity and a pressure outlet.' },
  { id: 'nozzle', title: 'Converging passage', subtitle: 'Acceleration · internal flow', icon: 'nozzle', description: 'A converging and diverging passage formed by two editable polygon walls.' },
  { id: 'array', title: 'Cylinder array', subtitle: 'Multiple bodies · interaction', icon: 'grid', description: 'Resolved laminar flow through a small array of independent solid obstacles.' }
];
export function preset(id = 'airfoil') {
  const c = { format: 'fluxlab-case', version: VERSION, name: 'Airfoil water tunnel',
    domain: { length: 0.12, height: 0.054, nx: 384 },
    fluid: { name: 'Water · 20 °C', density: 998.2, viscosity: 0.001002 },
    flow: { speed: 0.005, latticeSpeed: 0.055, mode: 'tunnel', walls: 'noslip', profile: 'uniform' },
    solver: { collision: 'trt', batch: 12, target: 20000, tolerance: 0.00001, autoStop: false },
    bodies: [{ id: uid(), type: 'airfoil', name: 'airfoil-1', x: 0.043, y: 0.027, width: 0.028, height: 0.00336, angle: -9, thickness: 0.12 }],
    display: { field: 'speed', palette: 'spectrum', streamlines: true, vectors: false, mesh: false, particles: true, contours: false, autoRange: true, rangeMin: 0, rangeMax: 0.01 },
    probes: [] };
  if (id === 'cylinder') { c.name = 'Flow around a cylinder'; c.bodies = [{ id: uid(), type: 'circle', name: 'cylinder-1', x: .034, y: .0275, width: .012, height: .012, angle: 0 }]; c.flow.speed = .008; }
  if (id === 'cavity') { c.name = 'Lid-driven cavity'; c.domain = { length: .04, height: .04, nx: 192 }; c.flow = { ...c.flow, speed: .0025, mode: 'cavity' }; c.bodies = []; c.display.streamlines = false; c.display.vectors = true; }
  if (id === 'channel') { c.name = 'Laminar channel'; c.bodies = []; c.flow.profile = 'parabolic'; c.flow.speed = .002; }
  if (id === 'nozzle') { c.name = 'Converging passage'; c.flow.speed = .003; c.bodies = [
    { id: uid(), type: 'polygon', name: 'lower-wall', x: .06, y: 0, width: .12, height: .018, angle: 0, points: [[-.06,0], [.06,0],[.06,.004],[.016,.019],[-.006,.019],[-.035,.004],[-.06,.004]] },
    { id: uid(), type: 'polygon', name: 'upper-wall', x: .06, y: .054, width: .12, height: .018, angle: 0, points: [[-.06,0],[.06,0],[.06,-.004],[.016,-.019],[-.006,-.019],[-.035,-.004],[-.06,-.004]] }
  ]; }
  if (id === 'array') { c.name = 'Cylinder array'; c.flow.speed = .004; c.bodies = []; for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) c.bodies.push({ id: uid(), type: 'circle', name: `cylinder-${x*3+y+1}`, x: .035 + x*.018, y: .013 + y*.014, width: .006, height: .006, angle: 0 }); }
  return c;
}
function finite(v, name, min, max) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`${name} must be between ${min} and ${max}.`);
}
export function validateCase(input) {
  if (!input || input.format !== 'fluxlab-case' || input.version !== VERSION) throw new Error('Not a supported FluxLab case (version 1).');
  const c = clone(input), def = preset();
  if (typeof c.name !== 'string' || c.name.length > 120) throw new Error('Case name must be a string of at most 120 characters.');
  for (const k of ['domain', 'fluid', 'flow', 'solver']) if (!c[k] || typeof c[k] !== 'object') throw new Error(`Missing ${k} settings.`);
  finite(c.domain.length, 'Domain length', 1e-6, 1e5); finite(c.domain.height, 'Domain height', 1e-6, 1e5);
  finite(c.domain.nx, 'Grid width', 48, 1024); c.domain.nx = Math.round(c.domain.nx);
  const ny = Math.round((c.domain.nx - 1) * c.domain.height / c.domain.length) + 1;
  if (ny < 24 || ny > 1024 || ny * c.domain.nx > 1048576) throw new Error('Mesh must be 24–1024 rows and at most 1,048,576 cells.');
  finite(c.fluid.density, 'Density', 1e-5, 1e6); finite(c.fluid.viscosity, 'Dynamic viscosity', 1e-12, 1e5);
  c.fluid.name = String(c.fluid.name ?? 'Custom fluid').slice(0, 100);
  finite(c.flow.speed, 'Reference velocity', 1e-9, 1e5); finite(c.flow.latticeSpeed, 'Lattice reference velocity', .005, .09);
  if (!['tunnel', 'cavity', 'periodic'].includes(c.flow.mode)) throw new Error('Unsupported flow mode.');
  if (!['noslip', 'periodic'].includes(c.flow.walls)) throw new Error('Unsupported lateral boundary condition.');
  if (!['uniform', 'parabolic'].includes(c.flow.profile)) throw new Error('Unsupported inlet profile.');
  if (!['trt','bgk'].includes(c.solver.collision)) throw new Error('Unsupported collision model.');
  finite(c.solver.batch, 'Steps per frame', 1, 64); c.solver.batch = Math.round(c.solver.batch);
  finite(c.solver.target, 'Target iterations', 1, 1e8); c.solver.target = Math.round(c.solver.target);
  finite(c.solver.tolerance, 'Residual tolerance', 1e-10, 1);
  c.solver.autoStop = Boolean(c.solver.autoStop);
  if (!Array.isArray(c.bodies) || c.bodies.length > 128) throw new Error('A case can contain at most 128 bodies.');
  const ids = new Set();
  for (const b of c.bodies) {
    if (!['circle','box','airfoil','polygon'].includes(b.type)) throw new Error('Unsupported body type.');
    if (typeof b.id !== 'string' || ids.has(b.id)) b.id = uid(); ids.add(b.id);
    b.name = String(b.name ?? b.type).slice(0,80);
    finite(b.x, 'Body x', -c.domain.length, 2*c.domain.length); finite(b.y, 'Body y', -c.domain.height, 2*c.domain.height);
    finite(b.width, 'Body width', 1e-8, c.domain.length*2); finite(b.height, 'Body height', 1e-8, c.domain.height*2);
    finite(b.angle, 'Body angle', -3600, 3600);
    if (b.type === 'airfoil') finite(b.thickness, 'Airfoil thickness ratio', .04, .4);
    if (b.type === 'polygon') { if (!Array.isArray(b.points) || b.points.length < 3 || b.points.length > 4096) throw new Error('Polygon needs 3–4096 local vertices.'); for (const p of b.points) { if (!Array.isArray(p) || p.length !== 2) throw new Error('Invalid polygon vertex.'); finite(p[0],'Vertex x',-2*c.domain.length,2*c.domain.length); finite(p[1],'Vertex y',-2*c.domain.height,2*c.domain.height); } }
  }
  c.display = { ...def.display, ...c.display };
  if (!['speed','pressure','vorticity','ux','uy'].includes(c.display.field)) c.display.field = 'speed';
  if (!['spectrum','viridis','ice','diverging'].includes(c.display.palette)) c.display.palette = 'spectrum';
  for (const k of ['streamlines','vectors','mesh','particles','contours','autoRange']) c.display[k] = Boolean(c.display[k]);
  finite(c.display.rangeMin, 'Color minimum', -1e12, 1e12); finite(c.display.rangeMax, 'Color maximum', -1e12, 1e12);
  if (c.display.rangeMax <= c.display.rangeMin) c.display.rangeMax = c.display.rangeMin + 1;
  c.probes = Array.isArray(c.probes) ? c.probes.slice(0,64).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x>=0 && p.y>=0 && p.x<=c.domain.length && p.y<=c.domain.height).map((p,i)=>({ id: typeof p.id==='string' ? p.id : uid(), name: String(p.name??`probe-${i+1}`).slice(0,60), x:p.x, y:p.y })) : [];
  const p = parameters(c);
  if (p.tau < .505 || p.tau > 3) throw new Error(`Relaxation time τ = ${p.tau.toFixed(4)} is outside the supported range [0.505, 3]. Refine the mesh, lower the speed, or change viscosity. Physical properties are never silently altered.`);
  return c;
}
export function parameters(c) {
  const nx = c.domain.nx, ny = Math.round((nx-1)*c.domain.height/c.domain.length)+1;
  const dx = c.domain.length/(nx-1), u = c.flow.latticeSpeed, dt = u*dx/c.flow.speed;
  const nu = c.fluid.viscosity/c.fluid.density, nuL = nu*dt/(dx*dx), tau = .5+3*nuL;
  const charLength = c.bodies.length ? c.bodies[0].width : c.domain.height;
  return { nx, ny, n: nx*ny, dx, dt, u, nu, nuL, tau, omega: 1/tau,
    odd: c.solver.collision === 'trt' ? 1/(.5+(3/16)/(tau-.5)) : 1/tau,
    mode: c.flow.mode === 'cavity' ? 1 : c.flow.mode === 'periodic' ? 2 : 0,
    profile: c.flow.profile === 'parabolic' ? 1 : 0, force: 0,
    speedScale: dx/dt, pressureScale: c.fluid.density*(dx/dt)**2/3,
    Re: c.flow.speed*charLength/nu, charLength, actualHeight: (ny-1)*dx };
}
export function outline(b) {
  let pts = [];
  if (b.type === 'circle') { for(let i=0;i<96;i++){const a=i*Math.PI/48;pts.push([Math.cos(a)*b.width/2,Math.sin(a)*b.height/2]);} }
  else if (b.type === 'box') pts = [[-b.width/2,-b.height/2],[b.width/2,-b.height/2],[b.width/2,b.height/2],[-b.width/2,b.height/2]];
  else if (b.type === 'airfoil') {
    for (let side of [1,-1]) for(let i=0;i<=100;i++) { const t=(side===1 ? i : 100-i)/100, x=.5*(1-Math.cos(t*Math.PI));
      const y=5*b.thickness*(.2969*Math.sqrt(x)-.126*x-.3516*x*x+.2843*x*x*x-.1036*x*x*x*x)*b.width;
      pts.push([(x-.5)*b.width,side*y]); }
  } else pts = b.points;
  const a=b.angle*Math.PI/180, co=Math.cos(a), si=Math.sin(a);
  return pts.map(([x,y])=>[b.x+co*x-si*y,b.y+si*x+co*y]);
}
export function contains(poly,x,y) {
  let yes=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++) { const a=poly[i],b=poly[j]; if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) yes=!yes; } return yes;
}
export function rasterize(c,p=parameters(c)) {
  const mask = new Uint32Array(p.n);
  for (const b of c.bodies) {
    const poly=outline(b), xx=poly.map(v=>v[0]), yy=poly.map(v=>v[1]);
    const x0=clamp(Math.floor(Math.min(...xx)/p.dx),0,p.nx-1),x1=clamp(Math.ceil(Math.max(...xx)/p.dx),0,p.nx-1);
    const y0=clamp(Math.floor(Math.min(...yy)/p.dx),0,p.ny-1),y1=clamp(Math.ceil(Math.max(...yy)/p.dx),0,p.ny-1);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(contains(poly,x*p.dx,y*p.dx))mask[y*p.nx+x]=1;
  }
  if(c.flow.walls==='noslip'||p.mode===1) for(let x=0;x<p.nx;x++){mask[x]=1;mask[(p.ny-1)*p.nx+x]=p.mode===1?2:1;}
  if(p.mode===1)for(let y=0;y<p.ny;y++){mask[y*p.nx]=1;mask[y*p.nx+p.nx-1]=1;}
  return mask;
}
export function equilibrium(rho,ux,uy,q) { const cu=CX[q]*ux+CY[q]*uy;return W[q]*rho*(1+3*cu+4.5*cu*cu-1.5*(ux*ux+uy*uy)); }
export function initialState(p,mask,initializer) {
  const f=new Float32Array(p.n*9),field=new Float32Array(p.n*4);
  for(let y=0;y<p.ny;y++)for(let x=0;x<p.nx;x++){
    const i=y*p.nx+x, t=(y-.5)/(p.ny-2), velocity=p.mode===1?0:p.u*(p.profile?4*t*(1-t):1);
    const init=initializer?.(x,y)??{rho:1,ux:velocity,uy:0},rho=init.rho;
    const ux=mask[i]?0:init.ux,uy=mask[i]?0:init.uy;
    for(let q=0;q<9;q++)f[q*p.n+i]=equilibrium(rho,ux,uy,q);
    field[i*4]=ux;field[i*4+1]=uy;field[i*4+2]=rho;field[i*4+3]=mask[i];
  }
  return {f,field};
}
/** State history stores only case definitions; solution buffers are deliberately not duplicated. */
export class History {
  constructor(limit=50){this.limit=limit;this.undoStack=[];this.redoStack=[];}
  push(c){this.undoStack.push(clone(c));if(this.undoStack.length>this.limit)this.undoStack.shift();this.redoStack=[];}
  undo(c){if(!this.undoStack.length)return null;this.redoStack.push(clone(c));return this.undoStack.pop();}
  redo(c){if(!this.redoStack.length)return null;this.undoStack.push(clone(c));return this.redoStack.pop();}
}
