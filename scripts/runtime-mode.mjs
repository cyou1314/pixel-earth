import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export async function usesStandalonePage() {
  try {
    await access('pixel-earth.html');
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    const manifest = JSON.parse(await readFile('dist/build.json', 'utf8'));
    // A missing source must fail rather than silently rebuild the old engine.
    return manifest.engine === 'WebGL Cube-Sphere Pixel Pipeline';
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return false;
  }
}

export function runStandaloneImport(arguments_ = []) {
  const script = new URL('./import-standalone.py', import.meta.url);
  const result = spawnSync('python3', [fileURLToPath(script), ...arguments_], { stdio: 'inherit' });
  if (result.error) console.error('无法运行 v0.5 导入脚本，需要 Python 3 和 Node.js：', result.error.message);
  return result.status ?? 1;
}
