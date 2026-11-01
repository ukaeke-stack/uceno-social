const fs = require("node:fs");

function read(path) {
  return fs.readFileSync(path, "utf8");
}
function requireMarkers(path, markers) {
  const source = read(path);
  for (const marker of markers) {
    if (!source.includes(marker)) {
      throw new Error(`Missing spatial-world contract in ${path}: ${marker}`);
    }
  }
}

requireMarkers("db/migrations/025_virtual_world_event_locations.sql", [
  "activity_type", "location_label", "location JSONB", "virtual_world_events_activity_type_check"
]);
requireMarkers("app/api/world-homes/route.ts", [
  "virtual_world_player_state", "fresh authoritative world position",
  "playerState.position", "playerState.rotation"
]);
requireMarkers("app/api/world-events/route.ts", [
  "ACTIVITY_TYPES", "validSpatialLocation", "activity_type AS \"activityType\"",
  "location_label AS \"locationLabel\"", "JSON.stringify(location)"
]);
requireMarkers("runtime/world-gateway/src/server.ts", [
  'msg.type === "home_enter"', 'msg.type === "home_exit"',
  'msg.type === "event_join"', 'msg.type === "event_exit"',
  "virtual_home_members", "home.visibility === \"invite\"",
  "attendance_status = 'going'", "starts <= now + 30 * 60 * 1000",
  "homeAnchor", "returnState", "spatial_location_entered",
  "spatial_location_exited", "spatial_location_rejected",
  "boundedX", "boundedZ"
]);
requireMarkers("unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldGatewayClient.cs", [
  "RequestHomeEntry", "RequestHomeExit", "RequestEventJoin", "RequestEventExit",
  "SpatialLocationEntered", "SpatialLocationRejected"
]);
requireMarkers("unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldHomeClient.cs", [
  "CreateStarterFurnishing", "WorldHomeInteriorBuilder.Create",
  "gateway.RequestHomeEntry(homeId)", "gateway.RequestHomeExit()",
  "HandleSpatialLocationEntered"
]);
requireMarkers("unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldHomeInteriorBuilder.cs", [
  "Timber Floor", "Back Wall", "Left Window", "Right Window",
  "Entry Door", "Warm Ceiling Light"
]);
requireMarkers("unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldEventsClient.cs", [
  "USE MY CURRENT LOCATION", "RequestEventJoin(item.id)",
  "RequestEventExit()", "locationLabel", "activityType", "gateway.TriggerDance()", '"DANCE"'
]);
requireMarkers("unity/UCENOVirtualWorld/Assets/UCENO/Scripts/AvatarLocomotionDriver.cs", [
  "TriggerDance()", 'nextGesture == "dance"', "activeGesture == 3"
]);
requireMarkers("unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldGatewayClient.cs", [
  "TriggerDance()", "localAvatar.TriggerDance()"
]);
requireMarkers("runtime/world-gateway/src/server.ts", [
  '"dance"'
]);

console.log("UCENO spatial homes and event admission source-contract checks passed.");
console.log("These checks do not replace database integration tests, Unity Editor compilation, or device testing.");
