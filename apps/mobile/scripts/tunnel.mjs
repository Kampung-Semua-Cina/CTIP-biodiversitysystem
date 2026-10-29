// apps/mobile/scripts/tunnel.mjs
// npm run tunnel: for a phone that is not on the same Wi-Fi as this computer.
// Expo's tunnel only forwards the app's code (port 8081), not the API, so this
// also opens an ngrok tunnel to the API (port 8000) and starts Expo with
// EXPO_PUBLIC_API_URL set to it. Needs ngrok signed in (ngrok config
// add-authtoken ...) and the API running (npm run api).
// Anyone with the ngrok link can reach the API while this runs; signed-in
// routes still need a valid token.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const API_PORT = process.env.API_PORT ?? '8000';
const children = [];
const stopAll = (code = 0) => {
  for (const c of children) c.kill('SIGTERM');
  process.exit(code);
};
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

// Is the API up? Without it the tunnel would lead nowhere.
try {
  await fetch(`http://localhost:${API_PORT}/v1/public/species`, { signal: AbortSignal.timeout(3000) });
} catch {
  console.error(`The API is not running on port ${API_PORT}. Start it first in another terminal: npm run api`);
  process.exit(1);
}

// ngrok prints its public link in its JSON log.
const ngrok = spawn('ngrok', ['http', API_PORT, '--log', 'stdout', '--log-format', 'json'], { stdio: ['ignore', 'pipe', 'inherit'] });
children.push(ngrok);
ngrok.on('error', (err) => {
  console.error(err.code === 'ENOENT' ? 'ngrok is not installed: https://ngrok.com/download' : err.message);
  stopAll(1);
});
ngrok.on('exit', (code) => {
  console.error(`ngrok stopped (exit ${code}). Check that it is signed in: ngrok config add-authtoken <token>`);
  stopAll(1);
});

const apiUrl = await new Promise((resolve) => {
  const timer = setTimeout(() => {
    console.error('ngrok did not open a tunnel within 20 s.');
    stopAll(1);
  }, 20000);
  createInterface({ input: ngrok.stdout }).on('line', (line) => {
    let entry;
    try { entry = JSON.parse(line); } catch { return; }
    if (entry.lvl === 'eror' || entry.err) console.error('ngrok:', entry.err || entry.msg);
    if (entry.msg === 'started tunnel' && entry.url?.startsWith('https://')) {
      clearTimeout(timer);
      resolve(entry.url);
    }
  });
});
console.log(`\nAPI tunnel: ${apiUrl} -> http://localhost:${API_PORT}\n`);

// --clear: the API link is new each time and is built into the app's code.
const expo = spawn('npx', ['expo', 'start', '--tunnel', '--clear', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, EXPO_PUBLIC_API_URL: apiUrl },
  shell: process.platform === 'win32',
});
children.push(expo);
expo.on('exit', (code) => stopAll(code ?? 0));
