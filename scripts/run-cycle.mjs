#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve('.');

function readEnvFile(name) {
  const path = join(root, name);
  if (!existsSync(path)) return {};
  const out = {};
  for (const raw of readFileSync(path, 'utf-8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startswith?.('#')) continue;
    if (line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('\"') && value.endsWith('\"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

const envLocal = readEnvFile('.env.local');
const env = { ...envLocal, ...process.env };
const workerUrl = String(env.MO_WORKER_URL || env.WORKER_URL || '').trim().replace(/\/$/, '');
const token = String(env.MO_ADMIN_TOKEN || env.ADMIN_TOKEN || '').trim();
if (!workerUrl) {
  console.error('MO_WORKER_URL not set (.env.local or environment)');
  process.exit(1);
}
if (!token) {
  console.error('MO_ADMIN_TOKEN or ADMIN_TOKEN not set (.env.local or environment)');
  process.exit(1);
}
const endpoint = `${workerUrl}/admin/cycle?token=${encodeURIComponent(token)}`;
console.log('MO Cycle Trigger');
console.log(`worker: ${workerUrl}`);
console.log('endpoint: /admin/cycle');
const res = await fetch(endpoint, { method: 'GET' });
const text = await res.text();
if (!res.ok) {
  console.error(text || `HTTP ${res.status}`);
  process.exit(1);
}
console.log(text || 'cycle triggered successfully');
