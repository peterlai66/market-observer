#!/usr/bin/env node
import { run } from './_util.mjs';

const mode = (process.argv[2] || 'toolchain').trim().toLowerCase();
const includeWorker = mode === 'worker' || mode === 'full';

console.log(`MO Preflight (${includeWorker ? 'worker' : 'toolchain'})`);
const steps = [
  ['doctor', 'scripts/doctor.mjs'],
  ['smoke', 'scripts/smoke-tools.mjs'],
];
if (includeWorker) steps.push(['smoke-worker', 'scripts/smoke-worker.mjs']);
steps.push(['validate', 'scripts/validate.mjs']);
if (includeWorker) steps.push(['runtime-invariants', 'scripts/runtime-invariants.mjs']);
for (const [label, script] of steps) {
  console.log(`→ ${label}`);
  run('node', [script]);
}
console.log('Preflight OK');
