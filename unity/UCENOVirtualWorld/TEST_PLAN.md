# UCENO Virtual World — prototype test plan

This checklist covers the first offline movement prototype only. Passing it does not validate multiplayer, production integration, store readiness or release performance.

## Editor setup

- [ ] Open the scaffold inside a Unity 6 LTS 3D Core project.
- [ ] Set Player > Other Settings > Configuration > Active Input Handling to Both or Input Manager (Old), then restart the Editor if requested.
- [ ] Confirm the Console has no compile errors.
- [ ] Run UCENO Virtual World > Create Starter Scene.
- [ ] Confirm the generated scene is included in Build Settings.

## Desktop checks

- [ ] Press Play and confirm ground, player capsule, directional light and third-person camera appear.
- [ ] WASD and arrow keys move the player across the ground.
- [ ] Mouse movement rotates the view horizontally and vertically without abrupt camera flips.
- [ ] Releasing movement keys stops horizontal movement.
- [ ] Player remains grounded and does not fall through the plane.
- [ ] Camera follows smoothly while the player turns and moves.

## Android device checks

- [ ] Build and install a Development Build on a physical Android device.
- [ ] Drag on the left half of the screen; player moves relative to facing direction.
- [ ] Drag on the right half horizontally and vertically; view rotates both ways.
- [ ] Start one finger in each half and move both simultaneously; movement and camera look both respond.
- [ ] Release the movement finger while continuing to move the look finger; only movement stops.
- [ ] Release the look finger while continuing to move the movement finger; only camera look stops.
- [ ] Cancel a touch (for example, by app interruption) and confirm the control does not remain stuck.
- [ ] Confirm a new touch can take over after the previous finger is released.
- [ ] Check frame rate, heat and battery use during a 10-minute test.
- [ ] Repeat after backgrounding and restoring the app.

## Defects to record

For each failure, record device model, Android version, Unity Editor version, reproduction steps, expected result, actual result and a screenshot/video where possible.

## Not covered by this test plan

- Multiplayer or authoritative server validation.
- Login, world-entry token exchange or account moderation checks.
- Persistent world state, inventory, credits, purchases or advertising.
- Avatar customization, animations, voice, chat or user-created content.
- Web build, VR build, release signing, store submission or production deployment.
