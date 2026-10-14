const canvas = document.querySelector('#world');
const errorBox = document.querySelector('#error');
const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });

const vertexSource = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

const fragmentSource = `
#ifdef GL_ES
precision highp float;
#endif
uniform vec2 u_resolution;
uniform vec2 u_rotation;
uniform float u_distance;

float hash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x),
        mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
        mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.55;
  for (int i = 0; i < 4; i++) {
    sum += amp * (noise(p) - 0.5);
    p = p * 2.03 + vec3(9.7, 13.1, 5.2);
    amp *= 0.5;
  }
  return sum;
}
vec3 localDirection(vec3 n) {
  float cp=cos(u_rotation.y), sp=sin(u_rotation.y);
  n = vec3(n.x, cp*n.y+sp*n.z, -sp*n.y+cp*n.z);
  float cy=cos(u_rotation.x), sy=sin(u_rotation.x);
  return vec3(cy*n.x-sy*n.z,n.y,sy*n.x+cy*n.z);
}
float mass(vec3 n, vec3 center, float width) {
  vec3 d = n - normalize(center);
  return exp(-dot(d,d)*width);
}
float terrain(vec3 n) {
  float shape =
    mass(n,vec3(0.62,0.20,0.75),5.1) +
    0.8*mass(n,vec3(0.18,0.69,0.49),6.5) +
    0.95*mass(n,vec3(-0.72,0.19,0.34),6.2) +
    0.84*mass(n,vec3(0.3,-0.46,-0.74),4.4) +
    0.75*mass(n,vec3(-0.6,0.62,-0.75),5.9);
  return shape - 0.54 + fbm(n*5.0 + vec3(3.0,7.0,1.0))*0.42;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 p = (2.0*gl_FragCoord.xy-u_resolution)/u_resolution.y;
  vec3 sky = mix(vec3(0.75,0.84,0.89),vec3(0.40,0.59,0.75),uv.y);
  float glow = exp(-3.2*dot(p-vec2(-1.4,1.1),p-vec2(-1.4,1.1)));
  sky += vec3(0.085,0.055,0.015)*glow;
  vec3 ro = vec3(0.0,0.0,u_distance);
  vec3 rd = normalize(vec3(p,-2.7));
  float b = dot(ro,rd);
  float c = dot(ro,ro)-1.0;
  float disc = b*b-c;
  vec3 color = sky;
  if (disc>0.0) {
    float t = -b-sqrt(disc);
    vec3 pos=ro+rd*t;
    vec3 n=normalize(pos);
    vec3 local=localDirection(n);
    float h=terrain(local);
    float land=smoothstep(-0.005,0.005,h);
    float coast=1.0-smoothstep(-0.10,0.0,h);
    vec3 ocean=mix(vec3(0.17,0.39,0.53),vec3(0.20,0.45,0.53),1.0-coast);
    vec3 soil=mix(vec3(0.43,0.59,0.43),vec3(0.55,0.66,0.48),smoothstep(0.0,0.58,h));
    vec3 albedo=mix(ocean,soil,land);
    vec3 light=normalize(vec3(-0.72,0.70,0.62));
    float diffuse=max(dot(n,light),0.0);
    float fill=0.26+0.055*max(dot(n,normalize(vec3(0.3,-0.6,0.8))),0.0);
    vec3 linear=pow(albedo,vec3(2.2))*(vec3(fill)+vec3(1.04,0.98,0.88)*diffuse);
    vec3 view=normalize(ro-pos);
    vec3 halfDir=normalize(light+view);
    float spec=pow(max(dot(n,halfDir),0.0),105.0);
    linear += vec3(0.11,0.12,0.12)*spec*(1.0-land)*smoothstep(0.0,0.25,diffuse);
    color=pow(max(linear,vec3(0.0)),vec3(1.0/2.2));
    float rim=pow(1.0-max(dot(n,view),0.0),3.2);
    color=mix(color,vec3(0.55,0.75,0.87),rim*0.30);
    float edge=smoothstep(0.0,0.007,disc);
    color=mix(sky,color,edge);
  } else {
    float outerDisc=b*b-(dot(ro,ro)-1.018*1.018);
    if(outerDisc>0.0) {
      float halo=smoothstep(0.0,0.055,outerDisc)*0.12;
      color=mix(sky,vec3(0.76,0.88,0.94),halo);
    }
  }
  gl_FragColor=vec4(clamp(color,0.0,1.0),1.0);
}
`;

function showError(message) {
  errorBox.hidden = false;
  errorBox.textContent = message;
}

if (!gl) {
  showError('当前浏览器未能开启图形显示，请尝试开启硬件加速后刷新。');
} else {
  try { start(); }
  catch (error) {
    console.error('Planet renderer:', error);
    showError('画面暂时无法显示，请刷新后重试。');
  }
}

