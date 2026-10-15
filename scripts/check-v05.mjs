import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture.js';
import { InternalTexture, InternalTextureSource } from '@babylonjs/core/Materials/Textures/internalTexture.js';
import { Vector3 } from '@babylonjs/core/Maths/math.js';
import { SphericalPolynomial } from '@babylonjs/core/Maths/sphericalPolynomial.js';
import { WebGLShaderProcessor } from '@babylonjs/core/Engines/WebGL/webGLShaderProcessors.js';
import { createCubeWorld } from '../src/v05/world.js';
import { INITIAL_VIEW, LIGHT_PRESETS, framePlanet, limitZoom } from '../src/scene.js';
import { GestureInput } from '../src/v05/gesture-input.js';
import { HandCamera } from '../src/v05/hand-camera.js';

const engine=new NullEngine({renderWidth:1280,renderHeight:800,textureSize:128});
engine._shaderProcessor=new WebGLShaderProcessor();
const model=createCubeWorld(engine,{environment:false});
const reflection=new CubeTexture('',model.scene);
reflection._texture=new InternalTexture(engine,InternalTextureSource.Cube,true);
Object.assign(reflection._texture,{isReady:true,isCube:true,width:16,height:16});
reflection.sphericalPolynomial=new SphericalPolynomial();model.scene.environmentTexture=reflection;
assert.equal(model.terrain.samples.length,6*64*64+2,'Cube edges and corners join exactly');
const meshes={};
for(const name of ['Land','Ocean','Rivers','Clouds']){
  const mesh=model.scene.getMeshByName(name),p=mesh.getVerticesData(VertexBuffer.PositionKind),n=mesh.getVerticesData(VertexBuffer.NormalKind);
  assert(p.every(Number.isFinite)&&n.every(Number.isFinite),name+' finite geometry');
  let min=Infinity,max=0;
  for(let i=0;i<p.length;i+=3){
    const radius=Math.hypot(...p.slice(i,i+3));min=Math.min(min,radius);max=Math.max(max,radius);
    assert(Math.abs(Math.hypot(...n.slice(i,i+3))-1)<.001,name+' normalized normals');
    assert(p[i]*n[i]+p[i+1]*n[i+1]+p[i+2]*n[i+2]>0,name+' outward normals');
  }
  meshes[name]={vertices:p.length/3,triangles:mesh.getTotalIndices()/3,minRadius:min,maxRadius:max};
  assert.equal(mesh.material._getEffectiveOrientation(mesh),1,name+' explicitly uses CCW front faces in the RH scene');
  if(name!=='Rivers'){
    const ids=mesh.getIndices();
    for(let k=0;k<ids.length;k+=3){
      const [a,b,c]=Array.from(ids.slice(k,k+3),id=>Array.from(p.slice(id*3,id*3+3)));
      const u=b.map((x,i)=>x-a[i]),v=c.map((x,i)=>x-a[i]);
      const outward=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      assert(outward.reduce((sum,x,i)=>sum+x*a[i],0)>0,name+' triangle winding faces outside');
    }
  }
}
assert(meshes.Land.maxRadius>1.02&&meshes.Land.maxRadius<1.04);
assert(Math.abs(meshes.Ocean.minRadius-1)<.00001&&Math.abs(meshes.Ocean.maxRadius-1)<.00001);
assert(meshes.Rivers.minRadius>1&&meshes.Clouds.minRadius>meshes.Land.maxRadius);
const pos=model.land.getVerticesData(VertexBuffer.PositionKind),norm=model.land.getVerticesData(VertexBuffer.NormalKind),indices=model.land.getIndices();
const duplicates=new Map();let seamDot=1,area=0,landArea=0;
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
for(let i=0;i<pos.length;i+=3){
  const key=Array.from(pos.slice(i,i+3),x=>x.toFixed(7)).join(',');
  if(duplicates.has(key))seamDot=Math.min(seamDot,dot(duplicates.get(key),norm.slice(i,i+3)));
  else duplicates.set(key,norm.slice(i,i+3));
}
assert(seamDot>.99999,'No shading seams between cube faces');
for(let i=0;i<indices.length;i+=3){
  const tri=Array.from(indices.slice(i,i+3),id=>Array.from(pos.slice(id*3,id*3+3)));
  const radii=tri.map(p=>Math.hypot(...p)),[a,b,c]=tri.map((p,k)=>p.map(x=>x/radii[k]));
  const cross=[b[1]*c[2]-b[2]*c[1],b[2]*c[0]-b[0]*c[2],b[0]*c[1]-b[1]*c[0]];
  const solid=2*Math.atan2(Math.abs(dot(a,cross)),1+dot(a,b)+dot(b,c)+dot(c,a));
  area+=solid;if(radii.reduce((a,b)=>a+b)/3>1)landArea+=solid;
}
assert(Math.abs(area-4*Math.PI)<.001);assert(landArea/area>.42&&landArea/area<.57);
assert.equal(model.network.visited,model.terrain.samples.length);
assert(model.network.paths.length>=8);
for(let i=0;i<model.network.parent.length;i++){
  const parent=model.network.parent[i];
  if(parent>=0)assert(model.network.levels[parent]<model.network.levels[i],'Drainage has no uphill cycles in filled surface');
}
for(const path of model.network.paths){
  assert(model.terrain.samples[path[0]].height>0);
  assert(model.terrain.samples[path.at(-1)].height<=0,'Every displayed river reaches the sea');
  assert.equal(new Set(path).size,path.length);
}
for(const light of Object.values(LIGHT_PRESETS))model.update(INITIAL_VIEW,light,2);
assert.equal(model.oceanSurface.time,2);assert.equal(model.clouds.parent.rotation.y,.018);
model.clouds.setEnabled(false);assert(!model.clouds.isEnabled());model.clouds.setEnabled(true);
for(const [width,height]of [[1280,800],[1920,1080],[800,800],[393,852],[320,568],[844,390]]){
  const e=new NullEngine({renderWidth:width,renderHeight:height});
  const world=createCubeWorld(e,{environment:false,resolution:16});
  framePlanet(world.camera,width,height);
  const transform=world.camera.getViewMatrix().multiply(world.camera.getProjectionMatrix(true));
  for(let j=0;j<=64;j++)for(let i=0;i<128;i++){
    const t=Math.PI*j/64,p=Math.PI*2*i/128;
    const v=Vector3.TransformCoordinates(new Vector3(1.095*Math.sin(t)*Math.cos(p),1.095*Math.cos(t),1.095*Math.sin(t)*Math.sin(p)),transform);
    assert(Math.abs(v.x)<.98&&Math.abs(v.y)<.98,'Globe, clouds and atmosphere fit at '+width+'x'+height);
  }
  world.dispose();e.dispose();
}
model.update({...INITIAL_VIEW,distance:limitZoom(0)},LIGHT_PRESETS.day,0);
assert.equal(model.camera.position.z,1.65);
model.update(INITIAL_VIEW,LIGHT_PRESETS.day,0);
await model.scene.whenReadyAsync();model.scene.render();
await mkdir('.qa/v05-shaders',{recursive:true});
for(const name of ['Land','Ocean','Rivers','Clouds','Atmosphere']){
  const mesh=model.scene.getMeshByName(name),effect=mesh.subMeshes[0].effect;
  assert(effect?.isReady(),name+' prepared shader');
  if(name==='Land')assert(effect.fragmentSourceCode.includes('pixelHash'));
  if(name==='Ocean')assert(effect.fragmentSourceCode.includes('oceanWave')&&effect.fragmentSourceCode.includes('reflectionSampler'));
  await writeFile('.qa/v05-shaders/'+name+'.vert',(effect.defines??'')+'\n'+effect.vertexSourceCode);
  await writeFile('.qa/v05-shaders/'+name+'.frag',(effect.defines??'')+'\n'+effect.fragmentSourceCode);
}

