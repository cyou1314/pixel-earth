import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';

export class PixelSurface extends MaterialPluginBase {
  constructor(material){super(material,'PixelSurface',180,{},true,false);this.doNotSerialize=true;this._enable(true);}
  isCompatible(language){return language===0;}
  getClassName(){return 'PixelSurface';}
  getCustomCode(stage){
    if(stage==='vertex')return{CUSTOM_VERTEX_DEFINITIONS:'varying vec3 vPixelPosition;',CUSTOM_VERTEX_MAIN_END:'vPixelPosition = position;'};
    if(stage!=='fragment')return null;
    return{
      CUSTOM_FRAGMENT_DEFINITIONS:`varying vec3 vPixelPosition;
        float pixelHash(vec3 p){p=fract(p*0.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}`,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS:`
        // Quantize on the cube-face projection instead of raw 3D voxels so the
        // pixel grid keeps a uniform texel size everywhere on the sphere
        // (the naive 3D floor() stretches texels where the voxel grid meets
        // the surface at a shallow angle).
        vec3 nPos=normalize(vPixelPosition);
        vec3 aPos=abs(nPos);
        float maxAxis=max(aPos.x,max(aPos.y,aPos.z));
        vec3 pixelP=(nPos/maxAxis)*128.0;
        float footprint=max(length(dFdx(pixelP)),length(dFdy(pixelP)));
        float detail=(pixelHash(floor(pixelP))-0.5)*(1.0-smoothstep(0.8,2.0,footprint));
        vec3 palette=floor(surfaceAlbedo*60.0+0.5)/60.0;
        surfaceAlbedo=mix(surfaceAlbedo,palette,0.4)*(1.0+detail*0.16);`
    };
  }
}
