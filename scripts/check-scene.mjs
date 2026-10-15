import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { GetCubeMapTextureData } from '@babylonjs/core/Misc/HighDynamicRange/hdr.js';
import { createPlanetScene, loadPlanet, INITIAL_VIEW, LIGHT_PRESETS, limitZoom } from '../src/scene.js';

// Real glTF parsing and scene construction; NullEngine does not render pixels.
const engine = new NullEngine({ renderWidth: 1280, renderHeight: 800, textureSize: 128, deterministicLockstep: true, lockstepMaxSteps: 4 });
const model = createPlanetScene(engine, { environment: false });
const bytes = new Uint8Array(await readFile('dist/assets/planet.glb'));
assert.equal(new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true), 0x46546c67);
const skyBytes = await readFile('dist/assets/afternoon-sky.hdr');
const skyBuffer = skyBytes.buffer.slice(skyBytes.byteOffset, skyBytes.byteOffset + skyBytes.byteLength);
const sky = GetCubeMapTextureData(skyBuffer, 16);
for (const face of ['right', 'left', 'up', 'down', 'front', 'back']) {
  assert(sky[face].every(x => Number.isFinite(x) && x >= 0));
}
await loadPlanet(model, bytes);
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
  for (let i = 0; i < positions.length; i += 3) {
    const r = Math.hypot(...positions.slice(i, i + 3));
    minRadius = Math.min(minRadius, r); maxRadius = Math.max(maxRadius, r);
    const length = Math.hypot(...normals.slice(i, i + 3));
    assert(length > 0.98 && length < 1.02, name + ': normals must be normalized');
    const dot = positions[i] * normals[i] + positions[i + 1] * normals[i + 1] + positions[i + 2] * normals[i + 2];
    if (dot > 0) outward++;
  }
  assert(outward / mesh.getTotalVertices() > 0.999, name + ': outward faces');
  if (name === 'Land') assert(minRadius < 1 && maxRadius > 1.02 && maxRadius < 1.08);
  if (name === 'Ocean') assert(Math.abs(minRadius - 1) < 0.00001 && Math.abs(maxRadius - 1) < 0.00001);
  meshes[name] = { vertices: mesh.getTotalVertices(), triangles: mesh.getTotalIndices() / 3, minRadius, maxRadius,
    material: mesh.material.getClassName(), roughness: mesh.material.roughness, receivesShadows: mesh.receiveShadows };
}
assert(model.shadows.getShadowMap().renderList.includes(model.scene.getMeshByName('Land')));
assert(Math.abs(model.scene.getMeshByName('Ocean').material.bumpTexture.level - 0.16) < 0.00001);
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

const html = await readFile('dist/index.html', 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
assert.equal(ids.length, new Set(ids).size);
for (const file of ['dist/app.js', 'dist/foundation/index.html', 'dist/assets/afternoon-sky.hdr', 'authoring/pixel-earth-v0.3.blend']) {
  assert((await stat(file)).size > 0, 'Required artifact: ' + file);
}
const report = { version: '0.3.0', engine: 'Babylon.js 9.30.0', meshes, checks: ['actual glTF import', 'finite geometry and outward normals',
  'real terrain relief and round ocean', 'separate PBR materials and water normals', 'shadow caster and receivers',
  'HDR decoding and six cube faces', 'lighting presets and sun direction', 'camera limits and reset', 'DOM IDs and local resources'],
  verification: 'Bundled Babylon.js code checked with Node NullEngine. No browser WebGL, GUI, screenshot, or device performance test.' };
await mkdir('docs/previews/engine-v0.3', { recursive: true });
await writeFile('docs/previews/engine-v0.3/validation.json', JSON.stringify(report, null, 2) + '\n');
model.dispose(); engine.dispose();
console.log(JSON.stringify(report, null, 2));
