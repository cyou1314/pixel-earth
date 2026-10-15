import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { Material } from '@babylonjs/core/Materials/material.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Color3, Vector3 } from '@babylonjs/core/Maths/math.js';
import { createPlanetScene } from '../scene.js';
import { OceanSurface } from '../ocean.js';
import { PixelSurface } from './pixel-material.js';
import { cubeSphere, drainage, riverGeometry } from './terrain.js';

// Reused across frames so the render loop allocates no throwaway vectors.
const sunDir = new Vector3();

function meshFrom(name,data,scene){
  const mesh=new Mesh(name,scene), vertices=new VertexData();
  vertices.positions=data.positions;vertices.normals=data.normals;vertices.indices=data.indices;
  if(data.colors)vertices.colors=data.colors;
  vertices.applyToMesh(mesh);
  // These explicit indices are outward CCW. Babylon's RH default is CW.
  mesh.sideOrientation=Material.CounterClockWiseSideOrientation;
  mesh.isPickable=false;return mesh;
}
function pbr(name,scene,roughness){const m=new PBRMaterial(name,scene);m.albedoColor=Color3.White();m.metallic=0;m.roughness=roughness;m.enableSpecularAntiAliasing=true;return m;}
export function createCubeWorld(engine,{environment=true,resolution=64}={}){
  const model=createPlanetScene(engine,{environment}),{scene,root}=model;
  model.air.scaling.setAll(1.065);
  const terrain=cubeSphere(resolution,true),oceanData=cubeSphere(Math.max(16,resolution/2),false);
  const land=meshFrom('Land',terrain,scene),ocean=meshFrom('Ocean',oceanData,scene);
  land.parent=ocean.parent=root;land.receiveShadows=ocean.receiveShadows=true;
  land.material=pbr('Pixel land',scene,.95);land.material.environmentIntensity=.6;
  model.pixelSurface=new PixelSurface(land.material);
  ocean.material=pbr('Ocean water',scene,.27);ocean.material.metallicF0Factor=.56;ocean.material.environmentIntensity=.95;
  model.oceanSurface=new OceanSurface(ocean.material);
  const network=drainage(terrain.samples),riverData=riverGeometry(terrain.samples,network);
  const rivers=meshFrom('Rivers',riverData,scene);rivers.parent=root;rivers.receiveShadows=true;
  rivers.material=pbr('River water',scene,.32);rivers.material.albedoColor=Color3.FromHexString('#64b3ad').toLinearSpace();
  rivers.material.backFaceCulling=false;rivers.material.metallicF0Factor=.5;
  model.shadows.addShadowCaster(land,false);

  const cloudRoot=new TransformNode('Cloud drift',scene);cloudRoot.parent=root;
  const clouds=meshFrom('Clouds',cubeSphere(24,false,1.075),scene);clouds.parent=cloudRoot;
  const cloudMaterial=new ShaderMaterial('Thin pixel clouds',scene,{
    vertexSource:`precision highp float;attribute vec3 position;attribute vec3 normal;
      uniform mat4 worldViewProjection;uniform mat4 world;varying vec3 cloudLocal;varying vec3 cloudWorld;
      void main(){cloudLocal=position;cloudWorld=(world*vec4(position,1.0)).xyz;gl_Position=worldViewProjection*vec4(position,1.0);}`,
    fragmentSource:`precision highp float;varying vec3 cloudLocal;varying vec3 cloudWorld;
      uniform vec3 sunDirection;uniform vec3 eye;
      float hash(vec3 p){p=fract(p*0.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
      float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      void main(){vec3 n=normalize(cloudLocal);vec3 p=normalize(floor(n*128.0+0.5))*7.5;
        float facing=max(0.0,dot(normalize(cloudWorld),normalize(eye-cloudWorld)));
        float edgeFade=smoothstep(0.0,0.2,facing);
        if(edgeFade<0.01)discard;
        float n1=noise(p+vec3(4,8,2));
        // Early-out: even with the second octave at full strength this texel
        // stays below the cover threshold, so skip the remaining work.
        if(n1*0.72+0.28<0.64)discard;
        float density=n1*0.72+noise(p*2.7+9.0)*0.28;
        float alpha=smoothstep(0.64,0.82,density)*0.72*edgeFade;
        if(alpha<0.012)discard;
        float light=smoothstep(-0.55,0.8,dot(normalize(cloudWorld),sunDirection));
        gl_FragColor=vec4(mix(vec3(0.67,0.76,0.79),vec3(0.98,0.98,0.91),light),alpha);}`
  },{attributes:['position','normal'],uniforms:['worldViewProjection','world','sunDirection','eye'],needAlphaBlending:true});
  cloudMaterial.backFaceCulling=true;cloudMaterial.disableDepthWrite=true;clouds.material=cloudMaterial;
  const updateBase=model.update;
  model.update=(view,light,time=0)=>{
    updateBase(view,light);
    cloudRoot.rotation.y=time*.009;
    model.sun.direction.scaleToRef(-1, sunDir);
    cloudMaterial.setVector3('sunDirection', sunDir);
    cloudMaterial.setVector3('eye', model.camera.position);
    model.oceanSurface.time=time;
  };
  // Static geometry: skip per-frame bounding-info sync and frustum culling.
  // The globe is always centered, so these meshes are always rendered.
  for (const mesh of [land, ocean, rivers, clouds]) {
    mesh.doNotSyncBoundingInfo = true;
    mesh.alwaysSelectAsActiveMesh = true;
  }
  // The drainage neighbor graph served its purpose during the build;
  // release the sets so they don't linger on the heap.
  for (const s of terrain.samples) s.neighbors = null;
  Object.assign(model,{land,ocean,rivers,clouds,terrain,network});
  return model;
}
