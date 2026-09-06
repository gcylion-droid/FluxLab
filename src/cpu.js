import {CX,CY,OPP,W,initialState} from './model.js';
/** Reference D2Q9 solver: SoA distributions, pull streaming, link bounce-back, local TRT collision.
 * CPU and WGSL execute the same boundary and collision equations. No synthetic flow fields. */
export class CPUSolver {
  constructor(p,mask,initializer){this.p=p;this.mask=mask;const a=initialState(p,mask,initializer);this.f=a.f;this.field=a.field;this.next=new Float32Array(p.n*9);this.iteration=0;this.tmp=new Float64Array(9);this.eq=new Float64Array(9);}
  step(steps=1){
    const p=this.p,{nx,ny,n,u,omega,odd,mode,profile}=p,mask=this.mask,g=this.tmp,eq=this.eq;
    for(let s=0;s<steps;s++){
      const f=this.f,out=this.next,field=this.field;
      for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
        const i=y*nx+x,k=i*4;
        if(mask[i]){for(let q=0;q<9;q++)out[q*n+i]=W[q];field[k]=0;field[k+1]=0;field[k+2]=1;field[k+3]=mask[i];continue;}
        let oldRho=0;for(let q=0;q<9;q++)oldRho+=f[q*n+i];
        for(let q=0;q<9;q++){
          let sx=x-CX[q],sy=y-CY[q];
          sy=(sy+ny)%ny;
          if(mode===2)sx=(sx+nx)%nx;else sx=Math.max(0,Math.min(nx-1,sx));
          const j=sy*nx+sx;
          g[q]=mask[j]?f[OPP[q]*n+i]+(mask[j]===2?6*W[q]*oldRho*CX[q]*u:0):f[q*n+j];
        }
        if(mode===0&&x===0){
          const t=(y-.5)/(ny-2),vx=u*(profile?4*t*(1-t):1);
          const r=(g[0]+g[2]+g[4]+2*(g[3]+g[6]+g[7]))/(1-vx);
          g[1]=g[3]+2*r*vx/3;g[5]=g[7]+(g[4]-g[2])/2+r*vx/6;g[8]=g[6]+(g[2]-g[4])/2+r*vx/6;
        }else if(mode===0&&x===nx-1){
          const vx=-1+g[0]+g[2]+g[4]+2*(g[1]+g[5]+g[8]);
          g[3]=g[1]-2*vx/3;g[7]=g[5]+(g[2]-g[4])/2-vx/6;g[6]=g[8]+(g[4]-g[2])/2-vx/6;
        }
        let rho=0,ux=0,uy=0;for(let q=0;q<9;q++){rho+=g[q];ux+=g[q]*CX[q];uy+=g[q]*CY[q];}
        ux/=rho;uy/=rho;const uu=ux*ux+uy*uy;
        field[k]=ux;field[k+1]=uy;field[k+2]=rho;field[k+3]=0;
        for(let q=0;q<9;q++){const cu=CX[q]*ux+CY[q]*uy;eq[q]=W[q]*rho*(1+3*cu+4.5*cu*cu-1.5*uu);}
        for(let q=0;q<9;q++){const j=OPP[q];out[q*n+i]=g[q]-.5*omega*(g[q]+g[j]-eq[q]-eq[j])-.5*odd*(g[q]-g[j]-eq[q]+eq[j]);}
      }
      this.f=out;this.next=f;this.iteration++;
    }
    return this.field;
  }
}
