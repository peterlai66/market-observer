#!/usr/bin/env node
import { run } from './_util.mjs';

const mode = (process.argv[2] || 'toolchain').trim().toLowerCase();
const includeWorker = mode === 'worker' || mode === 'full';

console.log(`MO Autopilot (${includeWorker ? 'worker' : 'toolchain'})`);
run('node', ['scripts/preflight.mjs', ...(includeWorker ? ['worker'] : [])]);
console.log('Autopilot OK');
