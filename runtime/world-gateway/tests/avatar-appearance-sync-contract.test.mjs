import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const client = readFileSync(resolve(root, "unity/UCENOVirtualWorld/Assets/UCENO/Scripts/AvatarAppearanceSyncClient.cs"), "utf8");

test("appearance saves retain pending palette after transient network or service failures", () => {
  assert.match(client, /private float nextSaveAttempt;/);
  assert.match(client, /loaded && pendingSave && !saving/);
  assert.match(client, /status == 0 \|\| status == 408 \|\| status == 429 \|\| status >= 500/);
  assert.match(client, /pendingSave = true;[\s\S]*?nextSaveAttempt = Time\.unscaledTime \+ 10f;[\s\S]*?break;/);
});

test("permanent appearance save failures do not retry forever", () => {
  assert.match(client, /pendingSave = false;[\s\S]*?Authentication or validation failures are not retried indefinitely/);
});
