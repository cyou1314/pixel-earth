import { Engine } from '@babylonjs/core/Engines/engine.js';
import { createPlanetScene, loadPlanet, INITIAL_VIEW, LIGHT_PRESETS, clamp, limitZoom } from './scene.js';

const canvas = document.querySelector('#world');
const errorBox = document.querySelector('#error');
const hint = document.querySelector('#hint');
let lost = false;

function showError(message) {
  errorBox.replaceChildren(document.createTextNode(message));
  const link = document.createElement('a');
  link.href = './foundation/';
  link.textContent = '打开基础版';
  errorBox.append(document.createElement('br'), link);
  errorBox.hidden = false;
}

async function start() {
  const engine = new Engine(canvas, true, { alpha: true, premultipliedAlpha: false,
    stencil: false, preserveDrawingBuffer: false, powerPreference: 'default' }, false);
  const model = createPlanetScene(engine);
  const state = { ...INITIAL_VIEW }, target = { ...INITIAL_VIEW };
  const lightState = { ...LIGHT_PRESETS.day }, lightTarget = { ...LIGHT_PRESETS.day };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const pointers = new Map();
  let framesLeft = 2, loaded = false, pinchDistance = 0, pinchCamera = INITIAL_VIEW.distance;
  const schedule = () => { framesLeft = Math.max(framesLeft, 3); };

  function resize() {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
    const scale = Math.min(devicePixelRatio || 1, 1.75, Math.sqrt(2400000 / (w * h)));
    engine.setSize(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
    schedule();
  }
  function zoom(factor) { target.distance = limitZoom(target.distance * factor); schedule(); }
  function reset() {
    if (lost) { location.reload(); return; }
    Object.assign(target, INITIAL_VIEW);
    schedule();
  }
  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
      pinchCamera = target.distance;
    }
  });
  canvas.addEventListener('pointermove', event => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      target.yaw += dx * 0.0045;
      target.pitch = clamp(target.pitch + dy * 0.0045, -1.45, 1.45);
    } else {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance > 4 && distance > 4) target.distance = limitZoom(pinchCamera * pinchDistance / distance);
    }
    schedule();
  });
  const release = event => {
    pointers.delete(event.pointerId);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    // A third touch can leave two fingers down. Rebase their pinch reference.
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
      pinchCamera = target.distance;
    }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', event => pointers.delete(event.pointerId));
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1);
    zoom(Math.exp(clamp(delta, -300, 300) * 0.001));
  }, { passive: false });
  canvas.addEventListener('keydown', event => {
    const actions = {
      ArrowLeft: () => { target.yaw -= 0.1; }, ArrowRight: () => { target.yaw += 0.1; },
      ArrowUp: () => { target.pitch = clamp(target.pitch - 0.1, -1.45, 1.45); },
      ArrowDown: () => { target.pitch = clamp(target.pitch + 0.1, -1.45, 1.45); },
      '+': () => zoom(0.9), '=': () => zoom(0.9), '-': () => zoom(1.1), Home: reset
    };
    if (actions[event.key]) { event.preventDefault(); actions[event.key](); schedule(); }
  });
  document.querySelector('#in').addEventListener('click', () => zoom(0.86));
  document.querySelector('#out').addEventListener('click', () => zoom(1.16));
  document.querySelector('#reset').addEventListener('click', reset);

  const lightButton = document.querySelector('#lighting-control');
  const lightPanel = document.querySelector('#lighting-panel');
  const lightInputs = [...lightPanel.querySelectorAll('input[data-light]')];
  const presetButtons = [...lightPanel.querySelectorAll('[data-preset]')];
  function refreshLightingControls() {
    for (const input of lightInputs) {
      const value = lightTarget[input.dataset.light];
      input.value = value;
      document.querySelector('#' + input.id + '-value').textContent = Math.round(value) + input.dataset.unit;
    }
    for (const button of presetButtons) {
      const preset = LIGHT_PRESETS[button.dataset.preset];
      button.setAttribute('aria-pressed', String(Object.keys(preset).every(key => Math.abs(lightTarget[key] - preset[key]) < 0.01)));
    }
  }
  function applyPreset(name) { Object.assign(lightTarget, LIGHT_PRESETS[name]); refreshLightingControls(); schedule(); }
  function closeLighting() { lightPanel.hidden = true; lightButton.setAttribute('aria-expanded', 'false'); }
  lightButton.addEventListener('click', () => {
    lightPanel.hidden = !lightPanel.hidden;
    lightButton.setAttribute('aria-expanded', String(!lightPanel.hidden));
  });
  for (const input of lightInputs) input.addEventListener('input', () => {
    const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    lightTarget[input.dataset.light] = clamp(value, Number(input.min), Number(input.max));
    refreshLightingControls(); schedule();
  });
  for (const button of presetButtons) button.addEventListener('click', () => applyPreset(button.dataset.preset));
  document.querySelector('#lighting-reset').addEventListener('click', () => applyPreset('day'));
  document.querySelector('#lighting-close').addEventListener('click', closeLighting);
  document.addEventListener('click', event => {
    if (!lightPanel.hidden && !lightPanel.contains(event.target) && !lightButton.contains(event.target)) closeLighting();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !lightPanel.hidden) { closeLighting(); lightButton.focus(); }
  });
  window.addEventListener('blur', () => pointers.clear());
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', schedule);
  engine.onContextLostObservable.add(() => {
    lost = true;
    showError('图形显示已中断，点击右上角复位按钮可重新打开。');
  });
  engine.onContextRestoredObservable.add(() => { lost = false; errorBox.hidden = true; schedule(); });
  refreshLightingControls();
  resize();

  // Keep event handling smooth; stop issuing GPU draws once the view is settled.
  engine.runRenderLoop(() => {
    if (document.hidden || lost) return;
    const factor = reducedMotion.matches ? 1 : 1 - Math.exp(-Math.min(engine.getDeltaTime(), 50) / 65);
    let remaining = 0;
    for (const key of Object.keys(state)) {
      const delta = target[key] - state[key];
      state[key] += delta * factor;
      remaining += Math.abs(delta);
    }
    for (const key of Object.keys(lightState)) {
      const delta = lightTarget[key] - lightState[key];
      lightState[key] += delta * factor;
      remaining += Math.abs(delta) * 0.01;
    }
    if (framesLeft > 0 || remaining > 0.0001 || !loaded || !model.environmentReady || !model.scene.isReady()) {
      model.update(state, lightState);
      model.scene.render();
      framesLeft = Math.max(0, framesLeft - 1);
    }
  });
  try {
    await loadPlanet(model);
  } catch (error) {
    engine.stopRenderLoop();
    model.dispose();
    engine.dispose();
    throw error;
  }
  loaded = true;
  hint.textContent = matchMedia('(pointer: coarse)').matches ? '拖动旋转 · 双指缩放' : '拖动旋转 · 滚轮缩放';
  schedule();
}

hint.textContent = '正在唤醒小地球…';
start().catch(error => {
  console.error('Planet renderer:', error);
  hint.textContent = '小地球暂时没有显示';
  showError('画面加载失败，请刷新重试，或先打开基础版。');
});
