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
  // Broad, connected ridges carry the silhouette. Small high-frequency noise
  // stays in the color field so the planet does not become a spiky noise ball.
  const warp = noise(x*3.1+4,y*3.1+17,z*3.1+8)-.5;
  const ridge = (1-Math.abs(2*noise(x*6.2+8+warp*.8,y*6.2+3,z*6.2+1)-1))**1.8;
  const foothills = noise(x*8.5+21,y*8.5+13,z*8.5+5);
  const inland = smooth(.008,.15,coast);
  const height = coast > 0
    ? .003*smooth(0,.025,coast)+inland*(.006+.016*foothills+.104*upland*(.22+.78*ridge))
    : Math.max(-.065,coast*.16);
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
    const slope = 1-(data.normal?.reduce((sum,value,k)=>sum+value*n[k],0)??1);
    const exposed = smooth(.045,.23,slope)*.62+smooth(.06,.115,height)*.38;
    rgb = rgb.map((c,k) => mix(c,[.56,.55,.46][k],Math.min(.84,exposed)));
    const summit = smooth(.098,.129,height)*.38;
    rgb = rgb.map((c,k) => mix(c,[.72,.73,.66][k],summit));
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
const terrainBySamples = new WeakMap();
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
// Face-local homogeneous coordinates: u / w and v / w address the cube grid.
const faceCoordinates = (p,face) => {
  const [x,y,z]=p;
  switch(face){
    case 0:return [-z,y,x];case 1:return [z,y,-x];
    case 2:return [x,-z,y];case 3:return [x,z,-y];
    case 4:return [x,y,z];default:return [-x,y,-z];
  }
};
function faceOf(n) {
  const [x,y,z]=n.map(Math.abs);
  return x>=y&&x>=z?(n[0]>=0?0:1):y>=z?(n[1]>=0?2:3):(n[2]>=0?4:5);
}
function triangleAt(terrain,face,i,j,upper=false) {
  const stride=terrain.resolution+1, a=face*stride*stride+j*stride+i;
  return upper?[a+1,a+stride+1,a+stride]:[a,a+1,a+stride];
}
function sampleTriangle(terrain,n,triangle) {
  const p=triangle.map(id=>terrain.positions.slice(id*3,id*3+3));
  const u=p[1].map((x,k)=>x-p[0][k]),v=p[2].map((x,k)=>x-p[0][k]);
  const plane=cross(u,v), radius=dot(plane,p[0])/dot(plane,n);
  const q=n.map((x,k)=>x*radius-p[0][k]);
  const uu=dot(u,u),uv=dot(u,v),vv=dot(v,v),qu=dot(q,u),qv=dot(q,v);
  const denominator=uu*vv-uv*uv, b=(vv*qu-uv*qv)/denominator,c=(uu*qv-uv*qu)/denominator;
  const weights=[1-b-c,b,c], normal=[0,0,0];
  triangle.forEach((id,index)=>{for(let k=0;k<3;k++)normal[k]+=terrain.normals[id*3+k]*weights[index];});
  return {height:radius-1,normal:normalize(normal),triangle};
}
function sampleSurface(terrain,n) {
  const face=faceOf(n),[u,v,w]=faceCoordinates(n,face),r=terrain.resolution;
  const x=clamp((u/w+1)*r/2,0,r),y=clamp((v/w+1)*r/2,0,r);
  const i=Math.min(r-1,Math.floor(x)),j=Math.min(r-1,Math.floor(y));
  return sampleTriangle(terrain,n,triangleAt(terrain,face,i,j,x-i+y-j>1));
}
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
  const terrain={positions,normals,colors,indices,samples,resolution};
  if(land){
    terrain.sampleSurface=n=>sampleSurface(terrain,n);
    terrainBySamples.set(samples,terrain);
  }
  return terrain;
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
// Clip a convex polygon; all extra attributes interpolate with its coordinates.
function clipPolygon(polygon,distance) {
  const output=[];
  for(let k=0;k<polygon.length;k++){
    const a=polygon[k],b=polygon[(k+1)%polygon.length],da=distance(a),db=distance(b);
    if(da>=-1e-12)output.push(a);
    if((da>1e-12&&db< -1e-12)||(da< -1e-12&&db>1e-12)){
      const t=da/(da-db);output.push(a.map((x,i)=>mix(x,b[i],t)));
    }
  }
  return output;
}
function appendRiverTriangle(terrain,vertices,geometry) {
  const {positions,normals,indices}=geometry,r=terrain.resolution;
  // A strip can cross a cube seam. Clip its angular triangle to each face,
  // then to the underlying grid triangles. Every emitted triangle therefore
  // sits on one actual terrain triangle, including across sharp valley folds.
  for(let face=0;face<6;face++){
    let polygon=vertices.map(v=>[...faceCoordinates(v,face),v[3]]);
    for(const plane of [p=>p[2]-p[0],p=>p[2]+p[0],p=>p[2]-p[1],p=>p[2]+p[1]]){
      polygon=clipPolygon(polygon,plane);if(polygon.length<3)break;
    }
    if(polygon.length<3||polygon.some(p=>p[2]<=0))continue;
    // Perspective-correct the lift while clipping in the cube's u/v plane.
    polygon=polygon.map(([u,v,w,lift])=>[(u/w+1)*r/2,(v/w+1)*r/2,lift/w,1/w]);
    const minX=Math.max(0,Math.floor(Math.min(...polygon.map(p=>p[0]))));
    const maxX=Math.min(r-1,Math.floor(Math.max(...polygon.map(p=>p[0]))));
    const minY=Math.max(0,Math.floor(Math.min(...polygon.map(p=>p[1]))));
    const maxY=Math.min(r-1,Math.floor(Math.max(...polygon.map(p=>p[1]))));
    for(let j=minY;j<=maxY;j++)for(let i=minX;i<=maxX;i++){
      let cell=polygon;
      for(const plane of [p=>p[0]-i,p=>i+1-p[0],p=>p[1]-j,p=>j+1-p[1]]){
        cell=clipPolygon(cell,plane);if(cell.length<3)break;
      }
      if(cell.length<3)continue;
      for(const upper of [false,true]){
        const piece=clipPolygon(cell,p=>(p[0]-i+p[1]-j-1)*(upper?1:-1));
        if(piece.length<3)continue;
        // Clipping exactly on an edge may create a zero-area polygon.
        let area=0;
        for(let k=0;k<piece.length;k++){const a=piece[k],b=piece[(k+1)%piece.length];area+=a[0]*b[1]-b[0]*a[1];}
        if(Math.abs(area)<1e-12)continue;
        const triangle=triangleAt(terrain,face,i,j,upper),offset=positions.length/3;
        for(const [x,y,liftOverW,oneOverW] of piece){
          const n=normalize(faces[face](x/r*2-1,y/r*2-1));
          const sample=sampleTriangle(terrain,n,triangle);
          const radius=1+Math.max(0,sample.height)+liftOverW/oneOverW;
          positions.push(...n.map(value=>value*radius));
          const normal=normalize(n.map((value,k)=>value*.65+sample.normal[k]*.35));
          normals.push(...normal);
        }
        for(let k=1;k<piece.length-1;k++){
          // A clipped corner can coincide with a fan vertex at float precision.
          const a=positions.slice(offset*3,offset*3+3);
          const b=positions.slice((offset+k)*3,(offset+k)*3+3);
          const c=positions.slice((offset+k+1)*3,(offset+k+1)*3+3);
          if(Math.hypot(...cross(b.map((x,j)=>x-a[j]),c.map((x,j)=>x-a[j])))<1e-12)continue;
          if(area>0)indices.push(offset,offset+k,offset+k+1);
          else indices.push(offset,offset+k+1,offset+k);
        }
      }
    }
  }
}
export function riverGeometry(samples, network, terrain=terrainBySamples.get(samples)) {
  const geometry={positions:[],normals:[],indices:[]};
  let lastSide=[1,0,0];
  for(const path of network.paths){
    const centers=[],widths=[];
    for(let j=0;j<path.length-1;j++)for(let k=0;k<3;k++){
      const t=k/3;
      centers.push(normalize(catmull(samples[path[Math.max(0,j-1)]].n,samples[path[j]].n,samples[path[j+1]].n,samples[path[Math.min(path.length-1,j+2)]].n,t)));
      widths.push(Math.min(.0048,.0014+.0038*Math.sqrt(network.accumulation[path[j]]/1200)));
    }
    centers.push(samples[path.at(-1)].n);widths.push(widths.at(-1));
    const rows=[],last=centers.length-1;
    centers.forEach((n,j)=>{
      const previous=centers[Math.max(0,j-1)],next=centers[Math.min(last,j+1)];
      const tangent=next.map((x,k)=>x-previous[k]);
      let side=cross(n,tangent);
      const len=Math.hypot(...side);
      if(len>1e-9){side=side.map(x=>x/len);lastSide=side;}
      else side=lastSide;
      const mouth=j>=last-2?(last-j)/2:1;
      const lift=.0002+.0006*mouth,w=widths[j]*(1+(1-mouth)*.6);
      rows.push([-1,1].map(sign=>[...normalize(n.map((x,k)=>x+side[k]*w*sign)),lift]));
    });
    for(let j=1;j<rows.length;j++){
      const [a,b]=rows[j-1],[c,d]=rows[j];
      for(const triangle of [[a,c,b],[b,c,d]]){
        if(terrain)appendRiverTriangle(terrain,triangle,geometry);
        else {
          // Compatibility for callers supplying their own drainage samples.
          // Cube-sphere callers use the exact mesh projection above.
          const offset=geometry.positions.length/3;
          for(const vertex of triangle){
            const n=vertex.slice(0,3),s=surface(n),radius=1+Math.max(0,s.height)+vertex[3];
            geometry.positions.push(...n.map(x=>x*radius));geometry.normals.push(...terrainNormal(n,s));
          }
          geometry.indices.push(offset,offset+1,offset+2);
        }
      }
    }
  }
  return geometry;
}
