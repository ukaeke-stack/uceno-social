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
