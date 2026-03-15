import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

function needsCmdWrapper(cmd) {
  if (process.platform !== "win32") return false;
  return cmd === "npm" || cmd === "npx" || /\.(cmd|bat)$/i.test(cmd);
}

function normalizeArgs(args) {
  return Array.isArray(args) ? args.map((v) => String(v)) : [];
}

function spawnCrossPlatform(cmd, args = [], opts = {}) {
  const finalArgs = normalizeArgs(args);
  if (needsCmdWrapper(cmd)) {
    return spawnSync("cmd.exe", ["/d", "/s", "/c", cmd, ...finalArgs], {
      stdio: "inherit",
      shell: false,
      ...opts,
    });
  }
  return spawnSync(cmd, finalArgs, { stdio: "inherit", shell: false, ...opts });
}

export function runSoft(cmd, args = [], opts = {}) {
  const res = spawnCrossPlatform(cmd, args, opts);
  return {
    status: res.status ?? (res.error ? 1 : 0),
    error: res.error,
  };
}

export function run(cmd, args = [], opts = {}) {
  const r = runSoft(cmd, args, opts);
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${cmd} failed with exit code ${r.status}`);
}

export function nowTag() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function safeGitSha() {
  try {
    const r = spawnCrossPlatform("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (r.status === 0) return String(r.stdout || "").trim() || "nogit";
  } catch {}
  return "nogit";
}

export function openExplorer(targetPath) {
  const p = resolve(String(targetPath));
  if (process.platform !== "win32") return;
  const isZip = /\.zip$/i.test(p);
  const args = isZip ? ["/select,", p] : [p];
  const r = runSoft("explorer.exe", args, { shell: false });
  if (r.status !== 0) console.log(`Explorer opened (exit=${r.status} ignored)`);
}
