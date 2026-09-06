/** Measured field statistics. Residuals are temporal changes per lattice step, not FVM equation residuals. */
export function diagnose(field, previous, p, iteration, previousIteration = 0) {
  let count=0,rhoSum=0,ke=0,maxU=0,minRho=Infinity,maxRho=-Infinity,rx=0,ry=0,rr=0,finite=true;
  const delta=Math.max(1,iteration-previousIteration),range={speed:[Infinity,-Infinity],pressure:[Infinity,-Infinity],vorticity:[Infinity,-Infinity],ux:[Infinity,-Infinity],uy:[Infinity,-Infinity]};
  for(let i=0;i<p.n;i++){
    const j=i*4;if(field[j+3]>.5)continue;const u=field[j],v=field[j+1],rho=field[j+2];
    if(!Number.isFinite(u+v+rho)){finite=false;continue;}
    count++;rhoSum+=rho;ke+=.5*rho*(u*u+v*v);maxU=Math.max(maxU,Math.hypot(u,v));minRho=Math.min(minRho,rho);maxRho=Math.max(maxRho,rho);
    if(previous){rx+=(u-previous[j])**2;ry+=(v-previous[j+1])**2;rr+=(rho-previous[j+2])**2;}
    const x=i%p.nx,y=Math.floor(i/p.nx),l=Math.max(0,x-1)+y*p.nx,r=Math.min(p.nx-1,x+1)+y*p.nx,b=Math.max(0,y-1)*p.nx+x,t=Math.min(p.ny-1,y+1)*p.nx+x;
    const vort=((field[r*4+1]-field[l*4+1])-(field[t*4]-field[b*4]))/(2*p.dt);
    const vals={speed:Math.hypot(u,v)*p.speedScale,pressure:(rho-1)*p.pressureScale,vorticity:vort,ux:u*p.speedScale,uy:v*p.speedScale};
    for(const key in vals){range[key][0]=Math.min(range[key][0],vals[key]);range[key][1]=Math.max(range[key][1],vals[key]);}
  }
  let inlet=0,outlet=0;for(let y=1;y<p.ny-1;y++){const a=y*p.nx*4,b=(y*p.nx+p.nx-1)*4;if(field[a+3]<.5)inlet+=field[a]*field[a+2];if(field[b+3]<.5)outlet+=field[b]*field[b+2];}
  return {iteration,count,meanRho:rhoSum/Math.max(1,count),energy:ke/Math.max(1,count),maxU,minRho,maxRho,mach:maxU*Math.sqrt(3),finite,range,
    residual: previous ? {x:Math.sqrt(rx/Math.max(count,1))/p.u/delta,y:Math.sqrt(ry/Math.max(count,1))/p.u/delta,density:Math.sqrt(rr/Math.max(count,1))/delta} : null,
    inlet,outlet,imbalance:Math.abs(inlet-outlet)/Math.max(Math.abs(inlet),Math.abs(outlet),1e-10)*100,
    unstable:!finite||minRho<.5||maxRho>1.5||maxU>.30 };
}
export function sample(field,p,x,y){
  const gx=x/p.dx,gy=y/p.dx;if(gx<0||gy<0||gx>p.nx-1||gy>p.ny-1)return null;
  const i=Math.min(p.nx-1,Math.round(gx))+Math.min(p.ny-1,Math.round(gy))*p.nx,j=i*4;
  return {x,y,solid:field[j+3]>.5,ux:field[j]*p.speedScale,uy:field[j+1]*p.speedScale,speed:Math.hypot(field[j],field[j+1])*p.speedScale,pressure:(field[j+2]-1)*p.pressureScale,rho:field[j+2]};
}
export function bilinearVelocity(field,p,x,y){
  if(x<.5||y<.5||x>p.nx-1.5||y>p.ny-1.5)return null;
  const ix=Math.floor(x),iy=Math.floor(y),tx=x-ix,ty=y-iy;
  const ids=[iy*p.nx+ix,iy*p.nx+ix+1,(iy+1)*p.nx+ix,(iy+1)*p.nx+ix+1];
  if(ids.some(i=>field[i*4+3]>.5))return null;
  let u=0,v=0;const weights=[(1-tx)*(1-ty),tx*(1-ty),(1-tx)*ty,tx*ty];for(let k=0;k<4;k++){u+=field[ids[k]*4]*weights[k];v+=field[ids[k]*4+1]*weights[k];}return [u,v];
}
export function fieldCSV(field,p){
  const rows=['x_m,y_m,velocity_x_m_s,velocity_y_m_s,speed_m_s,gauge_pressure_Pa,lattice_density,solid'];
  for(let y=0;y<p.ny;y++)for(let x=0;x<p.nx;x++){const j=(y*p.nx+x)*4;rows.push([x*p.dx,y*p.dx,field[j]*p.speedScale,field[j+1]*p.speedScale,Math.hypot(field[j],field[j+1])*p.speedScale,(field[j+2]-1)*p.pressureScale,field[j+2],field[j+3]>0?1:0].join(','));}return rows.join('\n');
}
export function fieldVTK(field,p){
  const rows=['# vtk DataFile Version 3.0','FluxLab D2Q9 field (SI units)','ASCII','DATASET STRUCTURED_POINTS',`DIMENSIONS ${p.nx} ${p.ny} 1`,'ORIGIN 0 0 0',`SPACING ${p.dx} ${p.dx} 1`,`POINT_DATA ${p.n}`,'VECTORS velocity float'];
  for(let i=0;i<p.n;i++)rows.push(`${field[i*4]*p.speedScale} ${field[i*4+1]*p.speedScale} 0`);
  rows.push('SCALARS gauge_pressure float 1','LOOKUP_TABLE default');for(let i=0;i<p.n;i++)rows.push(String((field[i*4+2]-1)*p.pressureScale));
  rows.push('SCALARS solid int 1','LOOKUP_TABLE default');for(let i=0;i<p.n;i++)rows.push(field[i*4+3]>.5?'1':'0');return rows.join('\n');
}
