#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { run } from './_util.mjs';

console.log('MO Validate');
for (const [label, script] of [
  ['guard', 'scripts/guard.mjs'],
  ['sanity', 'scripts/sanity.mjs'],
]) {
  console.log(`→ ${label}`);
  run('node', [script]);
}

const latestRelease = join(resolve('.'), '.updates', 'outbox', 'market-observer_release_latest.zip');
if (existsSync(latestRelease)) {
  console.log('→ validate-artifacts');
  run('node', ['scripts/validate-artifacts.mjs']);
} else {
  console.log('→ validate-artifacts (skip: no release in outbox yet)');
}

console.log('Validate OK');
