# UCENO Virtual World — realistic city scene test plan

This checklist validates the first imported-asset city scene and offline player
controller. Passing it does not validate multiplayer, production integration,
store readiness or release performance.

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
- [ ] Move beyond 4.25 world units and confirm the gateway rejects the interaction.
- [ ] Confirm unknown object IDs and mismatched action types are rejected.
- [ ] Confirm the dedicated door hinge moves while the building root and surrounding geometry remain fixed.
- [ ] Confirm the generic object state is synchronized to all clients; restart behavior is currently non-persistent and must not be treated as durable.
- [ ] Use the Unity Editor authoring menu to mark an actual imported door hinge, chair/seat point and usable prop; confirm unique IDs and correct kinds are exported.
- [ ] Export the active scene from the UCENO World menu and confirm the gateway deployment receives the exact generated JSON.
- [ ] Mark an actual imported chair as a `seat` interactable with a unique ID and a seat position; confirm it appears in the exported JSON.
- [ ] With two clients, first player sits and receives the seated pose only after server confirmation; second player sees the chair occupied and cannot claim it.
- [ ] First player stands; verify the seat becomes available and another player can sit.
- [ ] Disconnect a seated player; verify the gateway releases the seat and broadcasts availability.
- [ ] Verify chair-specific avatar alignment/IK is not assumed: the current implementation only synchronizes the generic seated animation state.

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
