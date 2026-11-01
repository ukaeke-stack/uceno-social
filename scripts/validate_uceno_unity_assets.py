#!/usr/bin/env python3
"""Static validation for the UCENO Unity imported-asset scene foundation.

This intentionally does not invoke Unity, create a build, or produce an APK.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT = Path("unity/UCENOVirtualWorld")
ASSETS = PROJECT / "Assets/UCENO"
IMPORTED = ASSETS / "Environment/Imported"
MAX_FILE_BYTES = 100 * 1024 * 1024
MAX_IMPORTED_BYTES = 350 * 1024 * 1024

REQUIRED_FILES = [
    ASSETS / "Characters/Imported/UCENO_Default_Avatar.fbx",
    ASSETS / "Documentation/Ara3DGen/ASSETS_LICENSE.txt",
    ASSETS / "Documentation/FREE_ASSET_MANIFEST.md",
    ASSETS / "Editor/FreeAssetWorldSceneBuilder.cs",
    ASSETS / "Editor/FreeAssetModelPostprocessor.cs",
    ASSETS / "Editor/FreeAssetTexturePostprocessor.cs",
    ASSETS / "Editor/StarterSceneBuilder.cs",
    ASSETS / "Scripts/PlayerMotor.cs",
    ASSETS / "Scripts/FollowCamera.cs",
    ASSETS / "Scripts/AvatarLocomotionDriver.cs",
    ASSETS / "Scripts/WorldStatusHud.cs",
    ASSETS / "Scripts/WorldSessionClient.cs",
    ASSETS / "Scripts/WorldPresenceClient.cs",
    IMPORTED / "HDRI/modern_buildings_1k.hdr",
    IMPORTED / "Models/modular_urban_apartments_facade/modular_urban_apartments_facade.fbx",
    IMPORTED / "Models/modular_factory_facade/modular_factory_facade.fbx",
    IMPORTED / "Models/street_lamp_01/street_lamp_01.fbx",
    IMPORTED / "Models/pachira_aquatica_01/pachira_aquatica_01.fbx",
    IMPORTED / "Models/shrub_02/shrub_02.fbx",
    IMPORTED / "Models/shrub_03/shrub_03.fbx",
    IMPORTED / "Models/covered_car/covered_car.fbx",
    IMPORTED / "Models/modular_chainlink_fence/modular_chainlink_fence.fbx",
]

REQUIRED_TEXTURES = [
    IMPORTED / "Textures/asphalt_01/asphalt_01_diff.jpg",
    IMPORTED / "Textures/asphalt_01/asphalt_01_nor_gl.png",
    IMPORTED / "Textures/asphalt_01/asphalt_01_ao.jpg",
    IMPORTED / "Textures/concrete_floor_01/concrete_floor_01_diff.jpg",
    IMPORTED / "Textures/concrete_floor_01/concrete_floor_01_nor_gl.png",
    IMPORTED / "Textures/sparse_grass/sparse_grass_diff.jpg",
    IMPORTED / "Textures/sparse_grass/sparse_grass_nor_gl.png",
]


def fail(message: str):
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError as error:
        fail(f"Cannot read {path}: {error}")


def check_manifests() -> tuple[int, int]:
    manifests = sorted(IMPORTED.rglob("asset-manifest.json"))
    if len(manifests) < 10:
        fail(f"Expected model, texture and HDRI manifests; found only {len(manifests)}")

    checked_files = 0
    total_bytes = 0
    for manifest_path in manifests:
        try:
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            fail(f"Invalid asset manifest {manifest_path}: {error}")

        if data.get("license") != "CC0 1.0":
            fail(f"Non-CC0 or missing licence in {manifest_path}")
        if not str(data.get("source", "")).startswith("https://polyhaven.com/a/"):
            fail(f"Missing Poly Haven source URL in {manifest_path}")

        folder = manifest_path.parent
        listed = data.get("files") or data.get("maps") or ([data["file"]] if data.get("file") else [])
        if not listed:
            fail(f"No downloaded files recorded in {manifest_path}")

        for relative in listed:
            path = folder / relative
            if not path.is_file():
                fail(f"Manifest file is missing: {path}")
            size = path.stat().st_size
            if size >= MAX_FILE_BYTES:
                fail(f"File exceeds GitHub's 100 MB limit: {path} ({size} bytes)")
            checked_files += 1
            total_bytes += size

    if total_bytes > MAX_IMPORTED_BYTES:
        fail(f"Imported environment assets exceed 350 MB ({total_bytes} bytes)")
    return len(manifests), checked_files


def main():
    missing = [path for path in REQUIRED_FILES + REQUIRED_TEXTURES if not path.is_file()]
    if missing:
        fail("Required source assets are missing:\n - " + "\n - ".join(map(str, missing)))

    for path in REQUIRED_FILES + REQUIRED_TEXTURES:
        if path.stat().st_size >= MAX_FILE_BYTES:
            fail(f"File exceeds GitHub's 100 MB limit: {path}")

    placeholder_paths = [
        ASSETS / "Scripts/WorldBootstrap.cs",
        ASSETS / "Scripts/ProceduralAvatar.cs",
    ]
    leftovers = [path for path in placeholder_paths if path.exists()]
    if leftovers:
        fail("Procedural placeholder scripts still exist: " + ", ".join(map(str, leftovers)))

    manifest_path = PROJECT / "Packages/manifest.json"
    try:
        package_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"Invalid Unity package manifest: {error}")
    if "com.unity.cloud.gltfast" in package_manifest.get("dependencies", {}):
        fail("Unused glTFast package should not be included; all selected models are FBX.")

    builder = read_text(ASSETS / "Editor/FreeAssetWorldSceneBuilder.cs")
    for required in (
        "UCENO_Default_Avatar.fbx",
        "modular_urban_apartments_facade.fbx",
        "modular_factory_facade.fbx",
        "modern_buildings_1k.hdr",
        "Textures/asphalt_01",
        "Textures/concrete_floor_01",
        "Textures/sparse_grass",
        "AnimatorController",
        "BlendTree",
        "BuildFailedException",
    ):
        if required not in builder:
            fail(f"Scene builder is missing required integration marker: {required}")

    starter = read_text(ASSETS / "Editor/StarterSceneBuilder.cs")
    if "FreeAssetWorldSceneBuilder.CreateStarterScene()" not in starter:
        fail("StarterSceneBuilder does not invoke the realistic city scene builder.")

    motor = read_text(ASSETS / "Scripts/PlayerMotor.cs")
    if "AnimationSpeed" not in motor or "SetSprinting" not in motor:
        fail("PlayerMotor is missing animation/sprint integration.")

    camera = read_text(ASSETS / "Scripts/FollowCamera.cs")
    if "Physics.SphereCast" not in camera:
        fail("FollowCamera is missing city-geometry collision handling.")
    if "previousPinchDistance" not in camera or "maximumDistance" not in camera:
        fail("FollowCamera is missing bounded pinch/wheel zoom controls.")

    avatar = read_text(ASSETS / "Scripts/AvatarLocomotionDriver.cs")
    if "TriggerWave" not in avatar or "TriggerCheer" not in avatar:
        fail("Avatar wave/cheer gesture actions are missing.")

    hud = read_text(ASSETS / "Scripts/WorldStatusHud.cs")
    if "GUI.Button" not in hud or "Position:" not in hud or '"JUMP"' not in hud or '"RUN"' not in hud or '"WAVE"' not in hud or '"CHEER"' not in hud:
        fail("World status HUD, mobile jump control, or sprint control is missing.")

    session = read_text(ASSETS / "Scripts/WorldSessionClient.cs")
    if session.count("public string ApiBaseUrl") != 1:
        fail("WorldSessionClient must expose exactly one ApiBaseUrl property.")
    if "SetRenewedSession" not in session or "AccessToken = token" not in session:
        fail("WorldSessionClient is missing the in-memory renewed-token setter.")

    presence = read_text(ASSETS / "Scripts/WorldPresenceClient.cs")
    if "Time.time >= tokenExpiresAt - 45f" not in presence:
        fail("WorldPresenceClient is missing early world-token renewal.")
    if "session.SetRenewedSession(response.accessToken, response.expiresInSeconds)" not in presence:
        fail("WorldPresenceClient does not install the renewed bearer token.")
    if "float.PositiveInfinity" in presence:
        fail("WorldPresenceClient contains a disabled token-renewal guard.")
    if "public int PeerCount" not in presence or "ConnectionStatus" not in presence:
        fail("WorldPresenceClient is missing multiplayer connection status.")
    if "maxVisiblePeerDistance = 110f" not in presence or "maxRemoteAvatars = 12" not in presence:
        fail("WorldPresenceClient is missing mobile remote-avatar visibility limits.")
    if "presence.PeerCount" not in hud or "presence.ConnectionStatus" not in hud:
        fail("World status HUD does not display multiplayer connection status.")

    if "RequestJump" not in motor or "KeyCode.Space" not in motor or "jumpHeight" not in motor:
        fail("Player jump action is missing keyboard/mobile input or grounded jump physics.")
    if "ToggleSeated" not in motor or "IsSeated" not in motor or "KeyCode.C" not in motor:
        fail("Player seated/rest state or desktop toggle is missing.")
    if "motor.IsSeated" not in avatar or "92f" not in avatar:
        fail("Humanoid seated/rest pose is missing.")
    if '"SIT"' not in hud or '"STAND"' not in hud or "GetSeatControlRect" not in hud:
        fail("Mobile sit/stand control is missing.")

    manifests, listed_files = check_manifests()
    total_required = sum(path.stat().st_size for path in REQUIRED_FILES + REQUIRED_TEXTURES)
    print("UCENO Unity source asset validation passed.")
    print(f"- Required source files: {len(REQUIRED_FILES) + len(REQUIRED_TEXTURES)}")
    print(f"- CC0 asset manifests: {manifests}")
    print(f"- Manifest-listed files checked: {listed_files}")
    print(f"- Required source file bytes: {total_required}")
    print("- Procedural avatar/environment placeholders: absent")
    print("- Unity compilation, rendering and Android runtime: NOT tested by this check")


if __name__ == "__main__":
    main()
