struct View { size:vec2f, origin:vec2f, domain:vec2f, grid:vec2f, range:vec2f, scales:vec2f, field:u32, palette:u32, mesh:u32, contours:u32, background:vec4f }
@group(0) @binding(0) var<uniform> v:View;
@group(0) @binding(1) var<storage,read> values:array<vec4f>;
@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(p[i],0,1);}
fn cell(p:vec2i)->vec4f{let q=clamp(p,vec2i(0),vec2i(v.grid)-1);return values[u32(q.y)*u32(v.grid.x)+u32(q.x)];}
fn scalar(p:vec2i)->f32{let f=cell(p);switch v.field {case 1u:{return (f.z-1.0)*v.scales.y;}case 2u:{return ((cell(p+vec2i(1,0)).y-cell(p-vec2i(1,0)).y)-(cell(p+vec2i(0,1)).x-cell(p-vec2i(0,1)).x))*v.background.w;}case 3u:{return f.x*v.scales.x;}case 4u:{return f.y*v.scales.x;}default:{return length(f.xy)*v.scales.x;}}}
fn color(t0:f32)->vec3f{let t=clamp(t0,0.0,1.0);var colors:array<vec3f,6>;
 if(v.palette==1u){colors=array<vec3f,6>(vec3f(.267,.005,.329),vec3f(.254,.265,.529),vec3f(.164,.471,.558),vec3f(.134,.659,.518),vec3f(.478,.821,.318),vec3f(.993,.906,.144));}
 else if(v.palette==2u){colors=array<vec3f,6>(vec3f(.03,.05,.14),vec3f(.10,.21,.43),vec3f(.08,.40,.66),vec3f(.11,.65,.83),vec3f(.45,.85,.88),vec3f(.95,1,1));}
 else if(v.palette==3u){colors=array<vec3f,6>(vec3f(.14,.26,.69),vec3f(.28,.53,.85),vec3f(.69,.82,.93),vec3f(.95,.78,.65),vec3f(.86,.38,.29),vec3f(.57,.08,.16));}
 else{colors=array<vec3f,6>(vec3f(.07,.09,.38),vec3f(.08,.30,.80),vec3f(.00,.74,.84),vec3f(.37,.89,.51),vec3f(.99,.81,.21),vec3f(.94,.21,.16));}
 let f=t*5.0;let j=min(u32(f),4u);return mix(colors[j],colors[j+1u],f-f32(j));}
@fragment fn fs(@builtin(position) pos:vec4f)->@location(0) vec4f{
 let uv=(pos.xy-v.origin)/v.domain;
 if(any(uv<vec2f(0))||any(uv>vec2f(1))){let grid=abs(fract(pos.xy/32.0)-.5);let line=select(0.0,.011,any(grid>vec2f(.489)));return vec4f(v.background.xyz+line,1);}
 let g=vec2f(uv.x,1.0-uv.y)*(v.grid-1.0);let i=vec2i(round(g));let c=cell(i);
 if(c.w>0.5){return vec4f(.12,.16,.22,1);}
 let b=vec2i(floor(g));let f=fract(g);
 let s=mix(mix(scalar(b),scalar(b+vec2i(1,0)),f.x),mix(scalar(b+vec2i(0,1)),scalar(b+vec2i(1,1)),f.x),f.y);
 let t=(s-v.range.x)/max(v.range.y-v.range.x,1e-15);var rgb=color(t);
 if(v.contours==1u){let band=abs(fract(t*18.0)-.5);let line=1.0-smoothstep(.0,.07,band);rgb=mix(rgb,rgb*.56,line*.6);}
 if(v.mesh==1u){let lines=abs(fract(g+.5)-.5);let a=1.0-smoothstep(.025,.085,min(lines.x,lines.y));rgb=mix(rgb,vec3f(.02,.06,.10),a*.48);}
 return vec4f(rgb,1);
}
