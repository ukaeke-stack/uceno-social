# District collision-map export

The Unity Editor command **UCENO → World → Export Loaded District Maps** creates one collision/interactable map per configured district and a manifest:

- `runtime/world-gateway/data/districts/manifest.json`
- `runtime/world-gateway/data/districts/<district-id>.json`

The manifest records each district ID, Addressables content label, map filename, configured X/Z bounds, and exported collider/interactable counts. Each map retains the existing collision-map JSON shape (`version`, `coordinateSystem`, `boxes`, `interactables`) so the existing parser can be reused by a future district-aware gateway loader.

## Export rules

- Reads the authoritative district rectangles from `runtime/world-gateway/config/world-districts.json`.
- Scans all scenes currently loaded in the Unity Editor; it does not automatically open every scene asset.
- Requires every active interactable across those loaded scenes to have a valid globally unique stable ID and to belong to exactly one district.
- Includes a collider in every district rectangle it overlaps. Boundary-spanning static geometry is therefore present in both adjacent maps rather than disappearing at a district edge.
- Excludes disabled colliders, trigger colliders, inactive objects, and player-owned colliders.
- Enforces the gateway's 500-collider and 500-interactable limits per district.
- Fails if any configured district has no exported collider geometry; this prevents an apparently successful but unusable map.

## Important integration status

This command is an export step only. The gateway still reads the legacy global collision map through `WORLD_COLLISION_BOXES_FILE` / `WORLD_COLLISION_BOXES`. Do not point the production gateway at the district manifest yet. A subsequent server change must validate the manifest, load the active district map, switch collision queries at authoritative district transitions, and keep boundary geometry available during transitions. The existing district Addressables labels already drive additive Unity scene residency, but the new map files are not yet consumed by the gateway.

Before exporting, load all relevant district scenes additively in Unity Editor, save them, run **UCENO → World → Validate Loaded District Scenes**, then run the export command. Review the generated counts and ensure each scene's colliders are authored in the shared world coordinate system.
