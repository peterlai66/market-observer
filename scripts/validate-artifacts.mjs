#!/usr/bin/env node
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve('.');
const outbox = join(root, '.updates', 'outbox');
const deprecatedDirs = ['dev', 'patch', 'release', 'handoff'];
const requiredLatest = ['market-observer_release_latest.zip'];
const requiredRepoFiles = ['BASELINE.json'];
const forbiddenReleasePatterns = [/^market-observer_release_(?!latest\.zip$).+\.zip$/i];

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!existsSync(outbox)) fail('Missing .updates/outbox');
for (const required of requiredRepoFiles) {
  if (!existsSync(join(root, required))) fail(`Missing required repo file: ${required}`);
}

for (const dir of deprecatedDirs) {
  if (existsSync(join(outbox, dir))) fail(`Deprecated outbox directory must not exist: .updates/outbox/${dir}`);
}

const entries = readdirSync(outbox, { withFileTypes: true });
const files = entries.filter((e) => e.isFile()).map((e) => e.name);

for (const pattern of forbiddenReleasePatterns) {
  const bad = files.find((name) => pattern.test(name));
  if (bad) fail(`Forbidden versioned release artifact found: .updates/outbox/${bad}`);
}

for (const required of requiredLatest) {
  if (!files.includes(required)) fail(`Missing required latest artifact: .updates/outbox/${required}`);
}

const allowedDirs = new Set(['bak']);
for (const entry of entries) {
  if (entry.isDirectory() && !allowedDirs.has(entry.name)) {
    fail(`Unexpected outbox subdirectory: .updates/outbox/${entry.name}`);
  }
}

console.log('Artifact validation OK');
