import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync, createWriteStream } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { nowTag } from './_util.mjs';


const AUTO_INCLUDE_DIRS = ['src', 'scripts', 'migrations', 'docs', 'developer'];
const ROOT_FILE_BLOCKLIST = new Set([
  'market-observer_dev_latest.zip',
  'market-observer_patch_latest.zip',
  'market-observer_release_latest.zip',
]);
const ROOT_DIR_BLOCKLIST = new Set([
  '.git',
  'node_modules',
  '.wrangler',
  '.updates',
  'artifacts',
  '.vscode',
]);

function isPackableRootFile(name) {
  if (ROOT_FILE_BLOCKLIST.has(name)) return false;
  if (name === 'HANDOFF.md') return false;
  if (name.endsWith('.zip')) return false;
  if (name.endsWith('.log')) return false;
  return true;
}

export function resolveArtifactItems(rootDir, options = {}) {
  const includeHandoff = options.includeHandoff === true;
  const rootEntries = readdirSync(rootDir, { withFileTypes: true });
  const items = new Set();
  for (const entry of rootEntries) {
    const name = entry.name;
    if (entry.isDirectory()) {
      if (AUTO_INCLUDE_DIRS.includes(name)) items.add(name);
      continue;
    }
    if (isPackableRootFile(name)) items.add(name);
  }
  items.add('.updates/README.md');
  if (includeHandoff && existsSync(join(rootDir, 'HANDOFF.md'))) items.add('HANDOFF.md');
  return Array.from(items).filter((item) => {
    const head = item.split(/[\/]/)[0];
    return !ROOT_DIR_BLOCKLIST.has(head);
  }).sort();
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

export function rotateLatest(outDir, latestName) {
  ensureDir(outDir);
  const bakDir = join(outDir, 'bak');
  ensureDir(bakDir);
  const latestPath = join(outDir, latestName);
  if (existsSync(latestPath)) {
    const archivedName = latestName.replace(/_latest\.zip$/i, `_${nowTag()}.zip`);
    renameSync(latestPath, join(bakDir, archivedName));
  }
}

function stageItems(rootDir, stageDir, items) {
  for (const item of items) {
    const src = join(rootDir, item);
    if (!existsSync(src)) continue;
    const dest = join(stageDir, item);
    cpSync(src, dest, { recursive: true, force: true });
  }
}

function normalizeEntryName(name) {
  return name.split(sep).join('/');
}

function addDirectoryRecursive(archive, rootDir, currentDir) {
  for (const name of readdirSync(currentDir)) {
    const full = join(currentDir, name);
    const st = statSync(full);
    const rel = normalizeEntryName(relative(rootDir, full));
    if (st.isDirectory()) {
      archive.append('', { name: `${rel}/` });
      addDirectoryRecursive(archive, rootDir, full);
    } else {
      archive.file(full, { name: rel });
    }
  }
}

async function zipDirectoryWithArchiver(stageDir, zipPath) {
  const { default: archiver } = await import('archiver');
  rmSync(zipPath, { force: true });
  await new Promise((resolvePromise, rejectPromise) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolvePromise);
    output.on('error', rejectPromise);
    archive.on('error', rejectPromise);
    archive.pipe(output);

    addDirectoryRecursive(archive, stageDir, stageDir);
    archive.finalize().catch(rejectPromise);
  });
}

function zipDirectoryWithSystemZip(stageDir, zipPath) {
  rmSync(zipPath, { force: true });
  const workdir = stageDir;
  execFileSync('zip', ['-qr', zipPath, '.'], { cwd: workdir, stdio: 'inherit' });
}

async function zipDirectory(stageDir, zipPath) {
  try {
    await zipDirectoryWithArchiver(stageDir, zipPath);
  } catch (e) {
    if (!String(e?.code || e?.message || e).includes('ERR_MODULE_NOT_FOUND')) throw e;
    zipDirectoryWithSystemZip(stageDir, zipPath);
  }
}

export async function createZip(rootDir, zipPath, items) {
  ensureDir(dirname(zipPath));
  const stageDir = mkdtempSync(join(tmpdir(), 'mo-zip-'));
  try {
    stageItems(rootDir, stageDir, items);
    await zipDirectory(stageDir, zipPath);
    const st = statSync(zipPath);
    if (!st.size) throw new Error('zip created but empty');
    return st.size;
  } finally {
    rmSync(stageDir, { recursive: true, force: true });
  }
}

export function extractZip(zipPath, outDir) {
  rmSync(outDir, { recursive: true, force: true });
  ensureDir(outDir);
  if (process.platform === 'win32') {
    const ps = [
      '$ErrorActionPreference = "Stop"',
      'Add-Type -AssemblyName System.IO.Compression.FileSystem',
      `$zip = ${JSON.stringify(resolve(zipPath))}`,
      `$out = ${JSON.stringify(resolve(outDir))}`,
      'if (Test-Path $out) { Remove-Item -LiteralPath $out -Recurse -Force }',
      'New-Item -ItemType Directory -Path $out -Force | Out-Null',
      '[System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $out)',
    ].join('; ');
    execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });
  } else {
    execFileSync('unzip', ['-q', zipPath, '-d', outDir], { stdio: 'inherit' });
  }
}

export function countFilesRecursive(dir) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) total += countFilesRecursive(full);
    else total += 1;
  }
  return total;
}
