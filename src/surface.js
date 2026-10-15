import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';

// Small colour variations live on the planet, independent of light and view.
// Keep the accepted geometry and beach colours; fade detail below pixel size.
export class LandSurface extends MaterialPluginBase {
  constructor(material) {
    super(material, 'LandSurface', 180, {}, true, false);
    this.doNotSerialize = true;
    this._enable(true);
  }
  isCompatible(language) { return language === 0; }
  getClassName() { return 'LandSurface'; }
  getCustomCode(stage) {
    if (stage === 'vertex') return {
      CUSTOM_VERTEX_DEFINITIONS: 'varying vec3 vLandPosition;',
      CUSTOM_VERTEX_MAIN_END: 'vLandPosition = position;'
    };
    if (stage !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        varying vec3 vLandPosition;
        float landHash(vec3 p) {
          p=fract(p*0.1031);
          p+=dot(p,p.yzx+33.33);
          return fract((p.x+p.y)*p.z);
        }
        float landGrain(vec3 p) {
          vec3 i=floor(p), f=fract(p);
          f=f*f*(3.0-2.0*f);
          float value=mix(mix(mix(landHash(i),landHash(i+vec3(1,0,0)),f.x),
            mix(landHash(i+vec3(0,1,0)),landHash(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(landHash(i+vec3(0,0,1)),landHash(i+vec3(1,0,1)),f.x),
            mix(landHash(i+vec3(0,1,1)),landHash(i+vec3(1,1,1)),f.x),f.y),f.z);
          float footprint=max(length(dFdx(p)),length(dFdy(p)));
          return mix(value,0.5,smoothstep(0.4,1.2,footprint));
        }`,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
        float landDetail=mix(landGrain(vLandPosition*42.0),landGrain(vLandPosition*126.0+7.0),0.3);
        float grassMask=smoothstep(1.02,1.25,surfaceAlbedo.g/max(surfaceAlbedo.r,0.001));
        surfaceAlbedo*=1.0+(landDetail-0.5)*0.16*grassMask;
      `
    };
  }
}
