import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
const __name = (f) => f;
const SCAN = {"patterns":[["wall_clock","\\bDate\\.now\\s*\\(\\s*\\)|\\bnew\\s+Date\\s*\\(\\s*\\)|\\bperformance\\.now\\s*\\(\\s*\\)","g"],["unseeded_random","\\bMath\\.random\\s*\\(\\s*\\)","g"],["raw_timer","(?<![\\w$.])(?:setTimeout|setInterval)\\s*\\(","g"],["direct_fetch","(?<![\\w$.])fetch\\s*\\(","g"]],"scannable":["\\.(?:[cm]?[jt]sx?)$",""],"skipPath":["(?:^|\\/)(?:node_modules|dist|build|\\.next|coverage|vendor|\\.great-arrow)\\/|\\.(?:test|spec)\\.[cm]?[jt]sx?$|(?:^|\\/)(?:__tests__|tests?)\\/|(?:^|\\/)great-arrow-sim\\.[cm]?[jt]s$",""]};
const blankCommentsAndStrings = function blankCommentsAndStrings(src){let out="";let i=0;const n=src.length;const blank=__name(s=>s.replace(/[^\n]/g," "),"blank");while(i<n){const c=src[i];const next=src[i+1];if(c==="/"&&next==="/"){const end=src.indexOf("\n",i);const stop=end===-1?n:end;out+=blank(src.slice(i,stop));i=stop}else if(c==="/"&&next==="*"){const end=src.indexOf("*/",i+2);const stop=end===-1?n:end+2;out+=blank(src.slice(i,stop));i=stop}else if(c==='"'||c==="'"||c==="`"){let j=i+1;while(j<n&&src[j]!==c){if(src[j]==="\\")j++;else if(c!=="`"&&src[j]==="\n")break;j++}const stop=Math.min(j+1,n);out+=c+blank(src.slice(i+1,stop-1))+(stop-1>i?src[stop-1]:"");i=stop}else{out+=c;i++}}return out};

const MARKER = "GAD_SIM_RESULT";
const MAX_HAZARDS = 200;
const ALLOWED = new RegExp("^(?:npm|pnpm|yarn) (?:test|run verify)$");
const SEAM_IMPORT = /great-arrow-sim(?:\.m?[jt]s)?["']/;
const PATTERNS = SCAN.patterns.map(([kind, source, flags]) => [kind, new RegExp(source, flags)]);
const SCANNABLE = new RegExp(SCAN.scannable[0], SCAN.scannable[1]);
const SKIP_PATH = new RegExp(SCAN.skipPath[0], SCAN.skipPath[1]);

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function scanSource(path, src) {
  const code = blankCommentsAndStrings(src);
  const lines = src.split("\n");
  const lineStarts = [0];
  for (let i = 0; i < code.length; i++) if (code[i] === "\n") lineStarts.push(i + 1);
  const lineOf = (offset) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  const hazards = [];
  for (const [kind, re] of PATTERNS) {
    for (const m of code.matchAll(re)) {
      const line = lineOf(m.index);
      hazards.push({ kind, path, line, snippet: lines[line - 1].trim().slice(0, 160) });
    }
  }
  return hazards.sort((a, b) => a.line - b.line || a.kind.localeCompare(b.kind));
}

const started = Date.now();
const budgetMs = Math.max(0, Number(arg("--budget-ms")) || 0);
const cmd = arg("--cmd") ?? "";
const seeds = (arg("--seeds") ?? "")
  .split(",")
  .filter(Boolean)
  .map(Number)
  .filter((n) => Number.isInteger(n) && n >= 0 && n < 2 ** 32);

const ls = spawnSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 60000 });
const files = ls.status === 0 ? ls.stdout.split("\0").filter(Boolean) : [];
let filesScanned = 0;
let total = 0;
let seamImported = false;
const hazards = [];
for (const path of files) {
  if (!SCANNABLE.test(path) || SKIP_PATH.test(path)) continue;
  let src;
  try {
    src = readFileSync(path, "utf8");
  } catch {
    continue;
  }
  filesScanned++;
  if (!seamImported && SEAM_IMPORT.test(src) && /\bimport\b|\brequire\s*\(/.test(src)) seamImported = true;
  const found = scanSource(path, src);
  total += found.length;
  for (const h of found) if (hazards.length < MAX_HAZARDS) hazards.push(h);
}

const runs = [];
if (ALLOWED.test(cmd)) {
  for (const seed of seeds) {
    const remaining = budgetMs - (Date.now() - started);
    if (remaining <= 0) break;
    const t0 = Date.now();
    process.stderr.write("--- great-arrow-sim seed " + seed + " ---\n");
    const r = spawnSync("sh", ["-c", cmd], {
      env: { ...process.env, GAD_SEED: String(seed), DST_SEED: String(seed), CI: "1" },
      stdio: ["ignore", 2, 2],
      timeout: remaining,
      killSignal: "SIGKILL",
    });
    const timedOut = Boolean(r.error && r.error.code === "ETIMEDOUT");
    runs.push({ seed, exit: timedOut ? null : r.status, ms: Date.now() - t0, timedOut });
  }
}

console.log(MARKER + " " + JSON.stringify({
  filesScanned,
  hazards,
  truncatedHazards: total - hazards.length,
  seeds: runs,
  requested: seeds.length,
  seamImported,
}));
