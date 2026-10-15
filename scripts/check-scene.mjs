import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { GetCubeMapTextureData } from '@babylonjs/core/Misc/HighDynamicRange/hdr.js';
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture.js';
import { InternalTexture, InternalTextureSource } from '@babylonjs/core/Materials/Textures/internalTexture.js';
import { SphericalPolynomial } from '@babylonjs/core/Maths/sphericalPolynomial.js';
import { WebGLShaderProcessor } from '@babylonjs/core/Engines/WebGL/webGLShaderProcessors.js';
import { Vector3 } from '@babylonjs/core/Maths/math.js';
import { createPlanetScene, loadPlanet, framePlanet, INITIAL_VIEW, LIGHT_PRESETS, limitZoom } from '../src/scene.js';

// Real glTF parsing and scene construction; NullEngine does not render pixels.
const engine = new NullEngine({ renderWidth: 1280, renderHeight: 800, textureSize: 128, deterministicLockstep: true, lockstepMaxSteps: 4 });
engine._shaderProcessor = new WebGLShaderProcessor();
const model = createPlanetScene(engine, { environment: false });
const bytes = new Uint8Array(await readFile('dist/assets/planet-v0.4.glb'));
assert.equal(new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true), 0x46546c67);
const skyBytes = await readFile('dist/assets/coastal-sky-v0.4.hdr');
const skyBuffer = skyBytes.buffer.slice(skyBytes.byteOffset, skyBytes.byteOffset + skyBytes.byteLength);
const sky = GetCubeMapTextureData(skyBuffer, 16);
for (const face of ['right', 'left', 'up', 'down', 'front', 'back']) {
  assert(sky[face].every(x => Number.isFinite(x) && x >= 0));
}
await loadPlanet(model, bytes);
// NullEngine has no GPU texture allocation. A ready descriptor exercises the
// reflection-enabled shader branch without claiming to upload or render it.
const reflection = new CubeTexture('', model.scene);
reflection._texture = new InternalTexture(engine, InternalTextureSource.Cube, true);
Object.assign(reflection._texture, { isReady: true, isCube: true, width: 16, height: 16 });
reflection.sphericalPolynomial = new SphericalPolynomial();
model.scene.environmentTexture = reflection;
const meshes = {};
for (const name of ['Land', 'Ocean']) {
  const mesh = model.scene.getMeshByName(name);
  assert(mesh, name + ' must be an editable mesh');
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
  const colors = mesh.getVerticesData(VertexBuffer.ColorKind);
  assert(positions.every(Number.isFinite));
  assert(normals.every(Number.isFinite));
  assert(colors && colors.length === mesh.getTotalVertices() * 4);
  let minRadius = Infinity, maxRadius = 0, outward = 0;
  const sharedNormals = new Map();
  let worstSeamDot = 1;
  for (let i = 0; i < positions.length; i += 3) {
    const r = Math.hypot(...positions.slice(i, i + 3));
    minRadius = Math.min(minRadius, r); maxRadius = Math.max(maxRadius, r);
    const length = Math.hypot(...normals.slice(i, i + 3));
    assert(length > 0.98 && length < 1.02, name + ': normals must be normalized');
    const dot = positions[i] * normals[i] + positions[i + 1] * normals[i + 1] + positions[i + 2] * normals[i + 2];
    if (dot > 0) outward++;
    const key = Array.from(positions.slice(i, i + 3), x => x.toFixed(5)).join(',');
    const previous = sharedNormals.get(key);
    if (previous) worstSeamDot = Math.min(worstSeamDot,
      previous[0] * normals[i] + previous[1] * normals[i+1] + previous[2] * normals[i+2]);
    else sharedNormals.set(key, normals.slice(i, i + 3));
  }
  assert(outward / mesh.getTotalVertices() > 0.999, name + ': outward faces');
  assert(worstSeamDot > .9999, name + ': continuous shading at UV seams and poles');
  if (name === 'Land') assert(minRadius < 1 && maxRadius > 1.01 && maxRadius < 1.025);
  if (name === 'Ocean') assert(Math.abs(minRadius - 1) < 0.00001 && Math.abs(maxRadius - 1) < 0.00001);
  meshes[name] = { vertices: mesh.getTotalVertices(), triangles: mesh.getTotalIndices() / 3, minRadius, maxRadius,
    material: mesh.material.getClassName(), roughness: mesh.material.roughness,
    maxSeamNormalAngleDegrees: Math.acos(Math.min(1, worstSeamDot)) * 180 / Math.PI,
    receivesShadows: mesh.receiveShadows };
}
assert(model.shadows.getShadowMap().renderList.includes(model.scene.getMeshByName('Land')));
const ocean = model.scene.getMeshByName('Ocean');
assert.equal(ocean.material.bumpTexture, null, 'Old latitude-stretched normal map removed');
assert.equal(ocean.material.pluginManager.getPlugin('OceanSurface'), model.oceanSurface);
assert.equal(ocean.material.roughness, 0.26);
assert(model.oceanSurface.registerForExtraEvents, 'Wave uniform must update when material is cached');
const land = model.scene.getMeshByName('Land');
assert.equal(land.material.pluginManager.getPlugin('LandSurface'), model.landSurface);
assert.equal(land.material.roughness, 0.94);
const pos = land.getVerticesData(VertexBuffer.PositionKind), indices = land.getIndices();
let totalArea = 0, landArea = 0;
for (let i = 0; i < indices.length; i += 3) {
  const triangle = Array.from(indices.slice(i, i + 3), index => Array.from(pos.slice(index * 3, index * 3 + 3)));
  const radii = triangle.map(v => Math.hypot(...v));
  const [a, b, c] = triangle.map((v, j) => v.map(x => x / radii[j]));
  const dot = (v, w) => v.reduce((s, x, k) => s + x * w[k], 0);
  const cross = [b[1]*c[2]-b[2]*c[1], b[2]*c[0]-b[0]*c[2], b[0]*c[1]-b[1]*c[0]];
  const area = 2 * Math.atan2(Math.abs(dot(a, cross)), 1 + dot(a, b) + dot(b, c) + dot(c, a));
  totalArea += area;
  if (radii.reduce((s, r) => s + r, 0) / 3 > 1) landArea += area;
}
const coverage = landArea / totalArea;
assert(Math.abs(totalArea - 4 * Math.PI) < 0.001, 'Mesh must cover the whole sphere');
assert(coverage > .42 && coverage < .57, 'Land and ocean must both have broad regions');
const directions = [];
for (const preset of Object.values(LIGHT_PRESETS)) {
  model.update(INITIAL_VIEW, preset);
  assert(model.sun.intensity > 0 && model.fill.intensity > 0);
  assert(Math.abs(model.sun.direction.length() - 1) < 0.00001);
  directions.push(model.sun.direction.asArray());
  model.scene.render();
}
assert.notDeepEqual(directions[0], directions[1]);
model.update({ yaw: 1.2, pitch: -0.4, distance: limitZoom(0.2) }, LIGHT_PRESETS.side);
assert.equal(model.camera.position.z, 1.65);
assert.notEqual(model.root.rotationQuaternion.y, 0);
model.update(INITIAL_VIEW, LIGHT_PRESETS.day);
assert.equal(model.camera.position.z, INITIAL_VIEW.distance);
assert.equal(model.scene.imageProcessingConfiguration.exposure, 1.1);
assert.equal(limitZoom(999), 6.8);

