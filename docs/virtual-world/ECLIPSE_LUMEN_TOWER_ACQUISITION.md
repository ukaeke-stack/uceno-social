# Eclipse Central — Lumen Tower asset acquisition record

Status: **candidate identified; not downloaded, imported, or accepted**.

This record captures a source candidate for the Eclipse Central landmark `lumen-tower`. It is not a Unity asset manifest and must not be used to mark the city pack complete.

## Selected source candidate

- Asset: **Office Tower**, Tevy, pinned version **v2**
- Source page: https://tevy.dev/models/office-tower
- Model file format: GLB (glTF binary)
- Licence: **CC0 1.0**; commercial use and modification permitted, attribution optional
- Dimensions: 46.6 m × 70.9 m × 29.3 m
- Geometry: LOD0 55,936 triangles; LOD1 18,696 triangles; LOD2 1,212 triangles
- File sizes: LOD0 1,087,096 bytes; LOD1 386,004 bytes; LOD2 426,084 bytes
- Pinned downloads:
  - https://tevy.dev/models/office-tower/v2/lod0.glb
  - https://tevy.dev/models/office-tower/v2/lod1.glb
  - https://tevy.dev/models/office-tower/v2/lod2.glb
- Publisher catalogue: https://tevy.dev/models.json
- Publisher source repository: https://github.com/iruizsalinas/tevy
- Publisher repository states that its models are CC0 1.0 and that model files use meshopt geometry and KTX2 textures.

## Published integrity metadata

The publisher's catalogue lists the following SHA-256 values. Recompute each checksum against the downloaded bytes before importing; these values are expected values, not locally verified checksums.

| File | Bytes | Triangles | SHA-256 |
|---|---:|---:|---|
| LOD0 | 1,087,096 | 55,936 | `d097adfb71480ac1d730a8eb02afe7368643e6453c056004b7aaa29ec723a33e` |
| LOD1 | 386,004 | 18,696 | `d6241a4c237dfdf8e442fb17dc2ae716462822fb077bc25bd0ce1013b4146684` |
| LOD2 | 426,084 | 1,212 | `8bde44649bd969c0d591b1c1a825dddd99bcfc77f9f690ea9844c03e93e28bd4` |

## Acceptance checks before this can become a city prefab

1. Download the three pinned files and verify byte counts and SHA-256 values against the catalogue.
2. Preserve the publisher page, CC0 licence evidence, and downloaded originals in the asset source archive.
3. Confirm the GLB files' embedded materials and texture payloads. The publisher documents KTX2 textures, but the required 1K+ albedo and 1K+ normal-map dimensions have **not** yet been independently verified for this asset.
4. Confirm Unity 6000.3 importer compatibility for meshopt + KTX2. The current Unity package manifest does not list glTFast or another GLB importer; do not assume Unity will import these files without the required importer and texture-transcoding dependencies.
5. Import the three LOD files into Unity, build one root prefab with an authored LODGroup, and verify strictly decreasing renderer geometry counts and correct transition thresholds using `CityAssetLodContract`.
6. Add a root `WorldInteractable` component and solid non-trigger collider, then verify the landmark registry exporter recognizes it.
7. Run the actual Unity Editor imported-art and visual-quality gates. Human visual review remains mandatory.

## Important design limitation

The source model is a modern 15-storey slab office tower with a podium and rooftop plant. It is a viable architectural base candidate, not proof that the distinctive Lumen Tower design has been achieved. Review its silhouette against the Eclipse Central art direction before accepting it. If it does not meet the intended landmark identity, reject it rather than relabeling it.

## Release status

- Downloaded locally: **No**
- Checksums verified locally: **No**
- Imported into Unity: **No**
- Prefab and LODGroup created: **No**
- LOD contract passed in Unity: **No**
- 1K albedo and normal maps verified: **No**
- Landmark collider and interaction marker verified: **No**
- Human visual acceptance: **No**

Do not add this candidate to `Assets/UCENO/Cities/eclipse/source-manifest.json` or change the city asset profile until all applicable checks above pass.

## Unity importer compatibility investigation (2026-11-19)

The official Unity package registry currently lists **com.unity.cloud.gltfast 6.21.0** as the latest stable release. Its package metadata specifies Unity **6000.0 or newer**, so the package's declared Unity floor includes this project's Unity 6000.3.27f1 editor version. This is a compatibility indication, not a verified project import or compile.

Official glTFast documentation confirms:
- Editor import of GLB files into Unity-native imported assets/prefabs.
- KTX2/Basis texture import through the separate **com.unity.cloud.ktx** package.
- EXT_meshopt_compression import through the separate **com.unity.meshopt.decompress** package.
- Normal texture import is supported; the importer does not by itself prove that this particular asset contains a valid 1K+ normal map.

