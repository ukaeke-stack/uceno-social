import test from "node:test";
import assert from "node:assert/strict";
import { codexEnvironment, parseLinuxProcessStartTicks, reserveDailyCycle } from "./worker-policy.mjs";

test("process start-time parser handles spaces and parentheses in Linux process names", () => {
  const fields = Array.from({ length: 20 }, (_, index) => String(index + 3));
  fields[19] = "987654";
  assert.equal(parseLinuxProcessStartTicks("123 (worker (codex) child) " + fields.join(" ")), "987654");
  assert.equal(parseLinuxProcessStartTicks("not-a-proc-stat"), null);
  assert.equal(parseLinuxProcessStartTicks(null), null);
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

test("Codex receives an explicit environment allowlist, not inherited process secrets", () => {
  assert.deepEqual(codexEnvironment("/usr/bin", "api-secret-placeholder"), {
    PATH: "/usr/bin", HOME: "/tmp/home", TMPDIR: "/tmp", OPENAI_API_KEY: "api-secret-placeholder"
  });
});
