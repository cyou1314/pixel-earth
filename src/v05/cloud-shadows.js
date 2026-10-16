import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import { CLOUD_FIELD, CLOUD_RADIUS } from './cloud-field.js';

// Project toward the sun onto the floating cloud shell, then evaluate its field
// in cloud-local space. A rotating globe or changing sun cannot detach shadows.
export class CloudShadows extends MaterialPluginBase {
  constructor(material, state) {
    super(material, 'CloudShadows', 190, { CLOUD_SHADOWS: true }, true, false);
    this.state = state;
    this.registerForExtraEvents = true;
    this.doNotSerialize = true;
    this._enable(true);
  }
  isCompatible(language) { return language === 0; }
  getClassName() { return 'CloudShadows'; }
  getUniforms() {
    return {
      ubo: [{ name:'cloudInverse', size:16, type:'mat4' }, { name:'cloudSun', size:3, type:'vec3' }, { name:'cloudEnabled', size:1, type:'float' }, { name:'cloudStrength', size:1, type:'float' }],
      fragment:'uniform mat4 cloudInverse; uniform vec3 cloudSun; uniform float cloudEnabled; uniform float cloudStrength;'
    };
  }
  hardBindForSubMesh(buffer) {
    buffer.updateMatrix('cloudInverse', this.state.inverse);
    buffer.updateVector3('cloudSun', this.state.sun);
    buffer.updateFloat('cloudEnabled', this.state.enabled);
    buffer.updateFloat('cloudStrength', this.state.strength);
  }
  getCustomCode(stage) {
    if (stage !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: CLOUD_FIELD,
      CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
        #ifndef UNLIT
        float cloudFacing=dot(normalize(vPositionW),cloudSun);
        if(cloudEnabled>0.5 && cloudFacing>0.0){
          float along=dot(vPositionW,cloudSun);
          float travel=-along+sqrt(max(0.0,along*along+${CLOUD_RADIUS * CLOUD_RADIUS}-dot(vPositionW,vPositionW)));
          vec3 hit=(cloudInverse*vec4(vPositionW+cloudSun*travel,1.0)).xyz;
          float cover=smoothstep(0.56,0.80,cloudDensity(normalize(hit)));
          float transmission=1.0-cover*0.52*cloudStrength*smoothstep(0.0,0.20,cloudFacing);
          finalDiffuse*=transmission;
          #ifdef SPECULARTERM
          finalSpecularScaled*=transmission;
          #endif
        }
        #endif`
    };
  }
}
