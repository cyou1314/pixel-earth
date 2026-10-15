import { Engine } from '@babylonjs/core/Engines/engine.js';
import { createPlanetScene, framePlanet, INITIAL_VIEW, LIGHT_PRESETS, clamp, limitZoom } from './scene.js';
import { loadPlanet } from './load-planet.js';

const canvas = document.querySelector('#world');
const errorBox = document.querySelector('#error');
const hint = document.querySelector('#hint');
const stage = document.querySelector('main');
const loading = document.querySelector('#loading');
const sceneControls = [...document.querySelectorAll('[data-scene-control]')];
const zoomIn = document.querySelector('#in');
const zoomOut = document.querySelector('#out');
const zoomValue = document.querySelector('#zoom-value');
let lost = false;

function showError(message) {
  document.querySelector('#error-message').textContent = message;
  loading.hidden = true;
  stage.setAttribute('aria-busy', 'false');
  for (const control of sceneControls) control.disabled = true;
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
  let framesLeft = 2, loaded = false, ready = false, pinchDistance = 0, pinchCamera = INITIAL_VIEW.distance;
  const schedule = () => { framesLeft = Math.max(framesLeft, 3); };

  function refreshZoom() {
    zoomValue.textContent = Math.round(INITIAL_VIEW.distance / target.distance * 100) + '%';
    zoomIn.disabled = !ready || lost || target.distance <= limitZoom(0) + 0.001;
    zoomOut.disabled = !ready || lost || target.distance >= limitZoom(Infinity) - 0.001;
  }

  function resize() {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
    const scale = Math.min(devicePixelRatio || 1, 1.75, Math.sqrt(2400000 / (w * h)));
    engine.setSize(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
    framePlanet(model.camera, w, h);
    schedule();
  }
  function zoom(factor) {
    if (!ready || lost) return;
    target.distance = limitZoom(target.distance * factor);
    refreshZoom(); schedule();
  }
  function reset() {
    if (lost) { location.reload(); return; }
    Object.assign(target, INITIAL_VIEW);
    refreshZoom(); schedule();
  }
  canvas.addEventListener('pointerdown', event => {
    if (!ready || lost) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.classList.add('is-dragging');
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
      const sensitivity = Math.PI * 0.9 / Math.max(240, Math.min(canvas.clientWidth, canvas.clientHeight));
      target.yaw += dx * sensitivity;
      target.pitch = clamp(target.pitch + dy * sensitivity, -1.45, 1.45);
    } else {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance > 4 && distance > 4) target.distance = limitZoom(pinchCamera * pinchDistance / distance);
      refreshZoom();
    }
    schedule();
  });
  const endPointer = pointerId => {
    if (!pointers.delete(pointerId)) return;
    canvas.classList.toggle('is-dragging', pointers.size > 0);
    // A third touch can leave two fingers down. Rebase their pinch reference.
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
      pinchCamera = target.distance;
    }
  };
  const release = event => {
    endPointer(event.pointerId);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', event => endPointer(event.pointerId));
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1);
    zoom(Math.exp(clamp(delta, -300, 300) * 0.001));
  }, { passive: false });
  canvas.addEventListener('keydown', event => {
    if (!ready || lost) return;
    const actions = {
      ArrowLeft: () => { target.yaw -= 0.1; }, ArrowRight: () => { target.yaw += 0.1; },
      ArrowUp: () => { target.pitch = clamp(target.pitch - 0.1, -1.45, 1.45); },
      ArrowDown: () => { target.pitch = clamp(target.pitch + 0.1, -1.45, 1.45); },
      '+': () => zoom(0.9), '=': () => zoom(0.9), '-': () => zoom(1.1), Home: reset
    };
    if (actions[event.key]) { event.preventDefault(); actions[event.key](); schedule(); }
  });
  zoomIn.addEventListener('click', () => zoom(0.86));
  zoomOut.addEventListener('click', () => zoom(1.16));
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
  function closeLighting(returnFocus = false) {
    lightPanel.hidden = true;
    lightButton.setAttribute('aria-expanded', 'false');
    if (returnFocus) lightButton.focus();
  }
  lightButton.addEventListener('click', event => {
    lightPanel.hidden = !lightPanel.hidden;
    lightButton.setAttribute('aria-expanded', String(!lightPanel.hidden));
    if (!lightPanel.hidden && event.detail === 0) presetButtons[0].focus();
  });
  for (const input of lightInputs) input.addEventListener('input', () => {
    const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    lightTarget[input.dataset.light] = clamp(value, Number(input.min), Number(input.max));
    refreshLightingControls(); schedule();
  });
  for (const button of presetButtons) button.addEventListener('click', () => applyPreset(button.dataset.preset));
  document.querySelector('#lighting-reset').addEventListener('click', () => applyPreset('day'));
  document.querySelector('#lighting-close').addEventListener('click', () => closeLighting(true));
  document.addEventListener('click', event => {
    if (!lightPanel.hidden && !lightPanel.contains(event.target) && !lightButton.contains(event.target)) closeLighting();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !lightPanel.hidden) closeLighting(true);
  });
  function clearPointers() {
    for (const id of [...pointers.keys()]) release({ pointerId: id });
  }
  window.addEventListener('blur', clearPointers);
  window.addEventListener('resize', resize);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  document.addEventListener('visibilitychange', schedule);
  engine.onContextLostObservable.add(() => {
    lost = true;
    clearPointers(); closeLighting();
    showError('画面暂时中断，请重新加载。也可以先打开基础版。');
  });
  engine.onContextRestoredObservable.add(() => {
    lost = false;
    errorBox.hidden = true;
    for (const control of sceneControls) control.disabled = !ready;
    refreshZoom(); schedule();
  });
  refreshLightingControls();
  resize();

  reducedMotion.addEventListener('change', schedule);
  let lastTick = performance.now(), lastDraw = 0, waterTime = 0;
  // Gentle water at 30fps while idle; hidden tabs and reduced-motion views rest.
  engine.runRenderLoop(() => {
    const now = performance.now();
    const dt = Math.min((now - lastTick) / 1000, 0.05);
    lastTick = now;
    if (document.hidden || lost) return;
    const factor = reducedMotion.matches ? 1 : 1 - Math.exp(-dt / 0.065);
    if (!reducedMotion.matches) waterTime += dt;
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
    const waterDue = loaded && !reducedMotion.matches && now - lastDraw >= 1000 / 30;
    if (waterDue || framesLeft > 0 || remaining > 0.0001 || !loaded || !model.environmentReady || !model.scene.isReady()) {
      model.update(state, lightState);
      if (model.oceanSurface) model.oceanSurface.time = reducedMotion.matches ? 0 : waterTime;
      model.scene.render();
      lastDraw = now - ((now - lastDraw) % (1000 / 30));
      framesLeft = Math.max(0, framesLeft - 1);
    }
  });
  const slowLoad = setTimeout(() => {
    document.querySelector('#loading-detail').textContent = '加载稍慢，可以继续等待或打开基础版';
  }, 12000);
  try {
    await loadPlanet(model);
    await model.scene.whenReadyAsync();
  } catch (error) {
    resizeObserver.disconnect();
    engine.stopRenderLoop();
    model.dispose();
    engine.dispose();
    throw error;
  } finally {
    clearTimeout(slowLoad);
  }
  loaded = true;
  model.update(state, lightState);
  model.scene.render();
  ready = true;
  stage.classList.add('is-ready');
  stage.setAttribute('aria-busy', 'false');
  canvas.tabIndex = 0;
  loading.hidden = true;
  for (const control of sceneControls) control.disabled = false;
  refreshZoom();
  hint.textContent = matchMedia('(pointer: coarse)').matches ? '拖动旋转 · 双指缩放' : '拖动旋转 · 滚轮缩放';
  schedule();
}

hint.textContent = '正在唤醒小地球…';
start().catch(error => {
  console.error('Planet renderer:', error);
  hint.textContent = '小地球暂时没有显示';
  showError('画面加载失败，请重新加载，或先打开基础版。');
});
