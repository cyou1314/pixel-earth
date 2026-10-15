// Deterministic cube-sphere terrain and a drainage network. No render engine.
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const mix = (a, b, t) => a * (1 - t) + b * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const normalize = (p, fallback = [1, 0, 0]) => {
  const r = Math.hypot(p[0], p[1], p[2]);
  return r > 1e-12 ? [p[0] / r, p[1] / r, p[2] / r] : fallback.slice();
};
export const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const fract = x => x - Math.floor(x);
function hash(x, y, z) {
  x = fract(x * .1031); y = fract(y * .1031); z = fract(z * .1031);
  const d = x * (y + 33.33) + y * (z + 33.33) + z * (x + 33.33);
  x += d; y += d; z += d;
  return fract((x + y) * z);
}
export function noise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  x -= ix; y -= iy; z -= iz;
  x = x*x*(3-2*x); y = y*y*(3-2*y); z = z*z*(3-2*z);
  return mix(mix(mix(hash(ix,iy,iz), hash(ix+1,iy,iz), x), mix(hash(ix,iy+1,iz), hash(ix+1,iy+1,iz), x), y),
    mix(mix(hash(ix,iy,iz+1), hash(ix+1,iy,iz+1), x), mix(hash(ix,iy+1,iz+1), hash(ix+1,iy+1,iz+1), x), y), z);
}
const masses = [
  [[-.10,.66,.75],2.9,1], [[.84,-.35,.42],3.5,1.05], [[-.78,.05,.30],3.3,.98],
  [[.30,-.38,-.86],3,1], [[-.45,.65,-.62],3.5,.95]
].map(([p,w,s]) => [normalize(p),w,s]);
export function surface(n) {
  const [x,y,z] = n;
  const q = normalize([x+.18*(noise(x*2.6,y*2.6+3,z*2.6+9)-.5),
    y+.18*(noise(x*2.6+7.1,y*2.6+3,z*2.6+9)-.5), z+.18*(noise(x*2.6+14.2,y*2.6+3,z*2.6+9)-.5)]);
  let shape = 0;
  for (const [c,w,s] of masses) shape += s * Math.exp(-((q[0]-c[0])**2+(q[1]-c[1])**2+(q[2]-c[2])**2)*w);
  const coast = shape-.36+(noise(x*7+3,y*7+7,z*7+1)-.5)*.12+(noise(x*17+11,y*17+1,z*17+9)-.5)*.024;
  const upland = smooth(.24,.76,noise(x*3.7+12,y*3.7+6,z*3.7+21));
  const ridge = (1-Math.abs(2*noise(x*13+8,y*13+3,z*13+1)-1))**3;
  const height = coast > 0 ? .003*smooth(0,.025,coast)+(.004+.022*upland*(.35+.65*ridge))*smooth(.005,.10,coast) : Math.max(-.065,coast*.16);
  return { coast, height, upland };
}
const linear = c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4;
function color(n, data, land) {
  const {coast,height,upland} = data;
  let rgb;
  if (land) {
    const variation = Math.round(noise(n[0]*21+5,n[1]*21+19,n[2]*21+2)*7)/7;
    const t = variation*.60+upland*.40;
    rgb = [.37,.49,.30].map((c,k) => mix(c,[.48,.57,.37][k],t));
    const high = smooth(.014,.030,height)*.32;
    rgb = rgb.map((c,k) => mix(c,[.60,.58,.43][k],high));
    const beach = 1-smooth(.001,.017,coast);
    rgb = rgb.map((c,k) => mix(c,[.72,.69,.51][k],beach));
  } else {
    const shelf = smooth(-.16,-.005,coast)**1.4;
    rgb = [.07,.28,.42].map((c,k) => mix(c,[.17,.50,.49][k],shelf));
  }
  return [...rgb.map(linear),1];
}
function terrainNormal(n, data) {
  if (data.height < -.002) return n;
  const tangent = normalize(cross(Math.abs(n[1])>.95 ? [1,0,0] : [0,1,0], n));
  const bitangent = cross(n,tangent), e = .0015;
  const slope = axis => (surface(normalize(n.map((x,k)=>x+axis[k]*e))).height-surface(normalize(n.map((x,k)=>x-axis[k]*e))).height)/(2*e);
  const a = slope(tangent), b = slope(bitangent);
  return normalize(n.map((x,k)=>x-(tangent[k]*a+bitangent[k]*b)/(1+data.height)));
}
const faces = [(u,v)=>[1,v,-u],(u,v)=>[-1,v,u],(u,v)=>[u,1,-v],(u,v)=>[u,-1,v],(u,v)=>[u,v,1],(u,v)=>[-u,v,-1]];
export function cubeSphere(resolution=64, land=true, radius=1) {
  const positions=[], normals=[], colors=[], indices=[], samples=[], ids=[], unique=new Map();
  for (const face of faces) {
    const offset=positions.length/3, stride=resolution+1;
    for (let j=0;j<=resolution;j++) for(let i=0;i<=resolution;i++) {
      const n=normalize(face(i/resolution*2-1,j/resolution*2-1));
      if (land) {
        // Only cube-face border vertices can be shared between faces; interior
        // vertices are unique by construction, so only borders need dedup.
        // Integer-quantized keys avoid per-vertex string allocations.
        const border=i===0||i===resolution||j===0||j===resolution;
        const key=border?Math.round(n[0]*1e6)+','+Math.round(n[1]*1e6)+','+Math.round(n[2]*1e6):null;
        let id=key===null?undefined:unique.get(key);
        if (id===undefined) {
          id=samples.length;
          if (key!==null) unique.set(key,id);
          const data=surface(n);
          samples.push({n,...data,normal:terrainNormal(n,data),neighbors:new Set()});
        }
        const s=samples[id], r=1+s.height;
        positions.push(n[0]*r,n[1]*r,n[2]*r);
        normals.push(s.normal[0],s.normal[1],s.normal[2]);
        const c=color(n,s,true);
        colors.push(c[0],c[1],c[2],c[3]);
        ids.push(id);
      } else {
        // Ocean and cloud shells need no shared topology: their vertices are
        // final as generated. The ocean still needs the coast value for shelf
        // coloring; cloud vertex colors are unused (the cloud ShaderMaterial
        // computes its own appearance), so clouds skip the noise field entirely.
        const data=radius===1?surface(n):{coast:-1,height:0,upland:0};
        positions.push(n[0]*radius,n[1]*radius,n[2]*radius);
        normals.push(n[0],n[1],n[2]);
        const c=color(n,data,false);
        colors.push(c[0],c[1],c[2],c[3]);
      }
    }
    for(let j=0;j<resolution;j++) for(let i=0;i<resolution;i++) {
      const a=offset+j*stride+i,b=a+1,c=a+stride,d=c+1;
      indices.push(a,b,c,b,d,c);
      if(land) for(const [p,q] of [[a,b],[a,c],[b,c],[b,d],[c,d]]) {
        samples[ids[p]].neighbors.add(ids[q]); samples[ids[q]].neighbors.add(ids[p]);
      }
    }
  }
  return {positions,normals,colors,indices,samples};
}
class Heap {
  items=[];
  push(item) { const a=this.items; a.push(item); let i=a.length-1; while(i>0){const p=(i-1)>>1;if(a[p][0]<=item[0])break;a[i]=a[p];i=p;}a[i]=item; }
  pop() {const a=this.items,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1][0]<a[c][0])c++;if(a[c][0]>=last[0])break;a[i]=a[c];i=c;}a[i]=last;}return first;}
}
export function drainage(samples, threshold=70) {
  const heap=new Heap(), seen=new Uint8Array(samples.length), parent=new Int32Array(samples.length).fill(-1), order=[], levels=new Float64Array(samples.length);
  samples.forEach((s,i)=>{if(s.height<=0){seen[i]=1;heap.push([0,i]);}});
  while(heap.items.length){
    const [level,i]=heap.pop();order.push(i);levels[i]=level;
    for(const j of samples[i].neighbors)if(!seen[j]){
      seen[j]=1;parent[j]=i;heap.push([Math.max(samples[j].height,level+.000001),j]);
    }
  }
  const accumulation=new Float64Array(samples.length).fill(1), upstream=new Uint16Array(samples.length);
  for(let k=order.length-1;k>=0;k--){const i=order[k];if(parent[i]>=0)accumulation[parent[i]]+=accumulation[i];}
  const qualifies=i=>i>=0&&samples[i].height>.002&&accumulation[i]>=threshold;
  samples.forEach((s,i)=>{if(qualifies(i)&&qualifies(parent[i]))upstream[parent[i]]++;});
  const sources=samples.map((s,i)=>i).filter(i=>qualifies(i)&&!upstream[i]).sort((a,b)=>samples[b].height-samples[a].height);
  const paths=[],starts=[];
  for(const source of sources){
    if(starts.some(n=>Math.hypot(...n.map((v,k)=>v-samples[source].n[k]))<.16))continue;
    const path=[];let i=source;
    while(i>=0&&path.length<samples.length){path.push(i);if(samples[i].height<=0)break;i=parent[i];}
    if(path.length<7||samples[path.at(-1)].height>0)continue;
    paths.push(path);starts.push(samples[source].n);if(paths.length===16)break;
  }
  return {parent,levels,accumulation,paths,visited:order.length};
}
function catmull(a,b,c,d,t){return a.map((v,k)=>.5*((2*b[k])+(-v+c[k])*t+(2*v-5*b[k]+4*c[k]-d[k])*t*t+(-v+3*b[k]-3*c[k]+d[k])*t*t*t));}
export function riverGeometry(samples, network) {
  const positions=[],normals=[],indices=[];
  let lastSide=[1,0,0];
  for(const path of network.paths){
    const centers=[],widths=[],heights=[],centerNormals=[];
    for(let j=0;j<path.length-1;j++)for(let k=0;k<3;k++){
      const t=k/3;
      centers.push(normalize(catmull(samples[path[Math.max(0,j-1)]].n,samples[path[j]].n,samples[path[j+1]].n,samples[path[Math.min(path.length-1,j+2)]].n,t)));
      // Reuse the drainage samples' heights instead of re-evaluating the noise field per bank vertex.
      const h0=samples[path[j]].height,h1=samples[path[j+1]].height;
      heights.push(h0+(h1-h0)*t);
      centerNormals.push(samples[path[j]].normal);
      widths.push(Math.min(.0048,.0014+.0038*Math.sqrt(network.accumulation[path[j]]/1200)));
    }
    centers.push(samples[path.at(-1)].n);widths.push(widths.at(-1));
    heights.push(samples[path.at(-1)].height);centerNormals.push(samples[path.at(-1)].normal);
    const offset=positions.length/3,last=centers.length-1;
    centers.forEach((n,j)=>{
      const previous=centers[Math.max(0,j-1)],next=centers[Math.min(last,j+1)];
      const tangent=next.map((x,k)=>x-previous[k]);
      let side=cross(n,tangent);
      const len=Math.hypot(side[0],side[1],side[2]);
      // Degenerate tangents (coincident samples) would normalize to NaN and
      // corrupt the whole strip; fall back to the last valid side vector.
      if(len>1e-9){side=[side[0]/len,side[1]/len,side[2]/len];lastSide=side;}
      else side=lastSide;
      // Ease into the sea over the last 3 samples: fade the lift and fan out
      // slightly so the mouth reads as a delta instead of a hard cut.
      const mouth=j>=last-2?(last-j)/2:1;
      const lift=.0002+.0006*mouth, w=widths[j]*(1+(1-mouth)*.6);
      const sn=centerNormals[j];
      for(const sign of [-1,1]){
        const bank=normalize(n.map((x,k)=>x+side[k]*w*sign));
        const r=1+Math.max(0,heights[j])+lift;
        positions.push(bank[0]*r,bank[1]*r,bank[2]*r);
        // Blend the valley's terrain normal with the sphere normal so water
        // speculars follow the terrain instead of looking shrink-wrapped.
        const nx=bank[0]*.65+sn[0]*.35,ny=bank[1]*.65+sn[1]*.35,nz=bank[2]*.65+sn[2]*.35;
        const nl=Math.hypot(nx,ny,nz)||1;
        normals.push(nx/nl,ny/nl,nz/nl);
      }
      if(j>0){const a=offset+(j-1)*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
    });
  }
  return {positions,normals,indices};
}
