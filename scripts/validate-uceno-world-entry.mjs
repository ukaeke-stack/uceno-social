import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [catalogRaw, migration38, migration39, destinations, lastLocation, entryRoute, entryPage, homePage,
  stateRoute, sessionClient, gatewayClient, sidebar, builder, homeClient, eventsClient] = await Promise.all([
  read("../runtime/world-gateway/config/world-cities.json"),
  read("../db/migrations/038_virtual_world_last_location.sql"),
  read("../db/migrations/039_virtual_world_entry_context.sql"),
  read("../app/api/worlds/destinations/route.ts"),
  read("../app/api/worlds/last-location/route.ts"),
  read("../app/api/worlds/entry/route.ts"),
  read("../app/world-entry/page.tsx"),
  read("../app/page.tsx"),
  read("../app/api/worlds/[worldId]/state/route.ts"),
  read("../unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldSessionClient.cs"),
  read("../unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldGatewayClient.cs"),
  read("../unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldSidebarMenu.cs"),
  read("../unity/UCENOVirtualWorld/Assets/UCENO/Editor/FreeAssetWorldSceneBuilder.cs"),
  read("../unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldHomeClient.cs"),
  read("../unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldEventsClient.cs")
]);
const catalog = JSON.parse(catalogRaw);
assert.equal(catalog.cities.length, 10, "gateway catalogue must contain the ten authored cities");
assert.equal(new Set(catalog.cities.map(c => c.id)).size, 10, "city IDs must be unique");
assert.match(migration38, /virtual_world_last_locations/);
assert.match(migration39, /entry_kind/);
assert.match(destinations, /visibility = 'public'/);
assert.match(destinations, /user_blocks/);
assert.match(destinations, /heartbeat_at > NOW\(\) - INTERVAL '30 seconds'/);
assert.match(lastLocation, /A fresh authoritative player checkpoint is required/);
assert.match(lastLocation, /locationKind === "home"/);
assert.match(lastLocation, /locationKind === "event"/);
assert.match(entryRoute, /entry_target_id/);
assert.match(entryPage, /Explore the cities/);
assert.match(entryPage, /entryKind/);
assert.match(entryPage, /Prepare entry/);
assert.match(homePage, /Virtual World/);
assert.ok(homePage.includes("/world-entry"), "social homepage must link to the world-entry gateway");
assert.match(entryRoute, /entry_kind: identity.entryKind/);
assert.match(entryRoute, /Event admission requires an active RSVP/);
assert.match(stateRoute, /INSERT INTO virtual_world_last_locations/);
for (const group of ["WORLD NAVIGATION", "SOCIAL", "ACTIVITIES & ECONOMY", "ACCOUNT & SUPPORT"])
  assert.ok(sidebar.includes(group), `sidebar is missing group: ${group}`);
assert.match(sidebar, /BeginScrollView|GUILayout\.BeginScrollView/);
assert.ok(sidebar.includes("MakeRoundedTexture"), "sidebar must render a translucent rounded glass panel");
assert.ok(sidebar.includes("i += 3"), "sidebar must retain the three-column mobile icon grid");
assert.ok(sidebar.includes("iconDiscTexture"), "sidebar items must use colored circular icon discs");
assert.match(sidebar, /KeyCode\.Escape/);
assert.match(sidebar, /\/world-entry/);
assert.match(builder, /AddComponent<WorldSidebarMenu>/);
assert.match(homeClient, /public void OpenMenu\(\)/);
assert.match(eventsClient, /public void OpenMenu\(\)/);
assert.match(sessionClient, /EntryTargetId/);
assert.match(gatewayClient, /RequestHomeEntry\(session.EntryTargetId\)/);
assert.match(gatewayClient, /RequestEventJoin\(session.EntryTargetId\)/);
console.log("UCENO World Entry Gateway source contract passed.");
