import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';

// Keep Babylon's PBR lighting, Fresnel and shadows. Only perturb the normal.
// Object-space 3D waves have neither a UV seam nor latitude/pole stretching.
export class OceanSurface extends MaterialPluginBase {
  constructor(material) {
    // Keep shader cache keys distinct when another plugin (cloud shadows) is
    // also registered on both land and ocean materials.
    super(material, 'OceanSurface', 180, { OCEAN_SURFACE: true }, true, false);
    this.time = 0;
    this.registerForExtraEvents = true;
    this.doNotSerialize = true;
    this._enable(true);
  }
  isCompatible(language) { return language === 0; }
  getClassName() { return 'OceanSurface'; }
  getUniforms() {
    return {
      ubo: [{ name: 'oceanTime', size: 1, type: 'float' }, { name: 'oceanWorld', size: 16, type: 'mat4' }],
      fragment: 'uniform float oceanTime; uniform mat4 oceanWorld;'
    };
  }
  hardBindForSubMesh(buffer, _scene, _engine, subMesh) {
    buffer.updateFloat('oceanTime', this.time);
    buffer.updateMatrix('oceanWorld', subMesh.getRenderingMesh().getWorldMatrix());
  }
  getCustomCode(stage) {
    if (stage === 'vertex') return {
      CUSTOM_VERTEX_DEFINITIONS: 'varying vec3 vOceanPosition;',
      CUSTOM_VERTEX_MAIN_END: 'vOceanPosition = position;'
    };
    if (stage !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        varying vec3 vOceanPosition;
        vec3 oceanWave(vec3 p,vec3 direction,float frequency,float phase,float amplitude) {
          float angle=dot(p,direction)*frequency+phase;
          float footprint=length(vec2(dFdx(angle),dFdy(angle)));
          float visible=1.0-smoothstep(0.7,2.6,footprint);
          return direction*cos(angle)*amplitude*visible;
        }
        vec3 oceanSlope(vec3 p, float t) {
          vec3 a=normalize(vec3(1.0,0.37,0.71));
          vec3 b=normalize(vec3(-0.42,0.83,1.0));
          vec3 c=normalize(vec3(0.28,1.0,-0.64));
          vec3 d=normalize(vec3(-0.91,0.18,0.43));
          return oceanWave(p,a,67.0,-t*0.65,0.022)
            + oceanWave(p,b,109.0,t*0.48+1.7,0.015)
            + oceanWave(p,c,173.0,-t*0.37+0.8,0.008)
            + oceanWave(p,d,251.0,t*0.29+2.4,0.004);
        }`,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
        vec3 oceanN=normalize(vOceanPosition);
        vec3 oceanG=oceanSlope(vOceanPosition,oceanTime);
        oceanG-=oceanN*dot(oceanG,oceanN);
        normalW=normalize(normalW-mat3(oceanWorld)*oceanG);
      `
    };
  }
}