// Project a whole atmosphere-sized sphere through Babylon's actual camera.
// The old vertical-only camera clipped the sphere on a narrow portrait screen.
const framing = [];
for (const [width, height] of [[1280,800], [1920,1080], [800,800], [393,852], [320,568], [844,390]]) {
  const viewportEngine = new NullEngine({ renderWidth: width, renderHeight: height });
  const viewport = createPlanetScene(viewportEngine, { environment: false });
  const bounds = () => {
    const transform = viewport.camera.getViewMatrix().multiply(viewport.camera.getProjectionMatrix(true));
    let maxX = 0, maxY = 0;
    for (let j = 0; j <= 64; j++) {
      const theta = Math.PI * j / 64;
      for (let i = 0; i < 128; i++) {
        const phi = 2 * Math.PI * i / 128;
        const point = new Vector3(1.025 * Math.sin(theta) * Math.cos(phi), 1.025 * Math.cos(theta), 1.025 * Math.sin(theta) * Math.sin(phi));
        const clip = Vector3.TransformCoordinates(point, transform);
        maxX = Math.max(maxX, Math.abs(clip.x)); maxY = Math.max(maxY, Math.abs(clip.y));
      }
    }
    return { maxX, maxY };
  };
  const current = bounds();
  assert(current.maxX < .91 && current.maxY < .91, 'Initial globe must fit: ' + width + 'x' + height);
  assert(Math.abs(current.maxX * width - current.maxY * height) < 1, 'Projection must stay round');
  const savedView = viewport.root.rotationQuaternion.clone();
  framePlanet(viewport.camera, width, height);
  assert.equal(viewport.camera.position.z, INITIAL_VIEW.distance, 'Framing must not change zoom');
  assert(viewport.root.rotationQuaternion.equals(savedView), 'Framing must not change orientation');
  let oldPortraitClipped = null;
  if (width === 393) {
    viewport.camera.fovMode = 0;
    viewport.camera.fov = 2 * Math.atan(1 / 2.7);
    oldPortraitClipped = bounds().maxX > 1;
    assert(oldPortraitClipped, 'Reproduce the old portrait clipping regression');
  }
  framing.push({ width, height, horizontalFraction: Number(current.maxX.toFixed(4)), verticalFraction: Number(current.maxY.toFixed(4)), ...(oldPortraitClipped ? { oldPortraitClipped } : {}) });
  viewport.dispose(); viewportEngine.dispose();
}

