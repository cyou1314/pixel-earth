import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { usesStandalonePage, runStandaloneImport } from './runtime-mode.mjs';

if (await usesStandalonePage()) process.exit(runStandaloneImport(['--check']));

// Exercise the same package tree-shaking rules used for the browser build.
await mkdir('.qa', { recursive: true });
await build({ entryPoints: ['scripts/check-scene.mjs'], outfile: '.qa/check-bundle.mjs', bundle: true,
  platform: 'node', format: 'esm', target: 'es2022', legalComments: 'none' });
const child = spawn(process.execPath, ['.qa/check-bundle.mjs'], { stdio: 'inherit' });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
