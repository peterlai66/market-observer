#!/usr/bin/env node
import { join, resolve } from 'node:path';
import { createZip, resolveArtifactItems, rotateLatest } from './_pack_common.mjs';
import { run } from './_util.mjs';

const root = resolve('.');
const outDir = join(root, '.updates', 'outbox');
const latestName = 'market-observer_release_latest.zip';
const zipPath = join(outDir, latestName);
const items = resolveArtifactItems(root, { includeHandoff: false });

run('node', ['scripts/sync-structure.mjs']);
run('node', ['scripts/sync-runtime-version.mjs']);
run('node', ['scripts/write-baseline.mjs']);
run('node', ['scripts/doctor.mjs']);
run('node', ['scripts/validate.mjs']);
rotateLatest(outDir, latestName);
await createZip(root, zipPath, items);
run('node', ['scripts/validate-artifacts.mjs']);
console.log(`Packed => ${zipPath}`);
