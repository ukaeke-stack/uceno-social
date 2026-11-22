#!/usr/bin/env python3
"""Check Unity's humanoid-animation release-gate source without claiming assets exist."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "unity/UCENOVirtualWorld/Assets/UCENO"
VALIDATOR = ASSETS / "Editor/HumanoidAnimationLibraryValidator.cs"
README = ASSETS / "Animations/Imported/README.md"
LOCOMOTION = ASSETS / "Scripts/AvatarLocomotionDriver.cs"
CROWD_LOD = ASSETS / "Scripts/AvatarCrowdLod.cs"
APPEARANCE = ASSETS / "Scripts/AvatarAppearanceProfile.cs"
WARDROBE_HUD = ASSETS / "Scripts/AvatarWardrobeHud.cs"
WARDROBE_CONTROLLER = ASSETS / "Scripts/AvatarWardrobeController.cs"
WARDROBE_CATALOG = ASSETS / "Scripts/AvatarWardrobeCatalog.cs"
WARDROBE_SYNC = ASSETS / "Scripts/AvatarWardrobeSyncClient.cs"
EXPRESSIONS = ASSETS / "Scripts/AvatarSocialExpressionDriver.cs"
ANIMATION_ROOT = ASSETS / "Animations/Imported"
BASE_AVATAR = ASSETS / "Characters/Imported/UCENO_Default_Avatar.fbx"
MANIFEST = ANIMATION_ROOT / "animation-source-manifest.json"

def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit("UCENO humanoid animation source contract failed: " + message)

if not all(path.is_file() for path in (VALIDATOR, README, LOCOMOTION, CROWD_LOD, EXPRESSIONS, APPEARANCE, WARDROBE_HUD, WARDROBE_CONTROLLER, WARDROBE_CATALOG, WARDROBE_SYNC)):
    raise SystemExit("UCENO humanoid animation validator, runtime drivers or import instructions are missing.")

source = VALIDATOR.read_text(encoding="utf-8")
guide = README.read_text(encoding="utf-8")
locomotion = LOCOMOTION.read_text(encoding="utf-8")
crowd_lod = CROWD_LOD.read_text(encoding="utf-8")
expressions = EXPRESSIONS.read_text(encoding="utf-8")
appearance = APPEARANCE.read_text(encoding="utf-8")
wardrobe_hud = WARDROBE_HUD.read_text(encoding="utf-8")
wardrobe_controller = WARDROBE_CONTROLLER.read_text(encoding="utf-8")
wardrobe_catalog = WARDROBE_CATALOG.read_text(encoding="utf-8")
wardrobe_sync = WARDROBE_SYNC.read_text(encoding="utf-8")
for token in (
    "AnimationType.Human",
    "AvatarSetup.CopyFromOther",
    "importer.sourceAvatar != baseAvatar",
    "AssetDatabase.LoadAllAssetsAtPath(path)",
    "AssetDatabase.LoadAllAssetsAtPath(BaseAvatarPath)",
    "baseAvatarClips",
    "OfType<AnimationClip>()",
    "clip.length <= 0f",
    "!clip.humanMotion",
    "AnimationUtility.GetCurveBindings(clip)",
    "clip.isLooping",
    "animation-source-manifest.json",
    "sourceUrl",
    "license",
    "attribution",
    "Uri.TryCreate(record.sourceUrl, UriKind.Absolute, out Uri sourceUri)",
    "sourceUri.Scheme != Uri.UriSchemeHttps",
    'record.sourceFbx.StartsWith(AnimationRoot + "/", StringComparison.Ordinal)',
    "new HashSet<string>(provenance.Keys, StringComparer.Ordinal).SetEquals(importedPaths)",
    "idle", "walk", "run", "talk", "turn", "wave", "cheer", "dance", "interact", "sit",
):
    require(token in source, "validator is missing requirement: " + token)

for token in (
    "Rig > Animation Type",
    "Copy From Other Avatar",
    "Preview every clip on the UCENO base Avatar",
    "foot sliding",
    "in-motion visual review on Android",
    "animation-source-manifest.json",
    "sourceUrl",
    "license",
    "attribution",
):
    require(token in guide, "import/retarget/visual-review guide is missing: " + token)

for token in (
    'Animator.StringToHash("MoveSpeed")',
    'Animator.StringToHash("IsSeated")',
    'Animator.StringToHash("IsTalking")',
    "motor.AnimationSpeed",
    "networkSprinting = sprinting",
    "networkSprinting ? Mathf.Max(networkSpeed, 0.75f) : Mathf.Min(networkSpeed, 0.7f)",
    "bool validController = true",
    "validController &= RequireParameter",
    "if (!validController)",
    "ApplyRemoteState(float speed, bool seated, bool sprinting, string gesture, int sequence)",
    "SetTalking(bool talking)",
    "TriggerWave()", "TriggerCheer()", "TriggerDance()", "TriggerTurn()", "TriggerInteract()",
    "animator.avatar.isHuman",
    "animator.runtimeAnimatorController == null",
    "Procedural locomotion is disabled",
    "private bool RequireParameter(string parameterName, AnimatorControllerParameterType type)",
):
    require(token in locomotion, "runtime locomotion/gesture driver is missing: " + token)

for token in (
    "fullDetailDistance", "crowdDetailDistance", "renderDistance",
    "AnimatorCullingMode.AlwaysAnimate",
    "AnimatorCullingMode.CullUpdateTransforms",
    "meshLodGroup.GetLODs().Length < 3",
    "animator.enabled = visible",
):
    require(token in crowd_lod, "human/AI crowd LOD policy is missing: " + token)

for token in (
    "HumanBodyBones.Head", "SetLookTarget(Transform target)",
    "CacheBlinkChannels()", "UpdateHeadLook()", "UpdateBlink()",
):
    require(token in expressions, "social expression driver is missing: " + token)

for token in (
    "MaterialPropertyBlock",
    "private readonly MaterialPropertyBlock propertyBlock",
    "private readonly List<Renderer> rendererBuffer",
    "private readonly List<Material> materialSlots",
    "GetComponentsInChildren(true, rendererBuffer)",
    "renderer.GetSharedMaterials(materialSlots)",
    "renderer.GetPropertyBlock(propertyBlock, slot)",
    "renderer.SetPropertyBlock(propertyBlock, slot)",
):
    require(token in appearance, "avatar appearance profile is missing allocation-safe tinting: " + token)
apply_body = appearance.split("public void Apply(Palette next)", 1)[1].split("private static bool TryResolveColor", 1)[0]
require("new MaterialPropertyBlock()" not in apply_body and
        "GetComponentsInChildren<Renderer>" not in apply_body and
        "renderer.sharedMaterials" not in apply_body,
        "avatar appearance Apply must reuse its property block rather than allocate per material slot")

for token in (
    "inventoryBySlot",
    "RebuildInventoryIndex()",
    "items.Clear()",
    "inventoryBySlot.TryGetValue(item.slot",
):
    require(token in wardrobe_hud, "wardrobe inventory is missing cached slot indexing: " + token)
for token in (
    "Addressables.LoadAssetAsync<GameObject>(item.addressableKey)",
    "Addressables.Release(handle)",
    "addressableHandles",
    "TryBindWardrobeInstance",
    "renderer.bones = mappedBones",
    "expectedAssetVersion",
    "item.assetVersion != expectedAssetVersion",
):
    require(token in wardrobe_controller, "wardrobe Addressables loader is missing: " + token)
for token in ("addressableKey", "assetVersion"):
    require(token in wardrobe_catalog, "wardrobe catalogue is missing versioned field: " + token)
require("owned.assetVersion" in wardrobe_sync and
        "controller.EquipAddressable(itemId, owned.prefabKey" in wardrobe_sync,
        "account wardrobe sync must validate the server prefab key and asset version")
get_items_body = wardrobe_hud.split("private List<WardrobeInventoryItem> GetItems", 1)[1].split("private void EnsureStyles", 1)[0]
require("new List<WardrobeInventoryItem>" not in get_items_body,
        "wardrobe HUD must not allocate a new inventory list on every GUI frame")

fbxs = sorted(p for p in ANIMATION_ROOT.rglob("*.fbx") if p.is_file())
base_exists = BASE_AVATAR.is_file()
manifest_exists = MANIFEST.is_file()
print("UCENO humanoid animation source contract passed.")
print("- Validator checks actual imported AnimationClip sub-assets, Humanoid motion curves and exact base-Avatar retargeting.")
print("- Runtime contract checks imported-Animator locomotion, replicated gesture entry points, facial expression hooks and three-tier crowd LOD.")
print(f"- UCENO base avatar FBX present: {'yes' if base_exists else 'no'}")
print(f"- Imported animation FBX files currently present: {len(fbxs)}")
print(f"- Animation provenance manifest present: {'yes' if manifest_exists else 'no'}")
if not fbxs:
    print("STATUS: INCOMPLETE — no licensed animation FBXs are present; no animation library or visual acceptance is claimed.")
elif not manifest_exists:
    print("STATUS: INCOMPLETE — animation FBXs exist without a verified source/licence manifest.")
else:
    print("STATUS: ASSETS FOUND — Unity import, retarget validation and in-motion Android review are still required.")
