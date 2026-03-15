#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve('.');
const path = join(root, 'BASELINE.json');
if (!existsSync(path)) {
  console.error('Missing BASELINE.json');
  process.exit(1);
}
const data = JSON.parse(readFileSync(path, 'utf-8'));
console.log('MO Baseline');
console.log('');
console.log(`project=${data.project || 'market-observer'}`);
console.log(`version=${data.version || 'unknown'}`);
console.log(`baseline_locked=${data.baseline_locked ? 'true' : 'false'}`);
console.log(`baseline_type=${data.baseline_type || 'unknown'}`);
console.log(`release_artifact=${data.release_artifact || 'market-observer_release_latest.zip'}`);
console.log(`preferred_dev_baseline=${data?.lock_rule?.preferred_dev_baseline || 'market-observer_dev_latest.zip'}`);
console.log(`fallback_release_baseline=${data?.lock_rule?.fallback_release_baseline || 'market-observer_release_latest.zip'}`);
console.log(`older_handoff_forbidden_as_dev_base=${data?.lock_rule?.older_handoff_forbidden_as_dev_base ? 'true' : 'false'}`);
console.log(`doctor_first_verification=${data?.lock_rule?.doctor_first_verification ? 'true' : 'false'}`);
console.log(`previous_locked_version=${data.previous_locked_version || '—'}`);
console.log(`generated_at=${data.generated_at || '—'}`);
console.log(`fingerprint_sha256=${data.fingerprint_sha256 || '—'}`);
console.log('Baseline OK');
