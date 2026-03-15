#!/usr/bin/env node
import { join, resolve } from 'node:path';
import { createZip, resolveArtifactItems, rotateLatest } from './_pack_common.mjs';

const root = resolve('.');
const outDir = join(root, '.updates', 'outbox');
const latestName = 'market-observer_patch_latest.zip';
const zipPath = join(outDir, latestName);
const items = resolveArtifactItems(root, { includeHandoff: false });

rotateLatest(outDir, latestName);
await createZip(root, zipPath, items);
console.log(`Packed => ${zipPath}`);
