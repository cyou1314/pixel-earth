import '@babylonjs/loaders/glTF/index.js';
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader.js';
import { OceanSurface } from './ocean.js';
import { LandSurface } from './surface.js';

// Legacy v0.4 path: loads the prebuilt planet mesh. The v0.5 standalone page
// builds its cube-sphere procedurally and never imports this module, so the
// ~1MB glTF loader stays out of the v0.5 engine bundle.
export async function loadPlanet(model, source = './assets/planet-v0.4.glb') {
  const result = await ImportMeshAsync(source, model.scene, { pluginExtension: '.glb' });
  for (const mesh of result.meshes) {
    if (!mesh.parent) mesh.parent = model.root;
    if (mesh.getTotalVertices() === 0) continue;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    if (mesh.name === 'Land') model.shadows.addShadowCaster(mesh, false);
    if (mesh.material) {
      mesh.material.environmentIntensity = mesh.name === 'Ocean' ? 0.95 : 0.6;
      mesh.material.enableSpecularAntiAliasing = true;
      if (mesh.name === 'Ocean') {
        mesh.material.roughness = 0.26;
        mesh.material.metallicF0Factor = 0.56;
        model.oceanSurface = new OceanSurface(mesh.material);
      } else if (mesh.name === 'Land') {
        mesh.material.roughness = 0.94;
        model.landSurface = new LandSurface(mesh.material);
      }
    }
  }
  return result;
}
