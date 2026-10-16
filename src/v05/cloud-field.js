// Shared by visible clouds and their shadows: identical coordinates and drift.
export const CLOUD_RADIUS = 1.17;
export const CLOUD_FIELD = `
  float cloudHash(vec3 p){p=fract(p*0.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
  float cloudNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(mix(cloudHash(i),cloudHash(i+vec3(1,0,0)),f.x),mix(cloudHash(i+vec3(0,1,0)),cloudHash(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(cloudHash(i+vec3(0,0,1)),cloudHash(i+vec3(1,0,1)),f.x),mix(cloudHash(i+vec3(0,1,1)),cloudHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
  float cloudDensity(vec3 n){
    vec3 p=n*vec3(6.2,9.0,6.2);
    float broad=cloudNoise(p+vec3(4,8,2));
    if(broad*0.74+0.26<0.56)return 0.0;
    return broad*0.74+cloudNoise(p*2.7+9.0)*0.26;
  }`;
