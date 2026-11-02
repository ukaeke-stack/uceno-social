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
  assert.match(source, /if \(!claimed \|\| !claimed\[0\]\)/);
  assert.doesNotMatch(transaction, /await sql\x60UPDATE virtual_world_activity_transfer_tickets/);
});

test("active competition transfer is limited to an already-joined participant", () => {
  const issueStart = source.indexOf('const target = await sql', source.indexOf('/activity/transfer-ticket'));
  const issueEnd = source.indexOf('res.writeHead(200, headers)', issueStart);
  const issue = source.slice(issueStart, issueEnd);
  assert.match(issue, /activity\.phase IN \('lobby', 'active'\)/);
  assert.match(issue, /persisted\?\.session\.participants\.get\(identity\.userId\)/);
  assert.match(issue, /target\[0\]\.phase === "active" && \(!participant \|\| participant\.status !== "joined"\)/);
  assert.match(issue, /host_generation/);
  assert.match(issue, /transfer_host_generation/);
  const consumeStart = source.indexOf("const consumed = await tx");
  const consumeEnd = source.indexOf("RETURNING ticket.id", consumeStart);
  const consume = source.slice(consumeStart, consumeEnd);
  assert.match(consume, /ticket\.host_generation = \$\{Number\(payload\.transfer_host_generation\)\}/);
  assert.match(consume, /activity\.host_generation = ticket\.host_generation/);
  assert.match(consume, /participant->>'status' = 'joined'/);
});

test("transfer-ticket cleanup is bounded and does not delete recent audit rows", () => {
  assert.match(source, /transferTicketCleanupInProgress/);
  assert.match(source, /DELETE FROM virtual_world_activity_transfer_tickets[\s\S]*expires_at < NOW\(\) - INTERVAL '1 day'[\s\S]*consumed_at < NOW\(\) - INTERVAL '1 day'/);
  assert.match(source, /\}, 60_000\)/);
});


test("stale activity host takeover preserves an active participant checkpoint and increments fencing", () => {
  const start = source.indexOf("async function tryTakeoverStaleActivity");
  const end = source.indexOf("function findAccessibleActivity", start);
  const takeover = source.slice(start, end);
  assert.match(takeover, /activity\.phase IN \('lobby', 'active'\)/);
  assert.match(takeover, /(?:activity\.)?host_generation = activity\.host_generation \+ 1/);
  assert.match(takeover, /version = activity\.version \+ 1/);
  assert.match(takeover, /previous_instance\.heartbeat_at < NOW\(\) - INTERVAL '30 seconds'/);
  assert.match(takeover, /participant->>'userId' = \$\{player\.id\}/);
  assert.match(takeover, /participant->>'status' = 'joined'/);
  assert.match(takeover, /restoreActivitySession\(rows\[0\]\.state\)/);
  assert.match(takeover, /activityHostGenerations\.set\(sessionId, restored\.hostGeneration\)/);
});


test("stale activity host loses local authority before any state broadcast", () => {
  const persistStart = source.indexOf("async function persistActivity");
  const persistEnd = source.indexOf("async function broadcastActivity", persistStart);
  const persist = source.slice(persistStart, persistEnd);
  assert.match(persist, /if \(savedRows\.length === 0\)/);
  assert.match(persist, /SELECT instance_id AS "instanceId"[\s\S]*host_generation AS "hostGeneration"/);
  assert.match(persist, /Number\(row\.hostGeneration\) === hostGeneration/);
  assert.match(persist, /fencedActivitySessions\.add\(session\.id\)/);
  assert.match(persist, /activitySessions\.delete\(session\.id\)/);
  assert.match(persist, /activityHosts\.delete\(session\.id\)/);
  assert.match(persist, /type: "activity_host_fenced"/);
  const broadcastStart = source.indexOf("async function broadcastActivity");
  const broadcastEnd = source.indexOf("async function restorePersistedActivities", broadcastStart);
  const broadcast = source.slice(broadcastStart, broadcastEnd);
  assert.match(broadcast, /if \(!await persistActivity\(session\)\) return/);
  const lookupStart = source.indexOf("function findAccessibleActivity");
  const lookupEnd = source.indexOf("function leaveVoiceRoom", lookupStart);
  assert.match(source.slice(lookupStart, lookupEnd), /fencedActivitySessions\.has\(sessionId\)/);
});
