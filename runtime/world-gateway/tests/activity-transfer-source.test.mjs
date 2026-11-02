import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");

test("activity transfer consumes its ticket and advances the player fence atomically", () => {
  const transactionStart = source.indexOf("const claimed = isTransfer ? await sql.begin(async tx =>");
  assert.notEqual(transactionStart, -1, "transfer path must use a database transaction");
  const transactionEnd = source.indexOf("}) : await sql", transactionStart);
  assert.ok(transactionEnd > transactionStart, "transfer transaction must close before ordinary session claims");
  const transaction = source.slice(transactionStart, transactionEnd);
  assert.match(transaction, /await tx\x60UPDATE virtual_world_activity_transfer_tickets/);
  assert.match(transaction, /await tx\x60INSERT INTO virtual_world_player_sessions/);
  assert.match(transaction, /if \(!fenced\[0\]\) throw new Error\("transfer_session_claim_failed"\)/);
  assert.doesNotMatch(transaction, /await sql\x60UPDATE virtual_world_activity_transfer_tickets/);
});

test("transfer-ticket cleanup is bounded and does not delete recent audit rows", () => {
  assert.match(source, /transferTicketCleanupInProgress/);
  assert.match(source, /DELETE FROM virtual_world_activity_transfer_tickets[\s\S]*expires_at < NOW\(\) - INTERVAL '1 day'[\s\S]*consumed_at < NOW\(\) - INTERVAL '1 day'/);
  assert.match(source, /\}, 60_000\)/);
});