References:
- https://github.com/Unity-Technologies/com.unity.cloud.gltfast
- https://docs.unity3d.com/Packages/com.unity.cloud.ktx@latest
- https://docs.unity3d.com/Packages/com.unity.meshopt.decompress@0.1/manual/index.html
- https://versionalert.com/unity/package-releases/com.unity.cloud.gltfast/6.21.0

**Import decision:** glTFast 6.21.0 is the leading importer candidate for a controlled Unity 6000.3 test. Do not add it or its optional packages to the project manifest yet. First inspect the downloaded GLB extension declarations and texture payloads, then pin mutually compatible stable package versions and verify import in the actual Unity Editor. Do not install the latest pre-release package merely because it appears on the repository's main branch.

This investigation did not obtain the model binaries. The Tevy download endpoint returned an unsupported binary content type to the browser retrieval layer, and the container download attempt failed. Consequently, no GLB bytes, checksums, KTX2 payloads, meshopt payloads, or texture dimensions were inspected locally.


## Alternative source screening (2026-11-19)

The following alternatives were reviewed to avoid treating any convenient download as a release-ready landmark. None is accepted into the Eclipse pack:

- **Tevy Town Hall** — CC0 1.0, 30,508 LOD0 triangles, three published LODs (30,508 / 13,678 / 1,531 triangles). This confirms the publisher has other potentially useful LOD-authored architecture, but the binary download/import and 1K albedo + normal-map checks remain outstanding. It is not a visual substitute for Lumen Tower. Source: https://tevy.dev/models/town-hall
- **3DAssets.dev realistic buildings catalogue** — publisher describes 1,418 CC0 GLB building assets with embedded WebP textures. The catalogue page does not establish three authored LODs or the required 1K albedo and normal-map pair for any specific candidate. Treat as discovery only; no model accepted. Sources: https://3dassets.dev/assets?category=buildings&style=realistic and https://3dassets.dev/
- **Low Poly City Kit** — 129 CC0 GLB models, but the publisher specifies flat colours, no textures, and a maximum of 1,500 triangles per model. It fails the current architecture/landmark LOD0 minimum and 1K PBR texture requirements. It is unsuitable for this release gate. Source: https://github.com/kayquer/kit-cidade-lowpoly
- **ModKit** — CC0 modular walls, floors, roofs, stairs and props, but the reviewed catalogue does not establish three authored LODs or the required 1K albedo and normal maps for the supplied modules. It may be useful for kitbash/source exploration only; it cannot be counted as a passing city prefab without those checks. Source: https://github.com/JaronKBragg7337/asset-pack-ue-threejs-blender-unity

**Decision:** keep Tevy Office Tower as the leading Lumen Tower base candidate because its published three-LOD geometry and CC0 licence are the closest match to the current acceptance contract. Do not weaken the contract to admit low-poly, flat-colour, or unverified catalogue models. The immediate blocker remains obtaining and inspecting actual source binaries through a reliable download path.


## Additional landmark-library screening — 2026-11-19

**Codriver 3D Assets** was inspected as a possible source of realistic landmark and city-building geometry: https://github.com/codriver-io/codriver-3d-assets

- The public catalogue describes 675 landmarks and 1,366 self-contained GLB variants, with near/far detail variants and editable generators.
- The repository's `LICENSES.md` identifies the original models as CC BY 4.0, requiring creator attribution; geographic data derived from OpenStreetMap remains ODbL 1.0 and carries separate obligations.
- The model submission checklist calls for self-contained near/far GLBs, not three authored LOD levels. The README confirms near/far variants only. This does not satisfy UCENO's current three-authored-LOD acceptance contract.
- The public repository documentation does not establish that individual models contain the required 1K albedo and normal-map textures. No model binary was downloaded or inspected in this pass.

**Decision:** do not import or count Codriver assets as passing UCENO prefabs. The library is a possible separately licensed reference/source for future review, but its two-detail-level contract and CC BY/ODbL obligations make it unsuitable as an immediate drop-in for the current release gate. Do not infer that a model's presence in a public catalogue proves Unity import, material, texture, LOD or visual acceptance.

## Latest imported-art gate evidence — 2026-11-19

- Workflow run `44559570645` completed with failure. The strengthened validator reported **117 missing items**: nine city `source-manifest.json` files and 108 configured prefab files (12 per city across solstice, verdant, nexus, aurora, saffron, monsoon, eclipse, origin and atlas).
- The same failure log did not report missing city HDRI files or HDRI provenance files. Their source-file presence is therefore not the current reported blocker; it still does not prove Unity import or visual acceptance.
- The gateway/client workflow run `44559570574` completed successfully. Its gateway build and real-process PostgreSQL fencing/failover tests passed, as did Unity source-contract validation. This is not Unity Editor compilation or Android-device testing.
- Other source checks on this commit also completed successfully: world gateway tests, activity tests, voice HUD, content delivery, humanoid animation source contract, and Unity Build Automation artifact-handoff checks.

**Next source task:** source and inspect actual prefabs/models, then create manifests from the verified imported assets. Do not manufacture placeholder prefabs or manifests merely to make the gate green.
