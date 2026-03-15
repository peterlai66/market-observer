#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve('.');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const version = String(pkg.version || '').trim();
if (!version) {
  console.error('package.json version missing');
  process.exit(1);
}

const baselinePath = join(root, 'BASELINE.json');
let previous = null;
if (existsSync(baselinePath)) {
  try {
    previous = JSON.parse(readFileSync(baselinePath, 'utf-8'));
  } catch {
    previous = null;
  }
}

const fingerprintFiles = [
  'MO_START.md',
  'package.json',
  'VERSION',
  'CHANGELOG.md',
  'RELEASE_NOTES.md',
  'scripts/mo.mjs',
  'scripts/recommendation-scoreboard.mjs',
  'docs/PROJECT.md',
  'docs/AI_MEMORY.md',
  'docs/NEXT_TASK.md'
];

const hash = createHash('sha256');
for (const rel of fingerprintFiles) {
  const path = join(root, rel);
  if (!existsSync(path)) continue;
  hash.update(`FILE:${rel}\n`);
  hash.update(readFileSync(path));
  hash.update('\n');
}

const payload = {
  project: 'market-observer',
  version,
  baseline_locked: true,
  baseline_type: 'release',
  release_artifact: 'market-observer_release_latest.zip',
  lock_rule: {
    preferred_dev_baseline: 'market-observer_dev_latest.zip',
    fallback_release_baseline: 'market-observer_release_latest.zip',
    older_handoff_forbidden_as_dev_base: true,
    doctor_first_verification: true,
  },
  previous_locked_version: previous?.version && previous.version !== version
    ? previous.version
    : (previous?.previous_locked_version || null),
  generated_at: new Date().toISOString(),
  fingerprint_sha256: hash.digest('hex'),
  fingerprint_files: fingerprintFiles,
};

writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Baseline locked => ${baselinePath}`);
