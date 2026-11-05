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


## Playable dance event checks

- [ ] Create a future event with activity type dance and a venue at the host's current position.
- [ ] RSVP GOING and join the venue during the 30-minute admission window.
- [ ] Tap DANCE; confirm the local humanoid performs the procedural dance animation.
- [ ] Join the same event from a second client; confirm the second avatar receives the dance gesture through server snapshots and displays the same animation.
- [ ] Confirm a client cannot forge an unsupported gesture string or a gesture sequence older than its last accepted sequence.
- [ ] Confirm the dance action is not offered outside a joined dance event.
- [ ] Test repeated dance actions, gesture expiry and movement while dancing on Android after the Editor gate passes.

## World events client checks

- [ ] Enter a published world and open EVENTS on Android or press N on desktop.
- [ ] Confirm only scheduled, future events for the current world are listed.
- [ ] As world owner or active admin, create an event with a future UTC start/end; verify it appears in the event list.
- [ ] As a normal member, verify the host form is hidden and direct event creation is rejected with 403.
- [ ] RSVP going; confirm the server count and personal RSVP state refresh.
- [ ] RSVP interested; confirm the state persists after closing and reopening the panel.
- [ ] Cancel RSVP; confirm the personal attendance is cleared and the going count adjusts.
- [ ] Try RSVP against a full event; confirm the server rejects it and the UI reports failure.
- [ ] Verify banned/suspended users and users without private-world access cannot RSVP.
- [ ] Verify blocked users cannot create events or RSVP, even when they call the APIs directly.
- [ ] Do not treat RSVP as a spatial join; event location/teleport and activity scene integration are not implemented yet.

## Residential interior and server-authoritative home travel checks

- [ ] Apply migration 025 only after the previously reviewed migrations are applied and the UCENO database is confirmed to be the separate UCENO Neon project.
- [ ] Create a new home and confirm its saved layout includes the five imported starter furniture assets.
- [ ] Attempt to create a home with a forged client transform; confirm the saved anchor is taken from a fresh server checkpoint and not from the submitted transform.
- [ ] Attempt creation without a recent gateway checkpoint; confirm the API rejects the request rather than trusting a stale client position.
- [ ] Open the home as owner; confirm the runtime room shell, imported furniture, windows, entry door and lighting are visible.
- [ ] Open the same invite-only home as a visitor; confirm the same room and furniture render while layout controls remain unavailable.
- [ ] Attempt home entry with a forged home ID, a home in another world, a revoked invitation, a blocked owner relationship, banned/suspended membership and a private world without active membership; confirm the gateway rejects every request.
- [ ] Confirm the gateway, not the client, changes the player's position after admission.
- [ ] Walk and jump around the interior; confirm the server clamps movement to the room bounds and prevents walking through walls or ceiling.
- [ ] Exit the home; confirm the server returns the player to the exact saved pre-entry position and facing.
- [ ] Disconnect while inside a home; confirm the gateway checkpoints the return position rather than leaving the next session stranded inside an unloaded room.
- [ ] Reconnect the client and verify that a revoked invite no longer permits entry.
- [ ] Verify these cases against a deployed test database and live gateway; source checks do not prove SQL or runtime behavior.

## Spatial event and venue checks

- [ ] Apply migration 025 and confirm activity_type, location_label and location exist with their constraints.
- [ ] As a world owner/admin, create an event at the current player location and verify its venue coordinates and label persist.
- [ ] Verify invalid activity types, oversized coordinates, invalid Y positions and oversized venue labels are rejected.
- [ ] RSVP GOING and attempt to join more than 30 minutes before the event; confirm the gateway rejects early admission.
- [ ] Within the 30-minute admission window, join as a GOING attendee; confirm the gateway moves the player to the persisted venue coordinates.
- [ ] Attempt direct event joining without a GOING RSVP, after cancellation, after event end, in an unpublished world, with blocked access, or from a different world; confirm rejection.
- [ ] Exit the event and confirm the server restores the previous world position and facing.
- [ ] Confirm event location is the same for every client and that venue entry does not falsely mark an activity as playable.
- [ ] Test two clients at the same event venue. Spatial admission alone does not complete sports, racing, adventure, dance, cinema or concert gameplay.

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
- [ ] A home owner who is not the world owner and has lost active membership in a private world cannot load or edit that home.
- [ ] A home owner removed from a private world cannot read the invitation roster through the roster API.
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
- [ ] Select placed furniture, move it in 0.25-metre steps, rotate it in 15-degree increments, remove it, save and reload to confirm all edits persist.
- [ ] Confirm home transform remains stable after the player walks away and saves; furniture persists in local coordinates within the 50-by-50-metre home plot.
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
- [ ] Decorators can save furniture changes but cannot change the home anchor; co-owners and owners can update the anchor.
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


