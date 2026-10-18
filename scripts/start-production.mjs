// M7 A-REL-1: migrations/recovery before traffic; one bounded maintenance child at a time.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

if (process.env.SPLITCART_DEV_AUTH === '1') throw Error('Development identity is forbidden in production');
for (const key of ['DATABASE_URL', 'NEXTAUTH_URL', 'NEXTAUTH_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']) {
  if (!process.env[key]?.trim()) throw Error(`Missing required production variable: ${key}`);
}
if (new URL(process.env.NEXTAUTH_URL).protocol !== 'https:') throw Error('Production authentication requires HTTPS');

const children = new Set();
let stopping = false;
let maintenance = null;
function start(args, logs = true) {
  const child = spawn(process.execPath, args, { detached: true, stdio: logs ? 'inherit' : 'ignore' });
  children.add(child);
  child.once('close', () => children.delete(child));
  return child;
}
function run(script) {
  return new Promise((yes, no) => {
    const child = start([resolve('node_modules/tsx/dist/cli.mjs'), script]);
    child.once('error', no);
    child.once('close', code => code === 0 ? yes() : no(Error(`Startup check failed: ${script}`)));
  });
}
function terminate(signal) {
  stopping = true;
  for (const child of children) if (child.pid) {
    try { process.kill(-child.pid, signal); } catch { /* Already stopped. */ }
  }
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => terminate(signal));

await run('scripts/migrate.ts');
if (stopping) process.exit(0);
await run('scripts/maintenance.ts');
if (stopping) process.exit(0);
await run('scripts/doctor.ts');
if (stopping) process.exit(0);
const web = start([resolve('node_modules/next/dist/bin/next'), 'start', '--hostname', '0.0.0.0']);
web.once('error', () => { terminate('SIGTERM'); process.exitCode = 1; });
const timer = setInterval(() => {
  if (stopping || maintenance) return;
  maintenance = start([resolve('node_modules/tsx/dist/cli.mjs'), 'scripts/maintenance.ts'], false);
  const deadline = setTimeout(() => {
    if (maintenance?.pid) try { process.kill(-maintenance.pid, 'SIGKILL'); } catch { /* Already stopped. */ }
  }, 45000);
  maintenance.once('error', () => console.error('Maintenance failed; retrying next interval.'));
  maintenance.once('close', code => {
    clearTimeout(deadline);
    maintenance = null;
    if (code !== 0 && !stopping) console.error('Maintenance failed; retrying next interval.');
  });
}, 60000);
web.once('close', (code, signal) => {
  const requestedStop = stopping;
  clearInterval(timer);
  terminate('SIGTERM');
  process.exitCode = requestedStop && signal ? 0 : (code ?? 1);
});
