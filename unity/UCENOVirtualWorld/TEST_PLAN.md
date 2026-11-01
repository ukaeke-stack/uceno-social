# UCENO Virtual World — realistic city scene test plan

This checklist covers the Unity city client, world gateway interactions and the connected home APIs. Passing source checks does not validate Unity compilation, production integration, two-device behavior, store readiness or release performance.

## Editor import and scene generation

- [ ] Open the project in Unity 6000.3.27f1 (Unity 6.3 LTS). If Unity Build Automation does not list that exact patch, select 6000.3 stable, not 6000.3 beta.
- [ ] Set Player > Other Settings > Configuration > Active Input Handling to Both or Input Manager (Old), then restart the Editor if requested.
- [ ] Confirm the Console has no C# compilation errors.
- [ ] Confirm the imported avatar FBX is configured as a Unity Humanoid and has Idle, Walk and Run clips.
- [ ] Confirm the imported Poly Haven models, PBR textures and city HDRI appear in the Project window.
- [ ] Run UCENO Virtual World > Build Realistic City Scene.
- [ ] Confirm the scene is saved as Assets/UCENO/Scenes/UCENO_Starter_World.unity and is included in Build Settings.
- [ ] Confirm the scene builder reports missing assets rather than silently generating primitive substitutes.

## Visual scene checks

- [ ] Confirm the apartment and factory facades render with their imported materials and detailed geometry.
- [ ] Confirm the road uses the asphalt PBR maps, sidewalks use concrete PBR maps, and planted verges use the grass texture.
- [ ] Confirm the city HDRI appears as the sky/background; no pink or magenta shader-error surfaces are visible.
- [ ] Confirm the Pachira plant, shrubs, street lamps, covered car and chainlink fence are present and correctly placed.
- [ ] Confirm the player is a properly proportioned human character with face, clothing, hair, hands and feet; no cube/sphere placeholder parts remain.
- [ ] Confirm the directional light, shadows, fog and skybox produce a natural-looking city environment.
- [ ] Confirm the on-screen position and movement status panel is visible and readable.

## Desktop movement and animation checks

- [ ] WASD and arrow keys move the player across the road and walkways.
- [ ] Mouse movement rotates the view horizontally and vertically without abrupt camera flips.
- [ ] Holding Shift increases movement speed and switches the avatar to the run animation.
- [ ] Releasing movement returns the avatar to idle; normal movement plays the walk animation.
- [ ] Avatar feet remain aligned with the ground; there is no visible floating, sinking or root-motion drift.
- [ ] Player collides with building facades, the car, fence and other intended solid objects.
- [ ] Player can walk on the road, sidewalks and grass verges without falling through them.
- [ ] Run the scene builder and confirm it exports `runtime/world-gateway/data/uceno-city-collision-boxes.json`.
- [ ] Inspect the exported JSON: it contains actual scene collider bounds, no player collider, no trigger colliders, and no more than 500 boxes.
- [ ] Configure the deployed gateway's `WORLD_COLLISION_BOXES_FILE` to the exported file and confirm the gateway starts without collision-map validation errors.
- [ ] With two clients connected to the same instance, verify server snapshots stop both players at building/car/fence bounds and still allow travel over roads and walkways.
- [ ] Camera follows smoothly while the player moves, turns, walks and runs.
- [ ] Fall recovery returns the player to the spawn point if a collision failure sends them below the world.

## Seated/rest interaction checks

- [ ] Press C on desktop or tap SIT on Android; the avatar enters the seated/rest pose.
- [ ] While seated, movement and sprint are disabled and the avatar remains in place.
- [ ] Tap STAND or press C again; normal movement resumes without a stuck sprint or jump request.
- [ ] Confirm the seated pose is visually acceptable on the imported humanoid. This is a ground-rest pose, not chair-specific sitting or IK.

## Authoritative world-object interaction checks

