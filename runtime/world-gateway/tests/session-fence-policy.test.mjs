import test from "node:test";
import assert from "node:assert/strict";
import { checkpointVersionForSession } from "../dist/session-fence-policy.js";

test("resumes a checkpoint sequence only within the same fenced session", () => {
  assert.equal(checkpointVersionForSession(7, 12, 7), 12);
  assert.equal(checkpointVersionForSession("7", "12", 7), 12);
  assert.equal(checkpointVersionForSession(6, 900, 7), 0);
  assert.equal(checkpointVersionForSession(null, 12, 7), 0);
});
test("rejects malformed or unsafe generation and checkpoint versions", () => {
  assert.equal(checkpointVersionForSession("7x", 12, 7), 0);
  assert.equal(checkpointVersionForSession(7, -1, 7), 0);
  assert.equal(checkpointVersionForSession(7, Number.MAX_SAFE_INTEGER + 1, 7), 0);
  assert.equal(checkpointVersionForSession(0, 12, 0), 0);
});
