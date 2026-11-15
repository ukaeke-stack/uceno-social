# UCENO imported humanoid animation library

This folder is the required home for licensed animation FBX files. Do not use generated bone rotations or a screenshot of a posed avatar as evidence that the humanoid animation library is complete.

## Required imported clips

The Editor release gate searches imported FBX clip names for:

- Idle
- Walk
- Run
- Talk / conversational gestures
- Turn
- Wave
- Cheer
- Dance
- Interact
- Sit

Idle, walk, run and talk must be loopable. Wave, cheer, turn and interaction clips should be authored as one-shot actions. Dance may loop. Sit is used by the seated state and should hold a stable seated pose.

## Import and retarget procedure

1. Add the original FBX files and their licence/source manifest to this folder. Keep the source files; do not commit extracted animation files without their attribution/licence.
2. Select each animation FBX in Unity and open **Rig**.
3. Set **Animation Type** to **Humanoid**.
4. Set **Avatar Definition** to **Copy From Other Avatar** and select the UCENO base humanoid Avatar from `Assets/UCENO/Characters/Imported`.
5. Apply the import settings. Open **Animation** and confirm the clip names, frame ranges, loop settings and root transform settings.
6. Preview each clip on the UCENO base Avatar. Reject foot sliding, twisted wrists, shoulder collapse, hip drift, incorrect facing, and broken hand/head motion.
7. Run **UCENO > Validate Imported Humanoid Animation Library**. The check fails until all required retargeted clips exist.
8. Test the clips on the actual human avatar and at least one AI citizen rig. Review idle, walk, run, talk, turn, wave, cheer, dance, sit/stand and object interaction in motion, not only in a still frame. Local talk state follows actual microphone transmission; remote talk state follows the replicated animation snapshot.

## Acceptance boundary

The validator is a source gate, not proof that assets have been imported or visually accepted. The library is incomplete until the FBXs exist in this folder, Unity imports them as Humanoid clips retargeted to the UCENO base Avatar, the validator passes in the Unity Editor, and the clips pass in-motion visual review on Android performance settings.
