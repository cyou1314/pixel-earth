import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { access } from 'node:fs/promises';

const file = resolve(process.argv[2] || 'authoring/pixel-earth-v0.4.blend');
await access(file);
const binary = process.env.BLENDER_BIN || 'blender';
const child = spawn(binary, ['--background', file, '--python', resolve('scripts/export-from-blender.py')], { stdio: 'inherit' });
child.on('error', error => {
  console.error('Blender could not start. Install Blender or set BLENDER_BIN to its executable. ' + error.message);
  process.exitCode = 1;
});
child.on('exit', code => { process.exitCode = code ?? 1; });
