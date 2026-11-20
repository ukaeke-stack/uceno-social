# UCENO Virtual World — replaceable city and avatar content contract

## Objective

City environments, buildings, landmarks, human avatars, clothing, animation sets and visual effects are replaceable content packages. Replacing or upgrading these assets must not require replacing UCENO identity, social graph, world ownership, player progress, homes, businesses, activity records, marketplace records or multiplayer authority.

This contract applies to the first release and every later premium-asset upgrade.

## Stable identity boundary

The following identifiers are gameplay data and must not be derived from a Unity prefab name, hierarchy path, mesh name, asset GUID, bundle filename or vendor catalogue ID:

- City ID and district ID.
- Landmark, building, door, seat, shop, home and interactable IDs.
- User/account ID and avatar appearance profile ID.
- Activity, event, mission, collectible and property IDs.

A visual prefab may be replaced while its logical object ID remains unchanged. If a replacement changes the object's footprint, entrance, collision, navigation or interaction points, it must ship a reviewed mapping/configuration update under the same logical ID. The server remains authoritative for permissions, ownership, state and coordinates.

## City content package

Each city/district package must publish a versioned manifest containing:

- Stable city and district IDs.
- Content schema version and monotonically increasing package version.
- Unity/platform target and minimum client compatibility.
- Addressables catalogue label and immutable bundle/catalogue version.
- Asset paths/addresses, SHA-256 checksums, byte sizes and dependency references.
- Source URL, author, exact asset licence, attribution and redistribution permission.
- LOD inventory, texture dimensions/formats, material/shader requirements.
- Collision, navigation, spawn, doorway and interactable contract versions.
- Migration mappings for any changed logical object anchors.
- Quality/performance profile and validation report reference.

Never overwrite a published bundle at an existing URL. Publish a new immutable version, verify it, then update the catalogue pointer. Retain the previous known-good catalogue for rollback.

## Avatar package

Avatar appearance data is stored independently from the selected visual model. The user profile must retain stable semantic values such as body preset, skin/material parameters, face/customization values, clothing slot IDs and accessory IDs; it must not store Unity object references or vendor-specific prefab paths.

Every replacement avatar package must document and pass:

- Unity Humanoid-compatible skeleton and required bone mapping.
- Agreed scale/origin convention and root-motion policy.
- Required animator parameters and locomotion/action state contract.
- Retargeting validation for idle, walk, run, jump, seated, gestures and activity actions.
- Facial-expression/blendshape mapping or a documented fallback.
- Clothing/accessory attachment slots and compatibility rules.
- Material/shader and texture fallback behavior on supported Android devices.
- LODs, mesh budgets, texture budgets and mobile performance profile.
- License and explicit commercial redistribution rights for the runtime package.

A new avatar vendor or model may change the visual rig internally only if the import/retarget adapter preserves the UCENO animation and customization contract. Account IDs, friendships, permissions and player-owned cosmetics must not change during a model migration.

## Safe rollout

1. Import the candidate into an isolated content package; do not overwrite the live package.
2. Validate its provenance, licence, hashes, compatibility, geometry, LODs, collisions and animation contracts.
3. Build platform-specific Addressables bundles and a new immutable catalogue.
4. Run automated contract tests and visual review on representative low-, mid- and high-tier devices.
5. Publish to a non-production catalogue and test download, cache, reconnect, interrupted download, rollback and mixed-client compatibility.
6. Roll out by city/district or avatar cohort. Keep the previous package available during the rollback window.
7. Promote the catalogue pointer only after acceptance. Preserve all server-side logical IDs and player data.

## Release gates

- A content update cannot change a logical city/district/object ID without an explicit migration.
- A city replacement cannot silently move player-owned homes, shops, event venues or saved interactables.
- An avatar replacement cannot reset appearance profiles, ownership, animation state or account identity.
- Every runtime-delivered asset must have a verified licence that permits commercial use and the intended distribution through UCENO's downloadable content.
- Missing or incompatible optional content must fail safely to the last known-good package; it must not corrupt player data or block account access.
- Android and Web builds must use compatible, separately built platform bundles.
- No asset package is production-ready based only on a source manifest; Unity import, visual review and device performance checks are mandatory.

## Current status

This is an engineering contract, not a claim that the replacement pipeline is already production-verified. Addressables runtime code exists in the project, but package resolution, remote catalogue publication, Unity Editor compilation, visual review and Android device validation remain release gates. The current SolsticeBay GLB import-only workflow is blocked before Unity starts because the GitHub Actions Unity licence secret is not configured. No APK build or production migration is authorized by this document.
