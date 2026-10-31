# UCENO Virtual World — prototype test plan

This checklist is for the first offline movement prototype. Passing it does not validate multiplayer, production integration, store readiness or release performance.

## Editor setup

- [ ] Open the scaffold inside a Unity 6 LTS 3D Core project.
- [ ] Set Player > Other Settings > Configuration > Active Input Handling to Both or Input Manager (Old), then restart the Editor if requested.
- [ ] Confirm the Console has no compile errors.
- [ ] Run UCENO Virtual World > Create Starter Scene.
- [ ] Confirm the generated scene is included in Build Settings.

## Desktop checks

- [ ] Press Play and confirm ground, player capsule, directional light and third-person camera appear.
- [ ] WASD and arrow keys move the player across the ground.
- [ ] Mouse movement rotates the player/camera view without abrupt camera flips.
- [ ] Releasing movement keys stops horizontal movement.
- [ ] Player remains grounded and does not fall through the plane.
- [ ] Camera follows smoothly while the player turns and moves.

## Android device checks

- [ ] Build and install a Development Build on a physical Android device.
- [ ] Drag on the left half of the screen; player moves relative to facing direction.
- [ ] Drag on the right half; view rotates without moving the player.
- [ ] Use both touch zones simultaneously; movement and camera look both respond.
- [ ] Releasing either finger stops only that input.
- [ ] Check frame rate, heat and battery use during a 10-minute test.
- [ ] Repeat after backgrounding and restoring the app.

## Defects to record

For each failure, record device model, Android version, Unity Editor version, reproduction steps, expected result, actual result and a screenshot/video where possible.

## Not covered by this test plan

- Multiplayer or authoritative server validation
- Login, world-entry token exchange or account moderation checks
- Persistent world state, inventory, credits, purchases or advertising
- Avatar customization, animations, voice, chat or user-created content
- Web build, VR build, release signing, store submission or production deployment
