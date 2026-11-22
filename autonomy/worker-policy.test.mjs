import test from "node:test";
import assert from "node:assert/strict";
import {
  assertWorkBranch, buildPushRefspec, codexEnvironment, failureBackoffMs,
  gitAuthEnvironment, isLiveWorkerLockOwner, parseLinuxProcessStartTicks, reserveDailyCycle, validateWorkerState
} from "./worker-policy.mjs";

test("process start-time parser handles spaces and parentheses in Linux process names", () => {
  const fields = Array.from({ length: 20 }, (_, index) => String(index + 3));
  fields[19] = "987654";
  assert.equal(parseLinuxProcessStartTicks("123 (worker (codex) child) " + fields.join(" ")), "987654");
  assert.equal(parseLinuxProcessStartTicks("not-a-proc-stat"), null);
  assert.equal(parseLinuxProcessStartTicks(null), null);
});

test("worker lock treats matching process start ticks as a live owner", () => {
  assert.equal(isLiveWorkerLockOwner({ pid: 41, startTicks: "900" }, "900", () => false), true);
});

test("worker lock detects PID reuse from a different process start time", () => {
  assert.equal(isLiveWorkerLockOwner({ pid: 41, startTicks: "900" }, "901", () => true), false);
});

test("worker lock preserves a live process when proc start-time metadata is unavailable", () => {
  assert.equal(isLiveWorkerLockOwner({ pid: 41, startTicks: "900" }, null, () => true), true);
  assert.equal(isLiveWorkerLockOwner({ pid: 41 }, null, () => true), true);
});

test("worker lock is stale when its process no longer exists", () => {
  assert.equal(isLiveWorkerLockOwner({ pid: 41, startTicks: "900" }, null, () => false), false);
  assert.equal(isLiveWorkerLockOwner({ pid: 0, startTicks: "900" }, "900", () => true), false);
});

test("daily reservation rolls over by UTC date and resets only the daily counter", () => {
  const previous = { day: "2026-11-21", cycles: 24, completed: 7, failed: 2, lastCommit: "abc123" };
  const result = reserveDailyCycle(previous, new Date("2026-11-22T00:01:00.000Z"), 24);
  assert.equal(result.allowed, true);
  assert.deepEqual(result.state, {
    day: "2026-11-22", cycles: 1, completed: 7, failed: 2, lastCommit: "abc123"
  });
  assert.equal(previous.cycles, 24, "reservation must not mutate the caller's state");
});

test("daily reservation refuses work at the configured limit without incrementing", () => {
  const result = reserveDailyCycle({ day: "2026-11-22", cycles: 2, completed: 1, failed: 0 }, new Date("2026-11-22T12:00:00Z"), 2);
  assert.equal(result.allowed, false);
  assert.equal(result.state.cycles, 2);
});

test("worker state validation rejects corrupted quota counters instead of resetting them", () => {
  assert.throws(() => validateWorkerState({
    day: "2026-11-22", cycles: -1, completed: 0, failed: 0
  }), /cycles counter is invalid/);
  assert.throws(() => validateWorkerState({
    day: "2026-11-22", cycles: 24, completed: 0, failed: "broken"
  }), /failed counter is invalid/);
  assert.throws(() => validateWorkerState({
    day: "2026-99-99", cycles: 24, completed: 0, failed: 0
  }));
});

test("valid worker state preserves its daily reservation and commit marker", () => {
  const state = validateWorkerState({
    day: "2026-11-22", cycles: 24, completed: 3, failed: 1, lastCommit: "abc123"
  });
  assert.equal(state.cycles, 24);
  assert.equal(state.lastCommit, "abc123");
});

test("Codex receives an explicit environment allowlist, not inherited process secrets", () => {
  assert.deepEqual(codexEnvironment("/usr/bin", "api-secret-placeholder"), {
    PATH: "/usr/bin", HOME: "/tmp/home", TMPDIR: "/tmp", OPENAI_API_KEY: "api-secret-placeholder"
  });
});

test("Git authentication is supplied through environment config without exposing the raw token", () => {
  const token = "github-token-test-value";
  const env = gitAuthEnvironment(token);
  assert.equal(env.GIT_CONFIG_KEY_0, "http.extraheader");
  assert.equal(env.GIT_CONFIG_VALUE_0, "AUTHORIZATION: basic " + Buffer.from("x-access-token:" + token).toString("base64"));
  assert.equal(JSON.stringify(env).includes(token), false);
  assert.deepEqual(gitAuthEnvironment(""), {});
});

test("worker push refspec is pinned to its one configured branch", () => {
  const branch = "infra/uceno-autonomous-development-agent";
  assert.equal(assertWorkBranch(branch, branch), branch);
  assert.equal(buildPushRefspec(branch, branch), "HEAD:refs/heads/" + branch);
  assert.throws(() => assertWorkBranch("main", branch), /outside the configured worker branch/);
  assert.throws(() => buildPushRefspec("feature/untrusted", branch), /outside the configured worker branch/);
  assert.throws(() => assertWorkBranch("infra/../main", branch), /outside the configured worker branch/);
});

test("failed cycles use bounded exponential recovery backoff", () => {
  assert.equal(failureBackoffMs(1, 1000, 8000), 1000);
  assert.equal(failureBackoffMs(2, 1000, 8000), 2000);
  assert.equal(failureBackoffMs(3, 1000, 8000), 4000);
  assert.equal(failureBackoffMs(8, 1000, 8000), 8000);
});
