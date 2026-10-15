import { Scene } from '@babylonjs/core/scene.js';
import { Vector3, Quaternion, Color3, Color4 } from '@babylonjs/core/Maths/math.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
import { HDRCubeTexture } from '@babylonjs/core/Materials/Textures/hdrCubeTexture.js';

export const INITIAL_VIEW = Object.freeze({ yaw: -0.62, pitch: 0.18, distance: 3.65 });
export const LIGHT_PRESETS = Object.freeze({
  day: { sun: 135, fill: 55, brightness: 110, azimuth: 32, elevation: 42, warmth: 0.25 },
  warm: { sun: 145, fill: 50, brightness: 110, azimuth: -48, elevation: 27, warmth: 0.65 },
  side: { sun: 165, fill: 62, brightness: 110, azimuth: -88, elevation: 32, warmth: 0.28 }
});
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const limitZoom = value => clamp(value, 1.65, 6.8);

// Module-scope temporaries so the per-frame update() allocates nothing.
const SUN_NEUTRAL = new Color3(1, 0.99, 0.96), SUN_WARM = new Color3(1.12, 0.86, 0.62);
const _sunDir = new Vector3();

export function framePlanet(camera, width, height) {
  const w = Math.max(1, width), h = Math.max(1, height);
  // Fit the shorter side, with room for the header and bottom controls.
  // Zoom remains a distance, so changing orientation keeps the same location.
  const usable = Math.max(Math.min(w, h) * 0.4, Math.min(w - 40, h - 132));
  const fraction = Math.min(1, usable / Math.min(w, h));
  camera.fovMode = w < h ? FreeCamera.FOVMODE_HORIZONTAL_FIXED : FreeCamera.FOVMODE_VERTICAL_FIXED;
  camera.fov = 2 * Math.atan(1 / (2.7 * fraction));
}

export function createPlanetScene(engine, { environment = true } = {}) {
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0, 0, 0, 0);
  const camera = new FreeCamera('Camera', new Vector3(0, 0, INITIAL_VIEW.distance), scene);
  camera.setTarget(Vector3.Zero());
  framePlanet(camera, engine.getRenderWidth(), engine.getRenderHeight());
  camera.minZ = 0.05;
  camera.maxZ = 30;
  camera.inputs.clear();
  const root = new TransformNode('Planet view', scene);
  const sun = new DirectionalLight('Sun', new Vector3(0.4, -0.6, -0.7), scene);
  sun.radius = 0.055;
  sun.shadowMinZ = 0.1;
  sun.shadowMaxZ = 7;
  sun.autoCalcShadowZBounds = true;
  sun.autoUpdateExtends = false;
  sun.orthoLeft = -1.35; sun.orthoRight = 1.35;
  sun.orthoTop = 1.35; sun.orthoBottom = -1.35;
  const fill = new HemisphericLight('Sky fill', Vector3.Up(), scene);
  fill.diffuse = new Color3(0.72, 0.84, 1);
  fill.groundColor = new Color3(0.25, 0.29, 0.25);
  fill.specular = Color3.Black();
  const shadows = new ShadowGenerator(1024, sun);
  shadows.useBlurExponentialShadowMap = true;
  shadows.useKernelBlur = true;
  shadows.blurKernel = 12;
  shadows.bias = 0.0002;
  shadows.normalBias = 0.001;
  shadows.setDarkness(0.12);
  const image = scene.imageProcessingConfiguration;
  image.toneMappingEnabled = true;
  image.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
  image.contrast = 1;

  let environmentReady = false;
  let env = null;
  if (environment) {
    env = new HDRCubeTexture('./assets/coastal-sky-v0.4.hdr', scene, 256, false, true, false, true,
      () => { environmentReady = true; },
      () => {
        environmentReady = true;
        scene.environmentTexture = null;
        console.warn('Environment lighting could not load; sky fill remains available.');
      });
    scene.environmentTexture = env;
  }

  const air = CreateSphere('Atmosphere', { diameter: 2.05, segments: 64, sideOrientation: Mesh.BACKSIDE }, scene);
  air.isPickable = false;
  const airMaterial = new ShaderMaterial('Atmosphere scattering', scene, {
    vertexSource: `precision highp float;
      attribute vec3 position; attribute vec3 normal;
      uniform mat4 worldViewProjection; uniform mat4 world;
      varying vec3 vPosition; varying vec3 vNormal;
      void main(){ vPosition=(world*vec4(position,1.0)).xyz;
        vNormal=normalize(mat3(world)*normal); gl_Position=worldViewProjection*vec4(position,1.0); }`,
    fragmentSource: `precision highp float;
      varying vec3 vPosition; varying vec3 vNormal;
      uniform vec3 eye; uniform vec3 sunDirection; uniform float strength;
      void main(){vec3 n=normalize(vNormal); vec3 view=normalize(eye-vPosition);
        float rim=pow(1.0-abs(dot(n,view)),2.5);
        float lit=smoothstep(-0.4,0.8,dot(normalize(vPosition),sunDirection));
        gl_FragColor=vec4(mix(vec3(0.32,0.55,0.70),vec3(0.59,0.78,0.91),lit),rim*strength);}`
  }, { attributes: ['position', 'normal'], uniforms: ['worldViewProjection', 'world', 'eye', 'sunDirection', 'strength'], needAlphaBlending: true });
  airMaterial.backFaceCulling = true;
  airMaterial.disableDepthWrite = true;
  air.material = airMaterial;

  function update(view, light) {
    root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Right(), view.pitch)
      .multiply(Quaternion.RotationAxis(Vector3.Up(), view.yaw));
    camera.position.z = view.distance;
    const az = light.azimuth * Math.PI / 180, el = light.elevation * Math.PI / 180;
    _sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    sun.position.set(_sunDir.x * 3.5, _sunDir.y * 3.5, _sunDir.z * 3.5);
    sun.direction.set(-_sunDir.x, -_sunDir.y, -_sunDir.z);
    Color3.LerpToRef(SUN_NEUTRAL, SUN_WARM, light.warmth, sun.diffuse);
    sun.specular.copyFrom(sun.diffuse);
    sun.intensity = light.sun * 0.031;
    fill.intensity = light.fill * 0.006;
    scene.environmentIntensity = light.fill * 0.012;
    image.exposure = light.brightness * 0.01;
    airMaterial.setVector3('eye', camera.position);
    airMaterial.setVector3('sunDirection', _sunDir);
    airMaterial.setFloat('strength', 0.10 + light.sun * 0.0003);
  }
  update(INITIAL_VIEW, LIGHT_PRESETS.day);
  return { scene, camera, root, sun, fill, shadows, air, update,
    get environmentReady() { return !environment || environmentReady; },
    dispose() { env?.dispose(); scene.dispose(); }
  };
}