## Account appearance persistence acceptance tests (pending)

1. Review and apply migration 026 to the separate UCENO database after migrations 015–025.
2. Verify unauthenticated GET/PUT returns 401; a user cannot read or write another account's appearance; invalid keys, non-hex colors and oversized/unexpected payloads are rejected.
3. Verify first GET returns an empty appearance without creating a row; PUT creates one account row; repeated PUT updates version and timestamp.
4. Sign in on device A, change each palette field, reconnect and verify the account appearance loads. Sign in to the same account on device B and verify the same appearance loads; sign in as another account and verify no leakage.
5. Test token expiry/reconnect, offline save failure/retry, and switching worlds under the same account.
6. Open Unity 6.3 Editor and confirm compile/import, local avatar material-slot mapping, mobile HUD layout and no per-frame network calls.
7. Keep wardrobe acceptance separate: supply real garment/hair/accessory prefabs, validate Humanoid bone/skin weights and slot replacement, then test equip/unequip replication and account persistence. No wardrobe pass can be claimed from palette tests.


## Modular wardrobe acceptance tests (pending)

### Database and API
1. Apply migration 027 after migration 026 on the separate UCENO database.
2. Verify catalogue rows are disabled by default and the migration inserts no fake/demo inventory.
3. Verify unauthenticated GET/PUT returns 401; GET returns only the authenticated account's enabled owned items.
4. Verify a user cannot equip another user's item, a disabled catalogue item, an item assigned to a different slot, or an unknown item ID; each must fail without changing equipped state.
5. Verify null selection unequips only the requested slot; other equipped slots remain unchanged.
6. Verify inventory deletion cascades to the corresponding equipped row.
7. Verify item identifiers and prefab keys are constrained and no client can submit a user ID.

### Unity asset and rig integration
1. Create a Resources/UCENO/AvatarWardrobeCatalog asset and register only imported, licensed and reviewed prefabs.
2. Each garment prefab must have one or more SkinnedMeshRenderers, non-empty mesh/bone arrays, and bone names matching the imported avatar Humanoid rig.
3. Test a top, outerwear, bottom, shoes, hair and accessory separately; confirm missing prefab, missing bone, non-skinned mesh and invalid catalog entry fail safely without destroying the currently equipped garment.
4. Equip a second item in the same slot; verify the previous garment is removed and there is no duplicate geometry or orphaned renderer.
5. Unequip each slot; verify the base avatar remains intact.
6. Verify garments follow idle, walk, run, jump, sit and gesture animations without clipping or detached joints.
7. Verify the wardrobe UI is usable on Android touch and does not overlap movement/camera controls.

### Account persistence and multiplayer
1. Equip on device A, reconnect, and verify the same account retrieves the equipped item IDs.
2. Sign into the same account on device B and verify the server returns the same selections.
3. Sign into another account and verify no inventory or equipment leakage.
4. Verify unavailable/removed assets do not crash avatar loading and produce a visible recoverable fallback.
5. Add and test authoritative multiplayer snapshot replication for equipped item IDs; verify remote clients reject unknown catalogue IDs and render matching garments.
6. Run Unity Editor compilation, visual review and two physical-device tests. Source checks alone do not count as a pass.


## Proximity voice signaling acceptance tests (pending)

1. Two authenticated users in the same world, same spatial context and within 24 metres opt in; each receives the other's voice-presence event.
2. Users farther than 24 metres cannot exchange offers, answers or ICE candidates.
3. Users in different homes, different events, or one in a home and one in the public world cannot exchange voice signaling.
4. Users with a block in either direction cannot exchange voice signaling.
5. A user who has not opted in cannot send or receive signaling; voice_leave and disconnect revoke presence.
6. Entering/exiting a home or event ends the current voice session; the user must explicitly rejoin in the new context.
7. Invalid signal types, missing/oversized SDP, oversized ICE candidates and signaling floods are rejected/rate-limited.
8. Verify signaling with two Unity clients and an actual WebRTC implementation before attempting audio tests.
9. Add and test microphone permission, audio capture/playback, STUN/TURN connectivity, 3D attenuation, mute/block/report and Android background/foreground behavior. No audio-media acceptance is passed by signaling tests alone.
