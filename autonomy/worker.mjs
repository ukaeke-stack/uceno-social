import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, appendFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const cfg = {
  repo: process.env.REPO_URL || "https://github.com/ukaeke-stack/uceno-social.git",
  branch: process.env.WORK_BRANCH || "infra/uceno-autonomous-development-agent",
  workdir: process.env.WORKDIR || "/workspace/uceno-social",
  stateDir: process.env.STATE_DIR || "/state",
  idleMs: Number(process.env.IDLE_MS || 300000),
  maxCycles: Number(process.env.MAX_CYCLES_PER_DAY || 24),
  timeoutMs: Number(process.env.CYCLE_TIMEOUT_MS || 2700000),
  repoToken: process.env.GITHUB_TOKEN,
  apiKey: process.env.OPENAI_API_KEY
};
const stateFile = path.join(cfg.stateDir, "worker-state.json");
const logFile = path.join(cfg.stateDir, "worker.log");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.cleanEnv ? options.env : { ...process.env, ...(options.env || {}) },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", d => stdout += d.toString());
    child.stderr.on("data", d => stderr += d.toString());
    const timer = options.timeout ? setTimeout(() => child.kill("SIGTERM"), options.timeout) : null;
    child.on("error", reject);
    child.on("close", code => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}
async function log(message) {
  const line = "[" + new Date().toISOString() + "] " + message + "\n";
  process.stdout.write(line);
  await appendFile(logFile, line);
}
async function loadState() {
  try { return JSON.parse(await readFile(stateFile, "utf8")); }
  catch { return { day: new Date().toISOString().slice(0, 10), cycles: 0, completed: 0, failed: 0, lastCommit: null }; }
}
async function saveState(state) { await writeFile(stateFile, JSON.stringify(state, null, 2)); }
async function git(args, timeout = 120000) {
  const auth = cfg.repoToken ? ["-c", "http.extraheader=AUTHORIZATION: basic " + Buffer.from("x-access-token:" + cfg.repoToken).toString("base64")] : [];
  return run("git", [...auth, ...args], { cwd: cfg.workdir, timeout });
}
async function ensureCheckout() {
  await mkdir(path.dirname(cfg.workdir), { recursive: true });
  if (!existsSync(path.join(cfg.workdir, ".git"))) {
    const auth = cfg.repoToken ? ["-c", "http.extraheader=AUTHORIZATION: basic " + Buffer.from("x-access-token:" + cfg.repoToken).toString("base64")] : [];
    const result = await run("git", [...auth, "clone", "--branch", cfg.branch, cfg.repo, cfg.workdir], { timeout: 300000 });
    if (result.code !== 0) throw new Error("git clone failed: " + result.stderr.slice(-2000));
  }
  const fetch = await git(["fetch", "origin", cfg.branch], 180000);
  if (fetch.code !== 0) throw new Error("git fetch failed: " + fetch.stderr.slice(-2000));
  const checkout = await git(["checkout", cfg.branch]);
  if (checkout.code !== 0) throw new Error("git checkout failed: " + checkout.stderr.slice(-2000));
  const reset = await git(["reset", "--hard", "origin/" + cfg.branch]);
  if (reset.code !== 0) throw new Error("git reset failed: " + reset.stderr.slice(-2000));
}
function promptForCycle() {
  return `You are the autonomous engineering worker for UCENO Social and UCENO Virtual World.
Repository: ukaeke-stack/uceno-social. Work branch: ${cfg.branch}.
Read docs/UCENO_FULL_REQUIREMENT_LEDGER.md, project instructions, git status and relevant source/tests first. Work on ONE coherent, bounded, high-leverage engineering task. Advance the whole product: economy/marketplace, AI citizens, trust and safety, canonical Social identity, avatars, cities/world content, Addressables, multiplayer, and release infrastructure. Do not focus only on city buildings or treasure hunts. Avoid duplicate work. Reconcile nine-versus-ten-city scope instead of silently choosing one.

Implement code and automated tests, run relevant tests/builds, inspect failures and fix them. If external credentials, a product decision, production database, Unity Editor or physical device is required, record the blocker and do not fabricate verification. Update the requirement ledger with exact files, tests actually run, results and remaining proof. Never mark complete based only on source code.

HARD SAFETY: Do not merge PRs, deploy, apply production migrations, publish Addressables, build/release APKs, change live secrets, enable scheduled hunts, enable escrow/settlement, or spend money. Do not add secrets. Do not commit or push; supervisor handles that after successful exit. Finish with a concise terminal report: task, files changed, tests actually run/results, blockers, and user decisions needed. If no safe task can be completed, explain and exit without changes.`;
}
async function runCycle(state) {
  await ensureCheckout();
  const before = await git(["status", "--porcelain"]);
  if (before.code !== 0 || before.stdout.trim()) throw new Error("working tree must be clean before a cycle");
  await log("Starting engineering cycle " + state.cycles);
  const result = await run("codex", ["exec", "--full-auto", "--cd", cfg.workdir, promptForCycle()], {
    cwd: cfg.workdir, timeout: cfg.timeoutMs, cleanEnv: true, env: { PATH: process.env.PATH, HOME: "/tmp/home", TMPDIR: "/tmp", OPENAI_API_KEY: cfg.apiKey }
  });
  await log("Codex exit=" + result.code + "; output tail: " + (result.stdout + "\n" + result.stderr).slice(-5000));
  if (result.code !== 0) throw new Error("Codex task did not complete successfully");
  const check = await git(["diff", "--check"]);
  if (check.code !== 0) throw new Error("git diff --check failed: " + check.stderr);
  const status = await git(["status", "--porcelain"]);
  if (status.code !== 0) throw new Error("git status failed");
  if (!status.stdout.trim()) { await log("No source changes produced; no commit created."); return; }
  const add = await git(["add", "-A"]);
  if (add.code !== 0) throw new Error("git add failed");
  const diff = await git(["diff", "--cached", "--stat"]);
  await log("Staged changes: " + diff.stdout.trim());
  const commit = await git(["commit", "-m", "Autonomous UCENO engineering: verified task"]);
  if (commit.code !== 0) throw new Error("commit failed: " + commit.stderr.slice(-2000));
  const head = await git(["rev-parse", "HEAD"]);
  const push = await git(["push", "origin", cfg.branch], 300000);
  if (push.code !== 0) throw new Error("push failed: " + push.stderr.slice(-2000));
  state.lastCommit = head.stdout.trim();
  state.completed++;
  await log("Pushed commit " + state.lastCommit);
}
async function main() {
  if (!cfg.apiKey || !cfg.repoToken) throw new Error("OPENAI_API_KEY and GITHUB_TOKEN are required as runtime secrets.");
  await mkdir(cfg.stateDir, { recursive: true });
  const lock = path.join(cfg.stateDir, "worker.lock");
  if (existsSync(lock)) {
    let owner = null;
    try { owner = JSON.parse(await readFile(lock, "utf8")); } catch {}
    if (owner?.pid) {
      try { process.kill(owner.pid, 0); throw new Error("another worker process appears active (pid " + owner.pid + ")"); }
      catch (error) { if (error.message.startsWith("another worker")) throw error; }
    }
    await rm(lock, { force: true });
  }
  await writeFile(lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), { flag: "wx" });
  process.on("SIGTERM", async () => { await log("Received SIGTERM; exiting."); process.exit(0); });
  process.on("SIGINT", async () => { await log("Received SIGINT; exiting."); process.exit(0); });
  await log("UCENO autonomous worker started; sequential agent, no production privileges.");
  try {
    while (true) {
      const state = await loadState();
      const today = new Date().toISOString().slice(0, 10);
      if (state.day !== today) { state.day = today; state.cycles = 0; }
      if (state.cycles >= cfg.maxCycles) {
        await log("Daily cycle budget reached; sleeping until next UTC day.");
        await sleep(15 * 60 * 1000);
        continue;
      }
      state.cycles++;
      try { await runCycle(state); state.failed = 0; }
      catch (error) { state.failed++; await log("Cycle failed: " + (error?.stack || error)); }
      await saveState(state);
      await sleep(cfg.idleMs);
    }
  } finally { await rm(lock, { force: true }); }
}
main().catch(async error => { await log("Fatal: " + (error?.stack || error)); process.exit(1); });
