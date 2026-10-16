import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { Material } from '@babylonjs/core/Materials/material.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Color3, Vector3, Matrix } from '@babylonjs/core/Maths/math.js';
import { createPlanetScene } from '../scene.js';
import { OceanSurface } from '../ocean.js';
import { PixelSurface } from './pixel-material.js';
import { CLOUD_FIELD, CLOUD_RADIUS } from './cloud-field.js';
import { CloudShadows } from './cloud-shadows.js';
import { cubeSphere, drainage, riverGeometry } from './terrain.js';


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
export function createCubeWorld(engine,{environment=true,resolution=80}={}){
  const model=createPlanetScene(engine,{environment}),{scene,root}=model;
  model.visualRadius=1.20;
  model.air.scaling.setAll(1.19/1.025);
  const terrain=cubeSphere(resolution,true),oceanData=cubeSphere(Math.max(16,resolution/2),false);
  const land=meshFrom('Land',terrain,scene),ocean=meshFrom('Ocean',oceanData,scene);
  land.parent=ocean.parent=root;land.receiveShadows=ocean.receiveShadows=true;
  land.material=pbr('Pixel land',scene,.95);land.material.environmentIntensity=.6;
  model.pixelSurface=new PixelSurface(land.material);
  ocean.material=pbr('Ocean water',scene,.27);ocean.material.metallicF0Factor=.56;ocean.material.environmentIntensity=.95;
  model.oceanSurface=new OceanSurface(ocean.material);
  const network=drainage(terrain.samples),riverData=riverGeometry(terrain.samples,network,terrain);
  const rivers=meshFrom('Rivers',riverData,scene);rivers.parent=root;rivers.receiveShadows=true;
  rivers.material=pbr('River water',scene,.32);rivers.material.albedoColor=Color3.FromHexString('#64b3ad').toLinearSpace();
  rivers.material.backFaceCulling=false;rivers.material.metallicF0Factor=.5;
  model.shadows.addShadowCaster(land,false);

  const cloudRoot=new TransformNode('Cloud drift',scene);cloudRoot.parent=root;
  const clouds=meshFrom('Clouds',cubeSphere(32,false,CLOUD_RADIUS),scene);clouds.parent=cloudRoot;
  const cloudMaterial=new ShaderMaterial('Thin pixel clouds',scene,{
    vertexSource:`precision highp float;attribute vec3 position;attribute vec3 normal;
      uniform mat4 worldViewProjection;uniform mat4 world;varying vec3 cloudLocal;varying vec3 cloudWorld;
      void main(){cloudLocal=position;cloudWorld=(world*vec4(position,1.0)).xyz;gl_Position=worldViewProjection*vec4(position,1.0);}`,
    fragmentSource:`precision highp float;varying vec3 cloudLocal;varying vec3 cloudWorld;
      uniform vec3 sunDirection;uniform vec3 localSun;uniform vec3 eye;uniform vec3 cloudLighting;
      ${CLOUD_FIELD}
      void main(){
        vec3 direction=normalize(cloudLocal);
        vec3 projected=direction/max(abs(direction.x),max(abs(direction.y),abs(direction.z)));
        vec3 n=normalize(floor(projected*128.0+0.5));
        float density=cloudDensity(n);
        float facing=max(0.0,dot(normalize(cloudWorld),normalize(eye-cloudWorld)));
        float alpha=smoothstep(0.58,0.80,density)*0.88*smoothstep(0.0,0.18,facing);
        if(alpha<0.012)discard;
        vec3 tangentSun=localSun-n*dot(n,localSun);
        // A density gradient gives the cloud bank a sunlit edge and shaded body.
        float slope=(cloudDensity(normalize(n+tangentSun*0.025))-density)*10.0;
        float light=smoothstep(-0.35,0.85,dot(normalize(cloudWorld),sunDirection)-slope);
        vec3 shade=mix(vec3(0.54,0.64,0.71),vec3(0.98,0.97,0.90),light);
        shade*=pow(max(0.0,(0.20+cloudLighting.y*0.18+cloudLighting.x*0.62*light)*cloudLighting.z),0.4545);
        gl_FragColor=vec4(shade,alpha);}`
  },{attributes:['position','normal'],uniforms:['worldViewProjection','world','sunDirection','localSun','eye','cloudLighting'],needAlphaBlending:true});
  cloudMaterial.backFaceCulling=true;cloudMaterial.disableDepthWrite=true;clouds.material=cloudMaterial;
  // Sort concentric transparent shells explicitly, sharing opaque depth.
  clouds.alphaIndex=20;
  const cloudState={inverse:Matrix.Identity(),sun:new Vector3(),enabled:1,strength:1};
  const localSun=new Vector3(),cloudLighting=new Vector3();
  for(const mesh of [land,ocean,rivers])new CloudShadows(mesh.material,cloudState);
  const updateBase=model.update;
  model.update=(view,light,time=0)=>{
    updateBase(view,light);
    cloudRoot.rotation.y=time*.009;
    model.sun.direction.scaleToRef(-1,cloudState.sun);
    root.computeWorldMatrix(true);
    cloudRoot.computeWorldMatrix(true).invertToRef(cloudState.inverse);
    Vector3.TransformNormalToRef(cloudState.sun,cloudState.inverse,localSun);
    cloudState.enabled=clouds.isEnabled()?1:0;
    cloudState.strength=Math.min(1,Math.max(0,light.sun/100));
    cloudMaterial.setVector3('sunDirection',cloudState.sun);
    cloudMaterial.setVector3('localSun',localSun);
    cloudLighting.set(light.sun/140,light.fill/30,light.brightness/105);
    cloudMaterial.setVector3('cloudLighting',cloudLighting);
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
  Object.assign(model,{land,ocean,rivers,clouds,terrain,network,cloudState});
  return model;
}
