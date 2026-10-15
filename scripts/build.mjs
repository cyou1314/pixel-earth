import { build } from 'esbuild';
import { access, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';

for (const file of ['dist/assets/planet.glb', 'dist/assets/afternoon-sky.hdr']) {
  await access(file, constants.R_OK);
}
await mkdir('dist', { recursive: true });
await mkdir('dist/licenses', { recursive: true });
await copyFile('node_modules/@babylonjs/core/license.md', 'dist/licenses/babylon-Apache-2.0.txt');
await build({ entryPoints: ['src/app.js'], outfile: 'dist/app.js', bundle: true,
  format: 'esm', minify: true, target: ['es2022'], legalComments: 'external', sourcemap: false });
await writeFile('dist/build.json', JSON.stringify({ version: '0.3.0', engine: 'Babylon.js 9.30.0' }) + '\n');
console.log('Built the self-hosted Babylon.js application.');
