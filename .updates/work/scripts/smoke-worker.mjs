#!/usr/bin/env node
import { run } from './_util.mjs';

try {
  console.log('[0] npm run typecheck');
  run('npm', ['run', 'typecheck']);

  console.log('[1] npm run deploy -- --dry-run');
  run('npm', ['run', 'deploy', '--', '--dry-run']);

  console.log('[OK] Worker smoke passed');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