// Synthetic landmark fixtures exercise view mapping; no claim of a real hand test.
const points=Array.from({length:21},()=>({x:.5,y:.55}));
Object.assign(points[0],{x:.5,y:.85});Object.assign(points[5],{x:.38,y:.55});Object.assign(points[17],{x:.65,y:.55});
for(const [tip,pip,x]of [[8,6,.38],[12,10,.47],[16,14,.56],[20,18,.65]]){Object.assign(points[tip],{x,y:.2});Object.assign(points[pip],{x,y:.43});}
Object.assign(points[4],{x:.18,y:.6});
const input=new GestureInput();assert.equal(input.update(points,INITIAL_VIEW).mode,'palm');
const moved=points.map(p=>({...p,x:p.x+.04}));const rotated=input.update(moved,INITIAL_VIEW);assert(rotated.yaw<INITIAL_VIEW.yaw);
const pinched=points.map(p=>({...p}));pinched[4]={x:pinched[8].x+.02,y:pinched[8].y};
assert.equal(input.update(pinched,INITIAL_VIEW).mode,'pinch');
const closer=pinched.map(p=>({x:.5+(p.x-.5)*1.5,y:.5+(p.y-.5)*1.5}));
assert(input.update(closer,INITIAL_VIEW).distance<INITIAL_VIEW.distance);
assert.equal(input.update(null,INITIAL_VIEW).mode,'missing');
assert.equal(input.update(points,INITIAL_VIEW).yaw,undefined,'Reacquisition must not jump');