- [ ] Add `WorldInteractable` to a real imported door mesh/pivot and assign a stable unique ID and the actual hinge transform.
- [ ] Add `WorldInteractable` to a real usable object and assign a stable unique ID.
- [ ] Rebuild the city and confirm both objects appear in the exported `interactables` array with correct world positions.
- [ ] Configure the gateway to read the exported geometry map and restart it.
- [ ] Aim at the door and press E (or tap INTERACT); confirm the server accepts the in-range request and all connected clients receive the same open/closed state.
- [ ] After changing a door or usable-object state, connect a third/late client; confirm its first authoritative object-state packets immediately render the current state without requiring another interaction.
- [ ] Disconnect and reconnect a client while a door remains open; confirm it receives the persisted/current state on reconnect.
- [ ] Connect a late client while a seat is occupied; confirm the seat displays the current occupant and rejects a second claim.
- [ ] Move beyond 4.25 world units and confirm the gateway rejects the interaction.
- [ ] Confirm unknown object IDs and mismatched action types are rejected.
- [ ] Confirm the dedicated door hinge moves while the building root and surrounding geometry remain fixed.
- [ ] Confirm the generic object state is synchronized to all clients; restart persistence works only when `WORLD_OBJECT_STATE_FILE` points to writable durable storage.
- [ ] Use the Unity Editor authoring menu to mark an actual imported door hinge, chair/seat point and usable prop; confirm unique IDs and correct kinds are exported.
- [ ] Export the active scene from the UCENO World menu and confirm the gateway deployment receives the exact generated JSON.
- [ ] Mark an actual imported chair as a `seat` interactable with a unique ID and a seat position; confirm it appears in the exported JSON.
- [ ] Place the seat marker at the avatar root/feet position and rotate it toward the intended sitting direction.
- [ ] Confirm the gateway moves and rotates the player to the exported seat anchor after a successful sit.
- [ ] With two clients, first player sits and receives the seated pose only after server confirmation; second player sees the chair occupied and cannot claim it.
- [ ] First player stands; verify the seat becomes available and another player can sit.
- [ ] Disconnect a seated player; verify the gateway releases the seat and broadcasts availability.
- [ ] Send a movement input with a forged `seated=true` flag while not owning a seat; verify the gateway does not freeze the player as seated.
- [ ] Drop the seated player's WebSocket and reconnect; verify the client clears the old seated pose and can move normally.
- [ ] Verify the root/facing anchor aligns the avatar with the chair; full foot/hand IK is not implemented.


## World events client checks

- [ ] Enter a published world and open EVENTS on Android or press N on desktop.
- [ ] Confirm only scheduled, future events for the current world are listed.
- [ ] RSVP going; confirm the server count and personal RSVP state refresh.
- [ ] RSVP interested; confirm the state persists after closing and reopening the panel.
- [ ] Cancel RSVP; confirm the personal attendance is cleared and the going count adjusts.
- [ ] Try RSVP against a full event; confirm the server rejects it and the UI reports failure.
- [ ] Verify banned/suspended users and users without private-world access cannot RSVP.
- [ ] Do not treat RSVP as a spatial join; event location/teleport and activity scene integration are not implemented yet.

## Home sharing API checks

- [ ] Unauthenticated requests to home and home-member APIs return 401.
- [ ] Home listing only returns homes owned by the signed-in user or explicitly shared with that user.
- [ ] Home creation rejects invalid world IDs, templates, oversized transforms, oversized furnishing arrays and more than 100 furnishing entries.
- [ ] Home create/update reject non-finite or out-of-range coordinates, invalid asset IDs, invalid yaw/scale values, malformed furniture records and more than 100 items.
- [ ] Home layout updates are accepted only from the owner, a co-owner or a decorator; visitors cannot modify the layout.
- [ ] Only the home owner can grant, list or revoke home members.
- [ ] The owner-only member roster returns only user IDs, permission and invitation timestamp; it does not expose account email, phone or profile details.
- [ ] A user blocked by the home owner or blocking the owner cannot be invited or access the shared home.
- [ ] A banned or suspended world member cannot be invited into a home.
- [ ] A home owner whose world membership is banned or suspended cannot grant new home invitations.
- [ ] Revoking a home member removes their shared-home access on the next request.
- [ ] Verify these checks against a test database after required migrations are deployed; static source checks are not database integration tests.

