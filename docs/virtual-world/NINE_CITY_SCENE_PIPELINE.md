# UCENO nine-city scene pipeline

## Scope

Meridian Prime remains the starter city. Nine additional cities are specified in `runtime/world-gateway/config/world-cities.json`: Solstice, Verdant, Nexus, Aurora, Saffron, Monsoon, Eclipse, Origin and Atlas. A catalogue entry or procedural blockout is not a finished city.

The catalogue defines each city's identity, architecture language, biome, terrain, weather, road hierarchy, water, districts and named landmarks. Those specifications guide scene composition; they are not substitutes for imported art.


## Ten-city coverage contract

The catalogue must define exactly ten distinct cities: Meridian Prime plus the nine additional cities. Every city must retain four uniquely identified districts and three uniquely identified landmarks, with distinct urban form, biome, terrain and architecture identities. Meridian remains the starter-city path; the nine additional cities must each have one independent imported asset profile. The Editor command **UCENO > World > Validate Ten-City Catalogue and Pack Coverage** checks this split before imported-pack validation or scene generation. This catalogue/profile check does not claim that any city assets have been imported or that scenes exist.

## Non-negotiable imported-art requirement

Do not use `CityProceduralAssetPackGenerator` to manufacture buildings, trees, landmarks or skyboxes from primitive meshes and flat-color materials. That generator is a blockout utility only and its output does not meet the visual-quality target. Do not treat its generated profiles as imported assets.

Each of the nine city packs must contain 12 distinct, licensed imported prefabs:

- Five architecture assets: signature skyline anchor, residential typology, commercial/civic typology, transit/industrial structure and public-realm structure
- Four environment assets: biome-specific tree, ground cover, street furniture and signature landscape prop
- Three dedicated landmark assets matching the city's catalogue landmark IDs

That is 108 imported prefabs across the nine cities, plus nine city-specific HDRI panoramas. Each prefab must have detailed mesh geometry, textured PBR materials, at least three authored LOD levels (each with valid, non-empty renderer assignments) and a city-owned path under `Assets/UCENO/Cities/<city-id>/Prefabs`. Each landmark must have a root `WorldInteractable` marker and a solid collider. Do not reuse another city's signature architecture or landmark mesh.

Every city folder must contain `source-manifest.json` with exactly 12 asset records. Each record must identify `prefab`, `sourceName`, `sourceUrl`, `license` and `attribution`. Keep the original downloaded source files and licence text alongside the imported assets. A filename or generated mesh is not proof of provenance. The automated release gate currently accepts only these exact commercial-use/derivative-use licence labels: `CC0 1.0`, `CC-BY 4.0`, `CC-BY 3.0`, `CC-BY-SA 4.0` or `CC-BY-SA 3.0`. Each `sourceUrl` must be an absolute HTTPS URL; each prefab path must appear exactly once and the manifest must cover exactly the 12 configured prefabs. Non-commercial, no-derivatives, unknown or unverified licences are rejected until explicitly reviewed and the gate is updated.

The Editor gate `UCENO > World > Validate Imported City Art Packs` inspects the actual Unity prefab assets, mesh detail, textured materials, LOD groups, landmark interaction components, city-specific dependency fingerprints, provenance manifests and HDRI dimensions. The shared `CityAssetLodContract` is authoritative for the three-level requirement and is enforced by both imported-pack and visual-quality validation. It must pass before scene generation. A source-contract test cannot substitute for running this Editor gate.

## Humanoid animation requirement

The avatar must use imported motion-capture or professionally authored Humanoid clips, retargeted to the UCENO base Avatar. The required library covers idle, walk, run, talk, turn, wave, cheer, dance, interact and sit. Procedural bone posing, static portraits, generated stills and short image-to-video clips are not substitutes for skeletal animation clips.

Import licensed FBXs under `Assets/UCENO/Animations/Imported`, set Rig > Animation Type to Humanoid and Avatar Definition to Copy From Other Avatar, and select the UCENO base Avatar. Preview every clip on the base rig and reject foot sliding, twisted wrists, shoulder collapse, hip drift, incorrect facing or broken hand/head motion. Run `UCENO > Validate Imported Humanoid Animation Library`; then inspect human-controlled and AI-controlled avatars performing the full set of motions in Unity and on Android.

## Scene generation and registry procedure

1. Import the nine city-specific source packs and create the prefabs at the exact paths in `Assets/UCENO/Editor/city-scene-asset-profiles.json`. Create the nine provenance manifests and import real HDRI panoramas. Do not use the procedural blockout generator as an asset source.
2. Run **UCENO > World > Validate Imported City Art Packs**. Fix every failure; do not bypass the gate.
3. Run **UCENO > World > Build Remaining Nine City Scenes**. The scene pipeline composes four additive district scenes per city (36 total) from the imported city prefabs, city-specific roads/terrain/water and the catalogue layout. It registers remote Addressables entries with city/district labels and exports city-specific district, interactable and collision registries.
4. Run **UCENO > World > Verify Nine City Scene Registries**. Check each scene manifest, scene file, Addressables label, landmark-to-district placement, district bounds, stable interactable IDs and collision/interactable parity. Run the gateway parser and integration tests against the exported registry files.
5. Build Android Addressables content. Publish the remote catalog JSON, hash and all bundles to the configured HTTPS content host. A local Addressables build is not proof of publication. Verify catalog and bundle reachability and actual loading from an Android device.
6. Inspect all nine cities in motion at Android quality settings. Review architectural identity, landmarks, terrain transitions, roads, water, lighting, vegetation, occlusion, LOD transitions, frame time, memory and thermal behavior.

## Honest completion criteria

A city is not complete until its real imported pack passes the Editor gate, all four additive scenes compile and load through Addressables, exported registries and collision maps validate, gateway integration passes, and visual/performance review is accepted. The city catalogue and source-level CI checks do not prove any of those runtime outcomes.

The generated per-city runtime files are `world-districts-<city-id>.json`, `world-interactables-<city-id>.json` and `data/uceno-city-collision-boxes-<city-id>.json`. The gateway currently loads one active district/interactable/collision configuration per process; multi-city routing across those configurations still requires explicit deployment/runtime wiring.

## Addressables and Android release gate

The Android pre-export gate must validate the imported city packs, build Meridian's starter scene and registry, generate the 36 additive city scenes, verify all scene manifests and gateway registries, and build Android Addressables content with a real HTTPS remote catalog and remote build path. The build must produce remote catalog JSON and hash artifacts.

The output must then be published to the configured HTTPS host and loaded from an Android device. The APK remains blocked until Meridian and all nine additional cities pass the same imported-asset, scene, registry, Addressables, gateway, visual and performance acceptance gates. No APK build is authorized by this pipeline update.
