#!/usr/bin/env python3
"""Check the Unity humanoid-animation release-gate source without claiming assets exist."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "unity/UCENOVirtualWorld/Assets/UCENO"
VALIDATOR = ASSETS / "Editor/HumanoidAnimationLibraryValidator.cs"
README = ASSETS / "Animations/Imported/README.md"
ANIMATION_ROOT = ASSETS / "Animations/Imported"
BASE_AVATAR = ASSETS / "Characters/Imported/UCENO_Default_Avatar.fbx"

def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit("UCENO humanoid animation source contract failed: " + message)

if not VALIDATOR.is_file() or not README.is_file():
    raise SystemExit("UCENO humanoid animation validator or import instructions are missing.")

source = VALIDATOR.read_text(encoding="utf-8")
guide = README.read_text(encoding="utf-8")
for token in (
    'AnimationType.Human',
    'AvatarSetup.CopyFromOther',
    'importer.sourceAvatar != baseAvatar',
    'AssetDatabase.LoadAllAssetsAtPath(path)',
    'OfType<AnimationClip>()',
    'clip.length <= 0f',
    'clip.isLooping',
    'name.Contains("talk")',
    'idle', 'walk', 'run', 'talk', 'turn', 'wave', 'cheer', 'dance', 'interact', 'sit',
):
    require(token in source, "validator is missing requirement: " + token)

for token in (
    "Rig > Animation Type",
    "Copy From Other Avatar",
    "Preview each clip on the UCENO base Avatar",
    "foot sliding",
    "in-motion visual review on Android",
):
    require(token in guide, "import/retarget/visual-review guide is missing: " + token)

fbxs = sorted(p for p in ANIMATION_ROOT.rglob("*.fbx") if p.is_file())
base_exists = BASE_AVATAR.is_file()
print("UCENO humanoid animation source contract passed.")
print("- Validator checks actual imported AnimationClip sub-assets and Humanoid retargeting.")
print(f"- UCENO base avatar FBX present: {'yes' if base_exists else 'no'}")
print(f"- Imported animation FBX files currently present: {len(fbxs)}")
if not fbxs:
    print("STATUS: INCOMPLETE — no licensed animation FBXs are present; no animation library or visual acceptance is claimed.")
else:
    print("STATUS: ASSETS FOUND — Unity import, retarget validation and in-motion Android review are still required.")
