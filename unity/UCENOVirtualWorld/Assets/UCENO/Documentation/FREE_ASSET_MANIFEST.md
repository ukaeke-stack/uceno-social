# UCENO Virtual World — free asset sources

This project is restricted to free assets at this stage. Imported files are kept
separate from gameplay code so professional replacements can be added later
without rewriting player movement, camera control, or interaction logic.

## Human avatar

- Generator: https://github.com/olatunde85/3d-gen (Ara 3D Gen)
- Character source data: MakeHuman data and system assets, CC0 1.0.
- Motion source: CMU Graphics Lab Motion Capture Database. The motion clips may
  be used in commercial products, but the motion data itself must not be resold
  on its own. The generator includes the required acknowledgement in its export.
- Export target: FBX, Unity Humanoid rig, medium mesh detail, baked idle/walk/run
  and other available clips.
- UCENO profile: contemporary adult male appearance with African skin settings,
  modern casual clothing, and dark hair. This is an initial default model, not a
  limit on future player customisation.

Ara 3D Gen's repository is MIT-licensed. Its README states that generated
character exports may be used in commercial and non-commercial projects without
attribution. See its bundled scripts/ASSETS_LICENSE.txt for the underlying
MakeHuman and CMU notices.

## Environment models

The asset-import workflow downloads these selected models from
https://polyhaven.com/, using the official public API:

| Asset | Planned use |
| --- | --- |
| Modular Urban Apartments Facade | Residential city frontage |
| Modular Factory Facade | Industrial/commercial frontage |
| Street Lamp 01 | Street lighting |
| Jacaranda Tree | Natural street landscaping |
| Covered Car | Parked street vehicle |
| Modular Chainlink Fence | Perimeter and service areas |

The same import job also downloads these CC0 surface and sky assets at mobile-
appropriate resolutions:

| Asset | Planned use |
| --- | --- |
| Asphalt 01 | Road surface PBR maps |
| Concrete Floor 01 | Pavements and walkways |
| Sparse Grass | Natural ground surface |
| Modern Buildings (HDRI) | City sky and ambient lighting |

All Poly Haven models, textures and HDRIs are CC0 1.0 and may be used in commercial projects.
Poly Haven's API terms ask products built using its live API to make the source
clear to users. UCENO will include a Poly Haven credit in its in-app credits.
The API is used only in the development-time import workflow; the shipped game
will not make runtime requests to Poly Haven.

Each downloaded model folder contains an asset-manifest.json recording its
source, author, licence, chosen format, texture resolution, and downloaded files.
The downloader prefers FBX for Unity's native importer and falls back to glTF.

## Unity import layout

- Assets/UCENO/Characters/Imported/ — imported character FBX files.
- Assets/UCENO/Environment/Imported/Models/ — source environment models.
- Assets/UCENO/Environment/Imported/Textures/ — road, pavement and grass PBR maps.
- Assets/UCENO/Environment/Imported/HDRI/ — city sky environment.
- Assets/UCENO/Prefabs/Characters/ — Unity prefabs and controllers created from
  imported rigged characters.
- Assets/UCENO/Prefabs/Environment/ — reusable environment prefabs.

Character imports are configured as Unity Humanoid rigs. Environment assets use
mesh optimisation and medium mesh compression. Before the first Android build,
the actual scene must be assembled from these imported models, colliders and
materials, then compiled and checked on a physical device.

## Replacement policy

Keep gameplay scripts independent of model hierarchy. Avatar replacement must
preserve the Humanoid rig contract and animator parameters. Environment
replacement must preserve prefab-level collision and interaction components.
Never replace imported files in place without checking their licence and updating
the relevant asset manifest.
