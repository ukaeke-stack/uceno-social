import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../../../unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldGatewayClient.cs", import.meta.url), "utf8");

test("team treasure catalog responses use the Unity packet field in every outcome", () => {
  const responses = [...server.matchAll(/send\(socket, \{ type: "team_treasure_hunt_catalog", ([^}]+)\}\);/g)];
  assert.equal(responses.length, 4, "rate-limited, secret-missing, successful and failed catalog responses must all exist");
  for (const response of responses) {
    assert.match(response[1], /^teamHunts:/, "server catalog payload must populate teamHunts");
    assert.doesNotMatch(response[1], /\bhunts:/, "server must not send the unrelated history field");
  }
});

test("Unity catalog packet deserializes and publishes teamHunts", () => {
  assert.match(client, /GatewayTreasureTeamHunt\[\] teamHunts;/);
  assert.match(client, /TreasureTeamHuntsReceived\?\.Invoke\(packet\.teamHunts \?\? Array\.Empty<GatewayTreasureTeamHunt>\(\)\)/);
});

test("team reward receipts are recoverable from history after reconnect", () => {
  assert.match(server, /FROM virtual_world_treasure_team_reward_allocations AS allocation/);
  assert.match(server, /WHERE allocation\.user_id = \$\{player\.id\}::uuid AND team\.status = 'completed'/);
  assert.match(server, /teamRewards/);
  assert.match(client, /GatewayTreasureTeamRewardReceipt\[\] teamRewards;/);
  assert.match(client, /TreasureTeamRewardHistoryReceived\?\.Invoke\(packet\.teamRewards \?\? Array\.Empty<GatewayTreasureTeamRewardReceipt>\(\)\)/);
});
