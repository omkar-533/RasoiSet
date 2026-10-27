import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;

const api = spawn(node, ['--experimental-strip-types', 'server/index.js'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});
const vite = spawn(node, ['node_modules/vite/bin/vite.js'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

function stop() {
  api.kill();
  vite.kill();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
api.on('exit', (code) => {
  vite.kill();
  process.exit(code ?? 0);
});
vite.on('exit', (code) => {
  api.kill();
  process.exit(code ?? 0);
});
