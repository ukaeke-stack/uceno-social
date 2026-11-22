import test from "node:test";
import assert from "node:assert/strict";
import { runProcess } from "./process-runner.mjs";

test("timeout kills the whole process group even after its leader exits", async () => {
  const script = [
    "const { spawn } = require('node:child_process');",
    "process.on('SIGTERM', () => process.exit(0));",
    "const child = spawn(process.execPath, ['-e', \"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)\"], { stdio: 'ignore' });",
    "console.log(child.pid);",
    "setInterval(() => {}, 1000);"
  ].join("\n");
  const result = await runProcess(process.execPath, ["-e", script], {
    timeout: 100,
    killGraceMs: 100
  });
  assert.equal(result.timedOut, true);
  assert.equal(result.code, 124);
  const childPid = Number(result.stdout.trim());
  assert.ok(Number.isSafeInteger(childPid) && childPid > 0);
  let alive = true;
  for (let attempt = 0; attempt < 20 && alive; attempt++) {
    try { process.kill(childPid, 0); }
    catch (error) { if (error.code === "ESRCH") alive = false; else throw error; }
    if (alive) await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.equal(alive, false, "SIGKILL must terminate descendants that ignore SIGTERM");
});

test("successful process returns its exit code and captured output", async () => {
  const result = await runProcess(process.execPath, ["-e", "process.stdout.write('ok'); process.stderr.write('warn')"]);
  assert.deepEqual(result, { code: 0, stdout: "ok", stderr: "warn", timedOut: false });
});
