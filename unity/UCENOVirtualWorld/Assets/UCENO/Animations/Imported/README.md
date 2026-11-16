# UCENO imported humanoid animation library

This folder is the required home for licensed animation FBX files. Do not use generated bone rotations, static portraits or image-to-video clips as substitutes for skeletal animation.

## Required imported motion

The Unity Editor release gate searches actual imported AnimationClip sub-assets in both the generated UCENO base-avatar FBX and any additional retargeted FBXs in this folder. Genuine embedded base-avatar locomotion clips count as source motion; they do not satisfy missing talk, turn, wave, cheer, dance, interact or sit clips unless those clips actually exist and pass the same motion-curve checks. Additional animation FBXs require an exact HTTPS provenance record for every imported file.

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

Idle, walk, run, talk and dance must be loopable. Wave, cheer, turn and interaction clips are one-shot actions. Sit must hold a stable seated pose. Every clip must contain real Humanoid motion curves and have a playable duration.

## Import and retarget procedure

1. Add the original licensed FBX files under this folder. Preserve source files and licence documents.
2. Create `animation-source-manifest.json` in this folder. It must contain one provenance record for every imported FBX. Use the exact Unity asset path in `sourceFbx`, plus `sourceName`, `sourceUrl`, `license` and `attribution`.
3. Select each animation FBX in Unity and open **Rig > Animation Type** in the Model Import Settings.
4. Set **Animation Type** to **Humanoid**.
5. Set **Avatar Definition** to **Copy From Other Avatar** and select `Assets/UCENO/Characters/Imported/UCENO_Default_Avatar.fbx`'s Humanoid Avatar.
6. Apply the import settings. Open **Animation** and confirm clip names, frame ranges, loop settings and root transform settings.
7. Preview every clip on the UCENO base Avatar. Reject foot sliding, twisted wrists, shoulder collapse, hip drift, incorrect facing, broken hand/head motion, floating feet and abrupt transitions.
8. Run **UCENO > Validate Imported Humanoid Animation Library**. The gate checks the exact base Avatar retarget, actual imported clips, Humanoid motion, curve data, looping requirements and source/licence provenance.
9. Test clips on both the human-controlled avatar and AI citizen rigs. Review idle, walk, run, talk, turn, wave, cheer, dance, sit/stand and object interaction in motion, not only in a still frame. Local talk state follows actual microphone transmission; remote talk state follows the replicated animation snapshot.

## Manifest example

Replace these example values with real details from the animation provider; never claim a licence that was not granted.

```json
{
  "assets": [
    {
      "sourceFbx": "Assets/UCENO/Animations/Imported/locomotion.fbx",
      "sourceName": "Provider's locomotion pack",
      "sourceUrl": "https://provider.example/licence-page",
      "license": "Exact licence name and permitted use",
      "attribution": "Required creator attribution"
    }
  ]
}
```

## Acceptance boundary

The validator is a source gate, not proof that assets have been imported or visually accepted. The library remains incomplete until the FBXs and provenance records exist, Unity imports them as Humanoid clips retargeted to the UCENO base Avatar, the Editor validator passes, and the motions pass in-motion visual review on Android performance settings.