function start() {
  function compile(type, source) {
    const shader=gl.createShader(type);
    gl.shaderSource(shader,source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) {
      const message=gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }
  const vertex=compile(gl.VERTEX_SHADER,vertexSource);
  const fragment=compile(gl.FRAGMENT_SHADER,fragmentSource);
  const program=gl.createProgram();
  gl.attachShader(program,vertex);
  gl.attachShader(program,fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex); gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const buffer=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const position=gl.getAttribLocation(program,'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  const resolution=gl.getUniformLocation(program,'u_resolution');
  const rotation=gl.getUniformLocation(program,'u_rotation');
  const camera=gl.getUniformLocation(program,'u_distance');
  const initial={yaw:-0.62,pitch:0.18,distance:3.65};
  const state={...initial}, target={...initial};
  const pointers=new Map();
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  let scheduled=false, lost=false, pinchDistance=0, pinchCamera=initial.distance;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const limitZoom=v=>clamp(v,1.65,6.8);

  function schedule() {
    if (!scheduled&&!lost) { scheduled=true; requestAnimationFrame(draw); }
  }
  function draw() {
    scheduled=false;
    const factor=reducedMotion.matches?1:0.2;
    let remaining=0;
    for(const key of ['yaw','pitch','distance']) {
      const delta=target[key]-state[key];
      state[key]+=delta*factor;
      remaining+=Math.abs(delta);
    }
    gl.uniform2f(resolution,canvas.width,canvas.height);
    gl.uniform2f(rotation,state.yaw,state.pitch);
    gl.uniform1f(camera,state.distance);
    gl.drawArrays(gl.TRIANGLES,0,6);
    if (remaining>0.0001) schedule();
  }
  function resize() {
    const w=Math.max(1,canvas.clientWidth), h=Math.max(1,canvas.clientHeight);
    const scale=Math.min(devicePixelRatio||1,1.75,Math.sqrt(2400000/(w*h)));
    canvas.width=Math.max(1,Math.round(w*scale));
    canvas.height=Math.max(1,Math.round(h*scale));
    gl.viewport(0,0,canvas.width,canvas.height);
    schedule();
  }
  function zoom(factor) { target.distance=limitZoom(target.distance*factor); schedule(); }
  function reset() {
    if(lost) { location.reload(); return; }
    Object.assign(target,initial);
    schedule();
  }
  canvas.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse'&&event.button!==0) return;
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointers.size===2) {
      const [a,b]=[...pointers.values()];
      pinchDistance=Math.hypot(a.x-b.x,a.y-b.y);
      pinchCamera=target.distance;
    }
  });
  canvas.addEventListener('pointermove',event=>{
    const previous=pointers.get(event.pointerId);
    if(!previous) return;
    const dx=event.clientX-previous.x, dy=event.clientY-previous.y;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointers.size===1) {
      target.yaw+=dx*0.0045;
      target.pitch=clamp(target.pitch+dy*0.0045,-1.45,1.45);
    } else if(pointers.size>=2) {
      const [a,b]=[...pointers.values()];
      const distance=Math.hypot(a.x-b.x,a.y-b.y);
      if(pinchDistance>4&&distance>4) target.distance=limitZoom(pinchCamera*pinchDistance/distance);
    }
    schedule();
  });
  const release=event=>{
    pointers.delete(event.pointerId);
    if(canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  canvas.addEventListener('pointerup',release);
  canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('lostpointercapture',event=>pointers.delete(event.pointerId));
  canvas.addEventListener('wheel',event=>{
    event.preventDefault();
    const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?canvas.clientHeight:1);
    zoom(Math.exp(clamp(delta,-300,300)*0.001));
  },{passive:false});
  canvas.addEventListener('keydown',event=>{
    const actions={
      ArrowLeft:()=>target.yaw-=0.1, ArrowRight:()=>target.yaw+=0.1,
      ArrowUp:()=>target.pitch=clamp(target.pitch-0.1,-1.45,1.45),
      ArrowDown:()=>target.pitch=clamp(target.pitch+0.1,-1.45,1.45),
      '+':()=>zoom(0.90),'=':()=>zoom(0.90),'-':()=>zoom(1.10),Home:reset
    };
    if(actions[event.key]) { event.preventDefault(); actions[event.key](); schedule(); }
  });
  document.querySelector('#in').addEventListener('click',()=>zoom(0.86));
  document.querySelector('#out').addEventListener('click',()=>zoom(1.16));
  document.querySelector('#reset').addEventListener('click',reset);
  window.addEventListener('blur',()=>pointers.clear());
  window.addEventListener('resize',resize);
  canvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault(); lost=true; scheduled=false;
    showError('图形显示已中断，点击右上角复位按钮可重新打开。');
  });
  canvas.addEventListener('webglcontextrestored',()=>location.reload());
  if(matchMedia('(pointer: coarse)').matches) document.querySelector('#hint').textContent='拖动旋转 · 双指缩放';
  resize();
}

