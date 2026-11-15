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


## Third sourcing pass — public-domain city packs screened

Additional catalogue pages were inspected on 2026-11-15:

| Candidate | Licence and technical facts shown by listing | Assessment |
|---|---|---|
| [3DAssets.dev — Voxel City Districts](https://3dassets.dev/packs/voxel-city-districts) | CC0; 171 GLB files, 4.2 MB total, 86,304 triangles; shared voxel palette | Reject for the realism target. The pack is explicitly voxel/cubic, not detailed photoreal architecture. It may be useful for a separate low-detail prototype only; do not count toward the 108 accepted city prefabs. |
| [3DAssets.dev catalogue](https://3dassets.dev/) | Catalogue states CC0 and GLB delivery with embedded textures | Useful discovery index, but each asset must still be inspected for geometry, material quality, scale, UVs, LODs and visual fit. Catalogue-wide claims do not establish that a specific model meets UCENO's gate. |
| [Grab3D — City Block](https://grab3d.com/models/buildings/city-block-filler/) | CC0; full model listed at 20,642 triangles with 2K textures; light version 10,800 triangles | Could be a supporting mid-distance street block after visual inspection. It is described as a lightweight cozy/stylized kit, so it is not accepted as a hero building. |
| [Grab3D — Skyscraper](https://grab3d.com/models/buildings/skyscraper/) | CC0; 22,928 triangles, 2K base-colour/roughness/metallic/normal maps; light version 11,464 triangles | Potential skyline silhouette only. Stylized design and listing do not establish two genuine Unity LOD levels; do not count as accepted hero architecture. |
| [Community Core Stack — City 01](https://github.com/lucrybpin/unity-community-core-city-01) | Repository claims CC0 and a Unity city built from Kenney assets | Candidate for evaluating workflow and background city assembly, not proof of photoreal quality. Inspect source pack composition and actual Unity scene before any reuse. |
| [FPS Buildings Environment Kit](https://github.com/petroulacl/fps-buildings-env-kit) | Repository describes CC0 Kenney modular buildings, Quaternius stylized vegetation, four Poly Haven HDRIs and ambientCG PBR ground textures | Useful supporting environment source; stylized modular buildings/vegetation cannot be promoted as the requested hero architecture. |

### Important correction to the sourcing strategy

A large number of CC0 files is not equivalent to a realistic city asset library. Several apparently attractive "free city" packs are voxel, low-poly, stylized or modular. Those may help populate distant backgrounds, but they do not meet the user's stated requirement for convincing detailed city architecture and photoreal-looking environments. The asset gate must remain strict.

### HDRI acquisition plan

Poly Haven and ambientCG remain preferred CC0 sources for environment lighting. The nine HDRIs must be chosen by each city's actual environment, not assigned arbitrarily:
- Solstice Bay — bright tropical coastal daylight / humid atmosphere.
- Verdant Reach — soft daylight with lush green canopy context.
- Nexus Delta — modern urban daylight / controlled research-campus lighting.
- Aurora Heights — high-altitude clear sky and mountain atmosphere.
- Saffron Dunes — desert sun, warm horizon and clear arid sky.
- Monsoon Harbour — overcast tropical maritime sky / wet-weather option.
- Eclipse Central — urban dusk or night city illumination.
- Origin Plains — open-sky daylight with green rural/campus context.
- Atlas Frontier — industrial daylight / overcast logistics-yard context.

For each HDRI, record the exact asset ID, source page, licence evidence, file format, projection, pixel dimensions, download hash and Unity import settings. HDRIs provide lighting/reflections/background; they do not replace modeled city skylines or scene geometry.

### Acquisition status

This screening added no downloaded files to the repository. No source archive has been imported, and no candidate is accepted. The current nine-city art gate remains the authority for acceptance; the asset list must not be padded with low-detail models to make the counts appear complete.


## Fourth sourcing pass — exact Poly Haven architecture inventory

The official Poly Haven architecture category was inspected rather than relying on the overall model count. It currently lists **14 architecture assets**, including only three entries categorized as facades/modules. This is a much smaller architecture pool than the overall 522-model catalogue suggests.

Exact candidate models relevant to the existing city pipeline:

| Asset | Listing facts | Potential UCENO use | Import risk |
|---|---|---|---|
| [Modular Urban Apartments Facade](https://polyhaven.com/a/modular_urban_apartments_facade) | CC0; 118K triangles; 51.5m wide; 147 parts; download package listed at 663.38 MB | Meridian-style contemporary residential facade modules; could support Verdant Reach or Origin Plains only if the architecture is adapted and not simply duplicated | Very large source package. Needs selective map/resolution reduction, mesh partitioning, LOD generation and mobile profiling. One model does not satisfy a 12-prefab city pack. |
| [Modular Factory Facade](https://polyhaven.com/a/modular_factory_facade) | CC0; 175K triangles; 53.3m wide; 26.9 px/cm; download package listed at 900.83 MB | Atlas Frontier industrial district; possibly Monsoon Harbour service/port buildings after art review | Extremely large package. Must be selectively processed and LOD'd; not a ready-to-ship mobile asset. |
| [Modular Fort 01](https://polyhaven.com/a/modular_fort_01) | CC0; 28K triangles; 71.4m wide; download package listed at 646.68 MB | Possible heritage landmark or fortified civic feature only if a city brief requires it | Architecture style is colonial/fortification and does not fit most city identities. Heavy source archive; use only if visual direction explicitly supports it. |

The official category also includes small architectural components such as chainlink fencing, fire escapes, doors, shutters and gates. Those can become supporting props, but they are not substitutes for complete high-rise, waterfront, alpine, desert, research-campus or entertainment-district buildings.

### Revised acquisition strategy

- Use Poly Haven as a high-quality source for selected hero props, modular facade source geometry, materials and lighting—not as the sole provider of nine complete city architecture libraries.
- Download source archives only after assigning a specific city and prefab role. Large 600–900 MB archives must not be imported wholesale into the Android project.
- Create a processing stage outside the runtime build: retain original source files and provenance, extract only required components/maps, generate optimized meshes and multiple LODs, compress textures for Android, and record resulting hashes.
- Keep original source archive size separate from installed Addressables bundle size. The runtime package should contain only optimized deliverables.
- Build remaining distinctive landmarks and complete city silhouettes from a combination of individually licensed source assets and purpose-built authored models. Do not stretch a facade kit into nine different architectural identities by simple recolouring.
- The official Poly Haven API may be used for development-time catalogue metadata. The assets themselves are CC0, but live API use in a shipped product carries a separate visible attribution requirement. Do not make the game depend on the live API at runtime; ship versioned, locally manifested asset bundles instead.

### Status remains unchanged

These exact catalogue entries have not been downloaded, imported or visually accepted in Unity. They are acquisition candidates only. The existing release gate remains mandatory, including LODs, textured materials, collision/interactable validation, unique city assignment and Android profiling.



## Fifth sourcing pass — catalogue-level realism claim checked against actual listings

The 3DAssets.dev realistic-buildings catalogue was opened and its actual first-page entries inspected on 2026-11-15. This materially narrows the earlier shortlist assessment.

- The page advertises 1,418 realistic building/architecture GLBs under 25 MB and commercial use, but the visible entries are largely small kit components (chapel wall/door/roof modules, floor tiles, stage components and gallery walls) with listed geometry commonly around 120–2,700 triangles.
- Therefore, the catalogue count is not evidence of 1,418 complete, detailed city buildings. Its search index may still help find selected assets, but it cannot be treated as the principal source for the nine city architecture libraries.
- A model's low triangle count is not automatically a defect for a small prop, but a 100–2,000-triangle wall module cannot be counted as a detailed high-rise, waterfront tower, research campus building or city landmark.
- [Kenney City Kit 2.1](https://kenney.nl/assets/city-kit) and [Kenney Modular Buildings](https://kenney.nl/assets/modular-buildings) are CC0 and available in standard 3D formats, but their documented low-poly style makes them unsuitable for the required hero architecture. They remain excluded from the 108-prefab hero count.
- [Quaternius Downtown City MegaKit](https://quaternius.itch.io/downtown-city-megakit) offers 300+ modular pieces and CC0 terms, but its modular city-kit format is not proof of photorealism or the required city-specific architectural identity. It may be assessed for distant/background massing only, not accepted as hero art.
- [Grab3D City Block](https://grab3d.com/models/buildings/city-block-filler/) is a usable CC0 supporting candidate with 2K PBR maps and a listed 20,642-triangle full version, but the source describes it as lightweight/stylized. It remains background/supporting art only unless direct Unity review proves otherwise.

### Updated sourcing priority

1. **Primary realistic geometry:** individually selected Poly Haven architecture/props where suitable, supplemented by individually licensed realistic building models from sources whose model-level provenance and redistribution terms can be verified.
2. **Purpose-built hero assets:** commission or author missing signature buildings and landmarks for each city rather than trying to manufacture nine architectural identities by recolouring generic low-poly kits.
3. **Supporting environment:** CC0 modular kits may be used for distant silhouettes, road furniture, hidden structural parts and non-hero props only when the visual style is compatible.
4. **HDRIs and PBR:** acquire nine distinct, city-matched panoramas and material sets as separate deliverables; do not count lighting assets as modeled city content.

### Next acquisition batch — strict evidence required

The next batch should be a small pilot, not a bulk import: select one candidate hero building and one environment/prop for each of two contrasting cities (for example, Atlas Frontier industrial and Solstice Bay waterfront). For every candidate, capture the original source URL, creator, exact licence text, redistribution rights, archive hash, dimensions, triangle count, texture maps/resolution and whether real LOD source meshes exist. Import only after this evidence is complete. Reject the pilot if either city looks like a recoloured copy of the other or if the assets fail mobile LOD/texture budgets.

### Evidence boundary

This fifth pass is catalogue inspection and sourcing policy only. No model files or HDRIs were downloaded, no Unity imports were made, and no city prefab is accepted. The nine city packs, nine HDRIs, 36 district scenes and visual/runtime acceptance remain outstanding. The release gate must not be weakened to turn catalogue entries into a false completion count.


## Sixth sourcing pass — individual CC0 and CC-BY building candidates

A further pass inspected individual downloadable models rather than relying only on catalogue totals. These are still candidates, not imported or accepted assets.

| Candidate | Listing evidence | Potential city role | Decision |
|---|---|---|---|
| [Grab3D Modern House](https://grab3d.com/models/buildings/modern-house/) | CC0; 20,376 triangles; 2K textures; GLB/FBX; 1.4 MB GLB | Solstice Bay low-rise waterfront residential or Origin Plains housing, subject to style fit | Candidate supporting/low-rise building. The listing calls it lightweight/cozy; do not count as a hero tower or landmark. |
| [Grab3D Colonial House](https://grab3d.com/models/buildings/colonial-house/) | CC0; 39,867 triangles; 2K textures; 2.9 MB GLB | Heritage/low-rise district only where the city's architectural brief supports it | Candidate only; colonial style is not a universal fit and needs direct preview. |
| [Grab3D Adobe House](https://grab3d.com/models/buildings/adobe-house/) | CC0; 17,758 triangles; 2K textures; 1.2 MB GLB | Saffron Dunes low-rise oasis/residential cluster | Candidate for a supporting low-rise asset; does not satisfy desert megastructure/hero architecture. |
| [Grab3D Mansion](https://grab3d.com/models/buildings/mansion/) | CC0; 37,922 triangles; 4K textures; light version 20,785 triangles | Possible Origin Plains estate/civic compound | Candidate only; architecture and 4K texture cost require inspection and mobile profiling. |
| [Innerscene Four-storey Apartment Block](https://www.innerscene.com/tools/library/3d-parts/four-storey-apartment-block-331e1924) | CC0; 16.8 MB GLB; real-world dimensions and materials stated | Residential district building for a city where its design fits | Stronger candidate for Unity import inspection, but source page does not prove LODs, collider setup, or Android suitability. |
| [Innerscene Three-storey Office Building](https://www.innerscene.com/tools/library/3d-parts/three-storey-office-building-16b33ce5) | CC0; 13 MB GLB; real-world dimensions and materials stated | Origin Plains campus or Nexus Delta supporting office building | Candidate for import inspection; no listing proof of LODs or mobile budget. |
| [Sketchfab — Modular Russian Panel House](https://sketchfab.com/3d-models/modular-russian-panel-house-7bef9b27b4c54a03b64e2f395fef3d7f) | CC BY; 28.6K triangles; 2K textures; modular building and separate components | Residential background architecture if style matches | Licence is compatible in principle only if attribution and derivative obligations are recorded. Inspect the actual downloadable archive and confirm the exact licence at acquisition. |
| [Sketchfab — Realistic Building](https://sketchfab.com/3d-models/realistic-building-bcd30b0c7aef41c98b204d2a5d622cce) | Creator description claims 4K/2K PBR maps and game-ready optimized mesh; page displays Free Standard licence | Potential Asian-architecture street scene candidate | **Do not import under the current gate.** Free Standard is not the same as CC0/CC-BY/CC-BY-SA and redistribution rights need legal review plus an explicit gate policy change. |
| [Monuments open-source building models](https://github.com/bilol-makhmudov/monuments) | GLB models of real historic buildings under CC BY-SA 4.0 | Distinctive civic/heritage landmarks, potentially where a city's brief calls for them | **Hold for licence review.** Share-alike applies to derivatives; do not mix into the main game asset pack until legal review confirms acceptable treatment. |

### Pilot selection refinement

For the first two-city pilot, use the following candidates for inspection rather than claiming them as selected final art:
- **Solstice Bay:** inspect the Modern House as a low-rise residential support asset; separately source a convincing waterfront tower, marina structures and coastal landmark.
- **Atlas Frontier:** inspect Poly Haven Modular Factory Facade as an industrial source, but do not import its nearly 901 MB source archive wholesale; extract only required modules and generate optimized LODs. A separate logistics terminal/rail landmark still needs to be sourced or authored.

This deliberately leaves both cities short of their required 12 accepted prefabs. The missing assets must be filled with appropriate architecture, not duplicate houses or props.

### Acquisition rule

Before any candidate is marked acquired, record a downloadable archive URL, retrieval date, file hash, licence file or exact licence statement, creator, model dimensions, triangle count, texture inventory/resolution, source LOD availability and import target. If a candidate is available only as a viewer preview, it is not acquired. After import, run the Unity gate and inspect the actual model and LOD transitions on Android.

### Evidence boundary

This pass identifies specific model pages and licence/technical claims; it does not establish that any archive has been downloaded. No asset was imported or visually accepted. City-specific HDRIs, 108 accepted prefabs, 36 district scenes, animation import/retargeting and runtime acceptance remain outstanding.
