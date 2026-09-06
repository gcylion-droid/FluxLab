struct Params { nx:u32, ny:u32, mode:u32, profile:u32, omega:f32, odd:f32, u:f32, force:f32 }
@group(0) @binding(0) var<uniform> p:Params;
@group(0) @binding(1) var<storage,read> src:array<f32>;
@group(0) @binding(2) var<storage,read_write> dst:array<f32>;
@group(0) @binding(3) var<storage,read> solid:array<u32>;
@group(0) @binding(4) var<storage,read_write> field:array<vec4f>;
const cx=array<i32,9>(0,1,0,-1,0,1,-1,-1,1);
const cy=array<i32,9>(0,0,1,0,-1,1,1,-1,-1);
const opp=array<u32,9>(0,3,4,1,2,7,8,5,6);
const w=array<f32,9>(0.44444444444,0.11111111111,0.11111111111,0.11111111111,0.11111111111,0.02777777778,0.02777777778,0.02777777778,0.02777777778);
@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;let n=p.nx*p.ny;if(i>=n){return;}
 let x=i%p.nx;let y=i/p.nx;
 if(solid[i]!=0u){for(var q=0u;q<9u;q++){dst[q*n+i]=w[q];}field[i]=vec4f(0,0,1,f32(solid[i]));return;}
 var g:array<f32,9>;var eq:array<f32,9>;var oldRho=0.0;
 for(var q=0u;q<9u;q++){oldRho+=src[q*n+i];}
 for(var q=0u;q<9u;q++){
  var sx=i32(x)-cx[q];let sy=(i32(y)-cy[q]+i32(p.ny))%i32(p.ny);
  if(p.mode==2u){sx=(sx+i32(p.nx))%i32(p.nx);}else{sx=clamp(sx,0,i32(p.nx)-1);}
  let j=u32(sy)*p.nx+u32(sx);
  if(solid[j]!=0u){g[q]=src[opp[q]*n+i];if(solid[j]==2u){g[q]+=6.0*w[q]*oldRho*f32(cx[q])*p.u;}}
  else{g[q]=src[q*n+j];}
 }
 if(p.mode==0u&&x==0u){
  let t=(f32(y)-0.5)/f32(p.ny-2u);let vx=p.u*select(1.0,4.0*t*(1.0-t),p.profile==1u);
  let r=(g[0]+g[2]+g[4]+2.0*(g[3]+g[6]+g[7]))/(1.0-vx);
  g[1]=g[3]+2.0*r*vx/3.0;g[5]=g[7]+(g[4]-g[2])/2.0+r*vx/6.0;g[8]=g[6]+(g[2]-g[4])/2.0+r*vx/6.0;
 }else if(p.mode==0u&&x==p.nx-1u){
  let vx=-1.0+g[0]+g[2]+g[4]+2.0*(g[1]+g[5]+g[8]);
  g[3]=g[1]-2.0*vx/3.0;g[7]=g[5]+(g[2]-g[4])/2.0-vx/6.0;g[6]=g[8]+(g[4]-g[2])/2.0-vx/6.0;
 }
 var rho=0.0;var ux=0.0;var uy=0.0;
 for(var q=0u;q<9u;q++){rho+=g[q];ux+=g[q]*f32(cx[q]);uy+=g[q]*f32(cy[q]);}
 ux/=rho;uy/=rho;let uu=ux*ux+uy*uy;field[i]=vec4f(ux,uy,rho,0);
 for(var q=0u;q<9u;q++){let cu=f32(cx[q])*ux+f32(cy[q])*uy;eq[q]=w[q]*rho*(1.0+3.0*cu+4.5*cu*cu-1.5*uu);}
 for(var q=0u;q<9u;q++){let j=opp[q];dst[q*n+i]=g[q]-0.5*p.omega*(g[q]+g[j]-eq[q]-eq[j])-0.5*p.odd*(g[q]-g[j]-eq[q]+eq[j]);}
}