## Unity home manager and layout checks

- [ ] Enter a world and press M; the home manager opens and loads only homes accessible to the signed-in account.
- [ ] On Android, tap the HOMES button; verify the home manager can be opened and closed without a hardware keyboard.
- [ ] Create a home; confirm the server returns a home ID and it appears in the refreshed home list.
- [ ] Open an owned home; confirm the permission label is owner and the saved furnishing layout loads.
- [ ] Open an invited home as visitor; confirm furniture is visible but layout editing and save controls are unavailable.
- [ ] Open an invited home as decorator or co-owner; confirm catalog furniture placement is enabled and the server accepts a layout save.
- [ ] As owner, switch visibility between private and invite and save; confirm the server persists the change.
- [ ] Confirm a decorator/co-owner cannot change home visibility by sending a modified API request.
- [ ] As owner of an invite-visible home, grant visitor/decorator/co-owner access using a valid account UUID; verify the roster updates.
- [ ] Revoke an invitee; verify the roster updates and that account receives 404 on the next home load.
- [ ] Confirm the imported sofa, armchair, round table, bed and cabinet appear in the Unity home furniture catalogue; place each, save, reload and verify scale/rotation/position.
- [ ] Select placed furniture, rotate it in 15-degree increments, remove it, save and reload to confirm all edits persist.
- [ ] Confirm each residential furniture FBX has its CC0 Poly Haven asset manifest and local texture dependencies in the imported asset folder.
- [ ] Add a real residential interior shell/prefab and configure its entrance/exit before claiming complete home visiting; the current apartment asset is an exterior facade, not a furnished interior.
- [ ] Test placement on Android touch controls and confirm placed furniture cannot be moved outside the intended home boundary.

## Home access and invitation checks

- [ ] An unauthenticated home retrieval request returns 401.
- [ ] The owner can retrieve their home and receives the owner permission.
- [ ] An invited visitor, decorator or co-owner can retrieve an invite-only home with only their granted permission.
- [ ] A non-member cannot retrieve an invite-only home; the endpoint returns 404 without exposing its existence.
- [ ] A revoked invitee loses access on the next request.
- [ ] A decorator or co-owner whose world membership is banned or suspended cannot save a home layout after access is revoked.
- [ ] A shared-home layout cannot be changed after its world is unpublished or the home is no longer invite-visible.
- [ ] A blocked relationship, unpublished world, banned or suspended member, or inaccessible private world prevents home retrieval.
- [ ] Private home layouts and furnishing data are never returned to unrelated users.
- [ ] Run these checks against a deployed test database; source checks alone do not prove SQL behavior.

## Android device checks

Do not start an Android build until the Editor import and scene checks above pass.

- [ ] Build and install a Development Build on a physical Android device.
- [ ] Drag on the left half of the screen; the player moves relative to facing direction and the coordinate display changes.
- [ ] Drag on the right half horizontally and vertically; view rotates both ways.
- [ ] Start one finger in each half and move both simultaneously; movement and camera look both respond.
- [ ] Hold the RUN control; the player accelerates and the run animation plays. Releasing it returns to walking.
- [ ] Release the movement finger while continuing to move the look finger; only movement stops.
- [ ] Release the look finger while continuing to move the movement finger; only camera look stops.
- [ ] Cancel a touch (for example, by app interruption) and confirm the control does not remain stuck.
- [ ] Confirm a new touch can take over after the previous finger is released.
- [ ] Check frame rate, heat and battery use during a 10-minute test in the full city scene.
- [ ] Repeat after backgrounding and restoring the app.

## Defects to record

For each failure, record device model, Android version, Unity Editor version,
reproduction steps, expected result, actual result and a screenshot/video where
possible.

## Not covered by this test plan

- Multiplayer or authoritative server validation.
- Login, world-entry token exchange or account moderation checks.
- Persistent world state, inventory, credits, purchases or advertising.
- Avatar customization, voice, chat or user-created content.
- Web build, VR build, release signing, store submission or production deployment.
