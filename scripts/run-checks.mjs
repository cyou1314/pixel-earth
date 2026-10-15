import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { usesStandalonePage, runStandaloneImport } from './runtime-mode.mjs';

const standalone = await usesStandalonePage();
if (standalone) {
  const status = runStandaloneImport(['--check']);
  if (status) process.exit(status);
}

// Exercise the same package tree-shaking rules used for the browser build.
await mkdir('.qa', { recursive: true });
await build({ entryPoints: [standalone ? 'scripts/check-v05.mjs' : 'scripts/check-scene.mjs'], outfile: '.qa/check-bundle.mjs', bundle: true,
  platform: 'node', format: 'esm', target: 'es2022', legalComments: 'none' });
const child = spawn(process.execPath, ['.qa/check-bundle.mjs'], { stdio: 'inherit' });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
