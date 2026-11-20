import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";

test("database migration sequence numbers are unique across the repository", () => {
  const files = readdirSync(new URL("../../../db/migrations/", import.meta.url))
    .filter(file => /^\\d{3}_.+\\.sql$/.test(file));
  const bySequence = new Map();
  for (const file of files) {
    const sequence = file.slice(0, 3);
    const group = bySequence.get(sequence) ?? [];
    group.push(file);
    bySequence.set(sequence, group);
  }
  const duplicates = [...bySequence.entries()].filter(([, group]) => group.length > 1);
  assert.deepEqual(duplicates, [], "duplicate migration prefixes make deployment order ambiguous");
});