// Camera lifecycle checks use stub APIs, without accessing any actual camera.
let raf=0;const callbacks=new Map(),events=[],errors=[];let stopped=0,closed=0;
const savedGlobals=new Map(['requestAnimationFrame','cancelAnimationFrame','document','navigator','Hands'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
globalThis.requestAnimationFrame=callback=>{callbacks.set(++raf,callback);return raf;};
globalThis.cancelAnimationFrame=id=>callbacks.delete(id);
globalThis.document={hidden:false};
const stream={getTracks:()=>[{stop(){stopped++;}}]};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>stream}}});
globalThis.Hands=class{setOptions(o){assert.equal(o.modelComplexity,0);}onResults(callback){this.callback=callback;}async initialize(){}async send(){this.callback({multiHandLandmarks:[points]});}async close(){closed++;}};
const video={srcObject:null,readyState:2,async play(){},pause(){}};
const camera=new HandCamera(video,{onPoints:p=>assert.equal(p.length,21),onStatus:s=>events.push(s),onState:s=>events.push(s),onError:e=>errors.push(e)});
await camera.start();assert(camera.active);assert.equal(video.srcObject,stream);
await callbacks.get(raf)(200);await camera.stop();assert(!camera.active);assert.equal(video.srcObject,null);assert.equal(stopped,1);assert.equal(closed,1);
let grant;
navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{grant=resolve;});
const waiting=camera.start();await Promise.resolve();await camera.stop();grant(stream);await waiting;assert.equal(stopped,2);assert(!camera.active);
navigator.mediaDevices.getUserMedia=async()=>{throw Object.assign(new Error('denied'),{name:'NotAllowedError'});};
await camera.start();assert(!camera.active&&errors.at(-1).includes('授权'));
let finishInitialization,created=0,initializingClosed=0;
navigator.mediaDevices.getUserMedia=async()=>stream;
globalThis.Hands=class{
  constructor(){this.id=++created;}setOptions(){}onResults(){}
  initialize(){return this.id===1?new Promise(resolve=>{finishInitialization=resolve;}):Promise.resolve();}
  async close(){initializingClosed++;}
};
const initializing=camera.start();
for(let i=0;i<12&&!finishInitialization;i++)await Promise.resolve();
assert(finishInitialization,'Model initialization started');
const cancelling=camera.stop();assert(!camera.active&&video.srcObject===null,'Camera stops before model loading finishes');
const restarting=camera.start();await Promise.resolve();assert.equal(created,1,'Do not start two WebAssembly initializers concurrently');
finishInitialization();await Promise.all([initializing,cancelling,restarting]);
assert.equal(created,2);assert.equal(initializingClosed,1);assert(camera.active);
await camera.stop();assert.equal(initializingClosed,2);
for(const [key,descriptor]of savedGlobals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}

for(const file of ['hands.js','hands.binarypb','hand_landmark_lite.tflite','hands_solution_packed_assets.data','hands_solution_packed_assets_loader.js','hands_solution_simd_wasm_bin.js','hands_solution_simd_wasm_bin.wasm','hands_solution_wasm_bin.js','hands_solution_wasm_bin.wasm'])assert((await stat('dist/assets/hands/'+file)).size>0,file);
assert.equal((await readFile('dist/assets/hands/hand_landmark_lite.tflite')).subarray(4,8).toString(),'TFL3');
for(const name of ['hands_solution_simd_wasm_bin.wasm','hands_solution_wasm_bin.wasm'])assert.equal((await readFile('dist/assets/hands/'+name)).readUInt32LE(0),0x6d736100);
const html=await readFile('dist/index.html','utf8');const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
for(const file of ['src/v05/app.js','pixel-earth.html'])for(const match of (await readFile(file,'utf8')).matchAll(/querySelector\('#([^']+)'\)/g))assert(ids.includes(match[1]),file+': '+match[1]);
const report={version:'0.5.0',renderer:'Babylon.js 9.30.0',meshes,landCoverage:landArea/area,rivers:model.network.paths.length,cubeFaceSeamDot:seamDot,
  checks:['actual cube-sphere meshes and outward normals','seam continuity and area-weighted land/ocean coverage','priority-flood drainage with sea outlets','river strips above terrain and cloud shell','lighting, water time, cloud toggle and reset','six actual camera projections','five prepared shader programs including reflection branch','synthetic palm rotation, pinch zoom and loss/reacquisition','stub camera permission denial, live stream shutdown and cancellation while awaiting permission','cancellation and serialized restart during model initialization','local MediaPipe model, graph and WebAssembly assets','DOM bindings and unique IDs'],
  verification:'NullEngine does not render pixels. Synthetic landmarks and stub camera APIs do not verify a real camera or human gestures. Browser WebGL, CSS, device performance and real gesture recognition remain unverified.'};
await mkdir('docs/previews/world-v0.5',{recursive:true});await writeFile('docs/previews/world-v0.5/validation.json',JSON.stringify(report,null,2)+'\n');
await writeFile('.qa/world-v05.json',JSON.stringify({land:{positions:model.terrain.positions,normals:model.terrain.normals,indices:model.terrain.indices,colors:model.terrain.colors},ocean: {positions:model.ocean.getVerticesData(VertexBuffer.PositionKind),normals:model.ocean.getVerticesData(VertexBuffer.NormalKind),indices:model.ocean.getIndices(),colors:model.ocean.getVerticesData(VertexBuffer.ColorKind)},rivers:{positions:model.rivers.getVerticesData(VertexBuffer.PositionKind),indices:model.rivers.getIndices()}}));
model.dispose();engine.dispose();console.log(JSON.stringify(report,null,2));