await model.scene.whenReadyAsync();
model.scene.render();
await mkdir('.qa/shaders', { recursive: true });
const uniformSamples = [];
const buffer = { updateFloat(name, value) { uniformSamples.push([name, value]); }, updateMatrix() {} };
for (const time of [0, 2]) {
  model.oceanSurface.time = time;
  model.oceanSurface.hardBindForSubMesh(buffer, model.scene, engine, ocean.subMeshes[0]);
}
assert.deepEqual(uniformSamples, [['oceanTime', 0], ['oceanTime', 2]]);
for (const name of ['Land', 'Ocean']) {
  const material = model.scene.getMeshByName(name).material;
  const subMesh = model.scene.getMeshByName(name).subMeshes[0];
  const effect = subMesh.effect;
  assert(effect && effect.isReady(), name + ': PBR effect prepared');
  const fragment = effect.fragmentSourceCode, vertex = effect.vertexSourceCode;
  if (name === 'Ocean') {
    assert(fragment.includes('oceanSlope') && vertex.includes('vOceanPosition = position'));
    assert(fragment.includes('reflectionSampler'), 'Exercise the environment reflection shader');
    assert(fragment.includes('oceanWave') && fragment.includes('dFdx(angle)'), 'Filter undersampled ocean waves');
  } else {
    assert(fragment.includes('landGrain') && vertex.includes('vLandPosition = position'));
  }
  await writeFile('.qa/shaders/' + name + '.vert', effect.defines + '\n' + vertex);
  await writeFile('.qa/shaders/' + name + '.frag', effect.defines + '\n' + fragment);
}

const html = await readFile('dist/index.html', 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
assert.equal(ids.length, new Set(ids).size);
for (const file of ['dist/app.js', 'dist/foundation/index.html', 'dist/assets/coastal-sky-v0.4.hdr',
  'authoring/pixel-earth-v0.4.blend', 'authoring/pixel-earth-v0.3.blend', 'dist/assets/planet.glb']) {
  assert((await stat(file)).size > 0, 'Required artifact: ' + file);
}
const report = { version: '0.4.1', engine: 'Babylon.js 9.30.0', meshes, framing,
  landCoverage: { fraction: coverage, method: 'solid-angle weighted exported mesh triangles; coastal triangles classified by mean radius' },
  checks: ['actual glTF import', 'finite geometry and outward normals', 'continuous normals at seams and poles',
  'real terrain relief and round ocean', 'separate PBR materials and seamless 3D ocean wave plugin', 'animated uniform cached-material binding', 'shadow caster and receivers',
  'HDR decoding and six cube faces', 'lighting presets and sun direction', 'camera limits and reset',
  'actual projection at six landscape/portrait sizes and old clipping reproduction', 'view preserved by framing',
  'land detail and filtered ocean shader branches', 'DOM IDs and local resources'],
  verification: 'Bundled Babylon.js code checked with Node NullEngine. No browser WebGL, GUI, screenshot, or device performance test.' };
await mkdir('docs/previews/polish-v0.4.1', { recursive: true });
await writeFile('docs/previews/polish-v0.4.1/validation.json', JSON.stringify(report, null, 2) + '\n');
model.dispose(); engine.dispose();
console.log(JSON.stringify(report, null, 2));
