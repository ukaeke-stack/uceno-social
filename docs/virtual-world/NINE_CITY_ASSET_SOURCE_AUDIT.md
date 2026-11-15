# Nine-city imported art source audit

**Audit date:** 2026-11-15  
**Target branch:** `feature/uceno-unity-foundation`  
**Status:** research shortlist only — no candidate pack is recorded as acquired, imported, or visually accepted.

## Release requirements

The nine non-Meridian cities require 108 distinct imported prefabs (12 per city), nine city-specific HDRIs, nine complete provenance manifests, and 36 additive district scenes. Each imported model must pass the existing Unity Editor release gate: real mesh geometry, textured materials, at least two LOD levels, correct collision/interactable setup where applicable, a redistributable licence, and city-specific visual review.

A source page or a downloadable archive is not proof of acquisition, import, licence compliance, or Unity acceptance. Keep those states separate in future asset records.

## Candidate source assessment

| Source | Evidence available | Fit for UCENO | Decision |
|---|---|---|---|
| [OpenHDRI](https://openhdri.org/) | CC0 real-world HDRI captures | Useful for environment lighting/reflections; does not provide 3D city architecture | Shortlist for nine distinct sky environments; inspect resolution, panorama projection, and visual match before import |
| [ambientCG](https://ambientcg.com/) | CC0 PBR materials and HDRIs | Useful for surface materials and some environment lighting; not a source of complete city buildings | Shortlist for city-specific PBR surface libraries and supplementary HDRIs |
| [Devall Modular Urban Building Kit Vol. 1](https://devallassets.itch.io/modular-urban-building-kit-vol-1-17-game-ready-pieces) | Listing describes 17 modular pieces, GLB/FBX/OBJ and Blender source, CC0; 44–3,388 triangles per piece and under 10K triangles for the whole set | Licence is compatible in principle, but the stated geometry budget is too small to treat this pack as the photorealistic hero architecture for UCENO | Reject as a primary realism pack; consider only for distant/background or prototype use after visual inspection |
| [Greanapple Cityscape Kit v1](https://greanapple.itch.io/cityscape-kit) | Listing describes 12 game-ready pieces, 1024px PBR textures, two LOD levels, and a royalty-free commercial-game licence; files may not be redistributed as-is | Better stated PBR/LOD fit, but paid and not CC0/CC-BY/CC-BY-SA; the current Unity gate would reject its licence string | Do not import under the current gate. Any use requires licence review and an explicit, tested allowlist policy for embedded game assets |
| [3DAssets.dev realistic buildings](https://3dassets.dev/assets?category=buildings&style=realistic) | Catalogue claims free commercial-use GLB models | Potentially useful breadth, but each model's actual source licence, provenance, texture quality, LODs, collision and geometry must be checked individually | Research only; do not accept based on catalogue-level claims |
| [Sketchfab](https://sketchfab.com/) | Large model catalogue with per-model licence terms | Potential source for distinctive landmarks and architecture, but licence and redistribution rights vary by model | Use only individually verified CC0/CC-BY/CC-BY-SA assets, with source-page evidence preserved |

## Exclusions and safeguards

- Do not use low-poly or flat-colour city kits as substitutes for the requested detailed, realistic city environments.
- Do not treat an asset's "commercial use" wording as permission to redistribute source files or bundle them into an app. Read the actual licence and redistribution restrictions.
- Do not mix packs with visibly incompatible scale, materials, texel density, geometry quality, or art direction merely to reach 12 prefabs.
- Do not duplicate the same hero architecture or landmark across cities to satisfy the 108-prefab count. The existing release gate also checks cross-city asset fingerprints.
- Keep original source archives, licence text, creator attribution, exact source URLs, import settings, and content hashes alongside each accepted pack.
- For CC-BY, include the required attribution in the shipped credits. For CC-BY-SA, review share-alike obligations before use in the commercial project.

## City-specific art direction to preserve

- **Solstice Bay:** tropical waterfront, marinas, terraced coastal architecture.
- **Verdant Reach:** vertical forests, green towers, elevated planted corridors.
- **Nexus Delta:** river-island research campus, advanced technology architecture.
- **Aurora Heights:** alpine terraces, mountain stations and contour-following structures.
- **Saffron Dunes:** desert megastructures, solar canopies and oasis courtyards.
- **Monsoon Harbour:** canals, maritime buildings and flood-resilient elevated streets.
- **Eclipse Central:** entertainment superblocks, illuminated towers and nightlife venues.
- **Origin Plains:** education and agritech campuses, gardens and spacious civic districts.
- **Atlas Frontier:** industrial architecture, freight terminals, rail infrastructure and logistics hubs.

## Acceptance sequence

1. Select the exact source model and capture its source-page licence evidence.
2. Verify redistribution rights for a packaged mobile game; reject ambiguous terms.
3. Download and preserve the original archive and licence text.
4. Import into Unity; inspect scale, mesh, materials, UVs, normals and texture maps.
5. Create and inspect at least two useful LOD levels; verify collision and interaction requirements.
6. Place the prefab in its assigned city's asset folder and add its exact provenance record.
7. Run the Unity imported-city-art gate, then inspect the actual prefab and scene in Unity.
8. Only then mark the asset accepted. A green source-contract workflow alone does not prove visual quality.

## Current status

The PR inventory previously audited contains no files under `Assets/UCENO/Cities/`, only one general HDRI, and no imported city-specific prefab sets or nine-city source manifests. This register does not change that inventory. All nine city art packs, nine city HDRIs, Unity imports/LODs and scene visual acceptance remain outstanding.


## Second sourcing pass — 2026-11-15

This pass widened the search beyond the initial Poly Haven-oriented shortlist. It adds leads, not accepted art:

| Lead | Public listing evidence | Appropriate use | Decision / caveat |
|---|---|---|---|
| [Poly Haven](https://polyhaven.com/) | Its library describes hyperreal 3D models, HDRIs and photoscanned PBR textures, all CC0 | First-choice source to inspect for hero props, natural assets, PBR surfaces and HDRIs | Query the actual catalogue by asset; do not assume it contains nine complete city kits or 108 suitable buildings |
| [Grab3D — City Block](https://grab3d.com/models/buildings/city-block-filler/) | CC0 listing; 20,642 triangles, 2K PBR maps, downloadable GLB/FBX/BLEND/OBJ | Possible mid-distance street filler or mixed-use block | Listing labels it stylized; not a photoreal hero building. Verify the downloaded archive and actual LODs; the listing alone does not prove two LODs |
| [Grab3D — Skyscraper](https://grab3d.com/models/buildings/skyscraper/) | CC0 listing; 22,928 triangles, 2K textures, GLB/FBX/BLEND/OBJ | Possible skyline silhouette / distant tower | Stylized art direction; not sufficient as a hero asset and no two-LOD proof on the listing |
| [3DAssets.dev — realistic buildings](https://3dassets.dev/assets?category=buildings&style=realistic) | Catalogue claims 1,418 self-contained realistic GLB models under 25 MB, free commercial use | Candidate pool for screening distinct architecture and landmarks | Catalogue-wide statement is not model-level provenance. Every selected asset needs an individual licence/source record and geometry/material/LOD inspection |
| [FPS Buildings Environment Kit](https://github.com/petroulacl/fps-buildings-env-kit) | Repository describes Kenney modular buildings, Quaternius vegetation, Poly Haven HDRIs and ambientCG PBR textures as CC0 | Possible source bundle for low-priority background props and surfaces | Mostly modular/stylized kit assets; do not use as the primary realistic city architecture. Verify original source licences and each file before reuse |
| [ModKit modular building kit](https://github.com/JaronKBragg7337/asset-pack-ue-threejs-blender-unity) | Repository describes 38 CC0 modular building/prop pieces in FBX/GLB/Blend | Architectural kitbash parts for original buildings | Procedural/modular parts are not finished detailed city buildings; use only as components if visual quality is acceptable |

### Sourcing decision

1. Prioritize individual high-quality Poly Haven models and PBR materials where catalogue inspection confirms the needed subject and quality. Its CC0 terms are the cleanest licensing baseline for embedded assets.
2. Screen 3DAssets.dev model-by-model for realistic architecture, but do not bulk-import on the strength of its catalogue claim.
3. Treat Grab3D city block/skyscraper as supporting assets only unless Unity inspection demonstrates they meet the intended visual tier.
4. Keep low-poly and modular CC0 kits out of the hero-architecture count. They may support distant silhouettes, utility props or hidden structural components, but cannot be counted as finished city-specific hero prefabs.
5. For each of the nine HDRIs, require an actual downloaded panorama with recorded source URL, licence, dimensions, projection and hash. A search result or generic HDRI is not a city-specific environment asset.

### Evidence boundary

No source archive was downloaded or imported by this audit. No asset is promoted to acquired, imported, LOD-complete or visually accepted. The next real delivery step is to obtain the actual model files and licence evidence, then run Unity import and visual inspection against the existing release gate. If a source cannot supply suitable assets under compatible terms, the correct action is to commission/create that asset—not lower the realism requirement or count a placeholder.
