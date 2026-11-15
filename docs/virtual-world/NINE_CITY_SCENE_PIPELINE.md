# UCENO nine-city scene pipeline

## Scope

Meridian Prime remains the existing starter-city pipeline. The other nine cities are generated from `runtime/world-gateway/config/world-cities.json` by the Unity Editor tool `UCENO/World/Build Remaining Nine City Scenes`.

The city catalogue supplies identity, architecture description, biome, terrain, weather, vegetation, road hierarchy, water description, district geometry and named landmarks. Each landmark explicitly names its owning district and must lie inside that district's bounds.

## City-specific imported asset contract

`unity/UCENOVirtualWorld/Assets/UCENO/Editor/city-scene-asset-profiles.json` defines nine independent asset packs. Each city must provide:

- Three unique architecture prefabs: signature tower, district block, and civic/cultural anchor
- Three unique environment prefabs: biome tree, ground cover, and street furniture
- One dedicated imported prefab for each of the city's three named landmarks

The expected paths are under `Assets/UCENO/Cities/<city-id>/Prefabs`. Paths must be unique within a city and across all nine cities. Reusing Meridian or another city's signature architecture is rejected. The validator also rejects missing prefabs and incomplete landmark mappings.

## Build procedure

1. Import licensed, optimized source models for each city's architecture, vegetation, public realm and landmarks into its own asset folder.
2. Create Unity prefabs at the exact paths in the asset profile. Keep original source files and licence/attribution records.
3. Confirm scale, pivots, materials, LOD groups, colliders and mobile texture budgets. Do not use a generic placeholder prefab as a city landmark.
4. In Unity, run **UCENO > World > Validate Remaining Nine City Asset Packs**. It must pass before generation.
5. Run **UCENO > World > Build Remaining Nine City Scenes**. The generator creates four additive district scenes per city, places that city's imported architecture/environment/landmark prefabs, generates layout-specific road geometry and water features where specified, and registers each scene as a separately packed remote Addressables entry using its city/district content label.
6. Build the Addressables content for the Android target and publish the remote catalog and bundles to the configured content host.
7. Run the exported scene-registry parser against the actual generated scene output. Check district ownership, interactable IDs, collision coverage and label-to-scene parity.
8. Inspect every city in motion at Android quality settings. Check terrain transitions, roads, water, landmark silhouettes, occlusion, lighting, vegetation density, LOD transitions, frame time and memory.

## Honest completion criteria

A city catalogue entry is not a completed city. A generated district blockout is not a completed city either.

A city is not release-ready until its city-specific imported asset pack is present, its four additive scenes compile and load through Addressables, its scene registry and collision map validate, and its visual/performance review is accepted. The current generator creates a data-driven scene layout layer; it does not invent missing high-quality architectural source models or prove photorealistic quality.

The Android APK remains blocked until all nine cities and the existing Meridian city pass the same scene, asset, registry, Addressables and runtime acceptance gates.
