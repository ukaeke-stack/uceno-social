#if UNITY_EDITOR
using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace UCENO.VirtualWorld.Editor
{
    /// <summary>
    /// Builds the playable city scene from imported, licensed source models.
    /// It deliberately fails if any required real asset is missing; it never
    /// falls back to primitive buildings or a procedural avatar.
    /// </summary>
    public static class FreeAssetWorldSceneBuilder
    {
        private const string ScenePath = "Assets/UCENO/Scenes/UCENO_Starter_World.unity";
        private const string AvatarPath = "Assets/UCENO/Characters/Imported/UCENO_Default_Avatar.fbx";
        private const string EnvironmentRoot = "Assets/UCENO/Environment/Imported";
        private const string PrefabRoot = "Assets/UCENO/Prefabs";
        private const string MaterialRoot = "Assets/UCENO/Materials";
        private const string AnimationRoot = "Assets/UCENO/Animations";

        private static readonly string[] RequiredModels =
        {
            "Models/modular_urban_apartments_facade/modular_urban_apartments_facade.fbx",
            "Models/modular_factory_facade/modular_factory_facade.fbx",
            "Models/street_lamp_01/street_lamp_01.fbx",
            "Models/pachira_aquatica_01/pachira_aquatica_01.fbx",
            "Models/shrub_02/shrub_02.fbx",
            "Models/shrub_03/shrub_03.fbx",
            "Models/covered_car/covered_car.fbx",
            "Models/modular_chainlink_fence/modular_chainlink_fence.fbx"
        };

        public static void CreateStarterScene()
        {
            ValidateSourceAssets();
            EnsureFolder("Assets/UCENO/Scenes");
            EnsureFolder(PrefabRoot);
            EnsureFolder(PrefabRoot + "/Characters");
            EnsureFolder(PrefabRoot + "/Environment");
            EnsureFolder(MaterialRoot);
            EnsureFolder(AnimationRoot);

            Material asphalt = CreatePbrMaterial(
                "UCENO_Asphalt", "Textures/asphalt_01", new Color(0.34f, 0.35f, 0.36f),
                new Vector2(4f, 34f), 0.18f);
            Material concrete = CreatePbrMaterial(
                "UCENO_Concrete", "Textures/concrete_floor_01", new Color(0.62f, 0.61f, 0.58f),
                new Vector2(3f, 34f), 0.22f);
            Material grass = CreatePbrMaterial(
                "UCENO_Grass", "Textures/sparse_grass", new Color(0.78f, 0.82f, 0.72f),
                new Vector2(16f, 16f), 0.12f);
            Material grassVerge = CreatePbrMaterial(
                "UCENO_Grass_Verge", "Textures/sparse_grass", new Color(0.78f, 0.82f, 0.72f),
                new Vector2(2f, 12f), 0.12f);
            Material laneMarking = CreateSimpleMaterial("UCENO_Road_Marking", Color.white);
            Material centreMarking = CreateSimpleMaterial("UCENO_Centre_Marking", new Color(1f, 0.78f, 0.16f));
            Material skybox = CreateCitySkybox();

            GameObject avatarPrefab = CreateAvatarPrefab();
            GameObject apartmentPrefab = CreateModelPrefab(
                "Models/modular_urban_apartments_facade/modular_urban_apartments_facade.fbx",
                "UCENO_Apartment_Facade", true);
            GameObject factoryPrefab = CreateModelPrefab(
                "Models/modular_factory_facade/modular_factory_facade.fbx",
                "UCENO_Factory_Facade", true);
            GameObject lampPrefab = CreateModelPrefab(
                "Models/street_lamp_01/street_lamp_01.fbx",
                "UCENO_Street_Lamp", true);
            GameObject pachiraPrefab = CreateModelPrefab(
                "Models/pachira_aquatica_01/pachira_aquatica_01.fbx",
                "UCENO_Pachira_Plant", true);
            GameObject shrub02Prefab = CreateModelPrefab(
                "Models/shrub_02/shrub_02.fbx",
                "UCENO_Shrub_02", true);
            GameObject shrub03Prefab = CreateModelPrefab(
                "Models/shrub_03/shrub_03.fbx",
                "UCENO_Shrub_03", true);
            GameObject carPrefab = CreateModelPrefab(
                "Models/covered_car/covered_car.fbx",
                "UCENO_Covered_Car", true);
            GameObject fencePrefab = CreateModelPrefab(
                "Models/modular_chainlink_fence/modular_chainlink_fence.fbx",
                "UCENO_Chainlink_Fence", true);

            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            GameObject world = new GameObject("UCENO Realistic City Block");
            Transform worldRoot = world.transform;

            BuildGroundAndRoad(worldRoot, asphalt, concrete, grass, grassVerge, laneMarking, centreMarking);
            BuildCityObjects(
                worldRoot,
                apartmentPrefab, factoryPrefab, lampPrefab,
                pachiraPrefab, shrub02Prefab, shrub03Prefab,
                carPrefab, fencePrefab);
            ConfigureLighting(skybox);

            GameObject player = BuildPlayer(worldRoot, avatarPrefab);
            BuildCamera(player.transform);

            EditorSceneManager.MarkSceneDirty(scene);
            if (!EditorSceneManager.SaveScene(scene, ScenePath))
                throw new BuildFailedException("UCENO city scene could not be saved.");

            RegisterSceneInBuildSettings(ScenePath);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log("UCENO realistic city scene generated from imported free assets.");
        }

        private static void ValidateSourceAssets()
        {
            string[] missing = RequiredModels
                .Select(path => EnvironmentRoot + "/" + path)
                .Where(path => AssetDatabase.LoadAssetAtPath<GameObject>(path) == null)
                .ToArray();

            if (AssetDatabase.LoadAssetAtPath<GameObject>(AvatarPath) == null)
                missing = missing.Concat(new[] { AvatarPath }).ToArray();

            string hdriPath = EnvironmentRoot + "/HDRI/modern_buildings_1k.hdr";
            if (AssetDatabase.LoadAssetAtPath<Texture2D>(hdriPath) == null)
                missing = missing.Concat(new[] { hdriPath }).ToArray();

            foreach (string textureFolder in new[] { "asphalt_01", "concrete_floor_01", "sparse_grass" })
            {
                string diffusePath = EnvironmentRoot + "/Textures/" + textureFolder + "/" + textureFolder + "_diff.jpg";
                string normalPath = EnvironmentRoot + "/Textures/" + textureFolder + "/" + textureFolder + "_nor_gl.png";
                if (AssetDatabase.LoadAssetAtPath<Texture2D>(diffusePath) == null)
                    missing = missing.Concat(new[] { diffusePath }).ToArray();
                if (AssetDatabase.LoadAssetAtPath<Texture2D>(normalPath) == null)
                    missing = missing.Concat(new[] { normalPath }).ToArray();
            }

            if (missing.Length > 0)
            {
                throw new BuildFailedException(
                    "The realistic UCENO scene is blocked because required imported assets are missing:\n - " +
                    string.Join("\n - ", missing));
            }
        }

        private static Material CreatePbrMaterial(
            string materialName,
            string textureFolder,
            Color baseColor,
            Vector2 tiling,
            float glossiness)
        {
            string folder = EnvironmentRoot + "/" + textureFolder;
            Texture2D diffuse = AssetDatabase.LoadAssetAtPath<Texture2D>(folder + "/" + Path.GetFileName(textureFolder) + "_diff.jpg");
            Texture2D normal = AssetDatabase.LoadAssetAtPath<Texture2D>(folder + "/" + Path.GetFileName(textureFolder) + "_nor_gl.png");
            Texture2D ao = AssetDatabase.LoadAssetAtPath<Texture2D>(folder + "/" + Path.GetFileName(textureFolder) + "_ao.jpg");

            string materialPath = MaterialRoot + "/" + materialName + ".mat";
            Material material = AssetDatabase.LoadAssetAtPath<Material>(materialPath);
            if (material == null)
            {
                material = new Material(RequireShader("Standard"));
                AssetDatabase.CreateAsset(material, materialPath);
            }

            material.shader = RequireShader("Standard");
            material.color = baseColor;
            material.SetTexture("_MainTex", diffuse);
            material.SetTextureScale("_MainTex", tiling);
            if (normal != null)
            {
                material.SetTexture("_BumpMap", normal);
                material.EnableKeyword("_NORMALMAP");
            }
            if (ao != null)
            {
                material.SetTexture("_OcclusionMap", ao);
                material.SetFloat("_OcclusionStrength", 0.65f);
                material.EnableKeyword("_OCCLUSIONMAP");
            }
            material.SetFloat("_Glossiness", glossiness);
            material.SetFloat("_Metallic", 0f);
            EditorUtility.SetDirty(material);
            return material;
        }

        private static Material CreateSimpleMaterial(string name, Color color)
        {
            string path = MaterialRoot + "/" + name + ".mat";
            Material material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null)
            {
                material = new Material(RequireShader("Standard"));
                AssetDatabase.CreateAsset(material, path);
            }
            material.color = color;
            material.SetFloat("_Glossiness", 0.05f);
            material.SetFloat("_Metallic", 0f);
            EditorUtility.SetDirty(material);
            return material;
        }

        private static Material CreateCitySkybox()
        {
            string hdriPath = EnvironmentRoot + "/HDRI/modern_buildings_1k.hdr";
            Texture2D hdri = AssetDatabase.LoadAssetAtPath<Texture2D>(hdriPath);
            string path = MaterialRoot + "/UCENO_City_Skybox.mat";
            Material material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null)
            {
                Shader shader = RequireShader("Skybox/Panoramic");
                material = new Material(shader);
                AssetDatabase.CreateAsset(material, path);
            }
            material.shader = RequireShader("Skybox/Panoramic");
            material.SetTexture("_MainTex", hdri);
            material.SetFloat("_Exposure", 1f);
            material.SetFloat("_Rotation", 0f);
            EditorUtility.SetDirty(material);
            return material;
        }

        private static GameObject CreateAvatarPrefab()
        {
            AnimationClip[] clips = AssetDatabase.LoadAllAssetsAtPath(AvatarPath)
                .OfType<AnimationClip>()
                .Where(clip => clip != null && clip.length > 0.01f)
                .ToArray();

            AnimationClip idle = FindClip(clips, "idle", "stand");
            AnimationClip walk = FindClip(clips, "walk");
            AnimationClip run = FindClip(clips, "run");
            if (idle == null || walk == null || run == null)
            {
                string names = string.Join(", ", clips.Select(clip => clip.name));
                throw new BuildFailedException(
                    "The imported Humanoid FBX must contain Idle, Walk and Run clips. Found: " + names);
            }

            Avatar avatar = AssetDatabase.LoadAllAssetsAtPath(AvatarPath)
                .OfType<Avatar>()
                .FirstOrDefault(candidate => candidate != null && candidate.isHuman);
            if (avatar == null)
                throw new BuildFailedException("UCENO_Default_Avatar.fbx did not import as a valid Unity Humanoid.");

            AnimatorController controller = CreateLocomotionController(idle, walk, run);
            GameObject source = AssetDatabase.LoadAssetAtPath<GameObject>(AvatarPath);
            GameObject wrapper = new GameObject("UCENO Default Humanoid");
            GameObject model = UnityEngine.Object.Instantiate(source);
            model.name = "Humanoid Model";
            model.transform.SetParent(wrapper.transform, false);
            Bounds avatarBounds = CalculateLocalBounds(model);
            model.transform.localPosition = new Vector3(0f, -avatarBounds.min.y, 0f);

            Animator animator = model.GetComponent<Animator>();
            if (animator == null)
                animator = model.AddComponent<Animator>();
            animator.avatar = avatar;
            animator.runtimeAnimatorController = controller;
            animator.applyRootMotion = false;
            animator.cullingMode = AnimatorCullingMode.CullUpdateTransforms;

            if (model.GetComponent<AvatarLocomotionDriver>() == null)
                model.AddComponent<AvatarLocomotionDriver>();

            string prefabPath = PrefabRoot + "/Characters/UCENO_Default_Avatar.prefab";
            GameObject prefab = PrefabUtility.SaveAsPrefabAsset(wrapper, prefabPath);
            UnityEngine.Object.DestroyImmediate(wrapper);
            if (prefab == null)
                throw new BuildFailedException("Could not save avatar prefab: " + prefabPath);
            return prefab;
        }

        private static AnimationClip FindClip(AnimationClip[] clips, params string[] terms)
        {
            return clips
                .OrderBy(clip => clip.name.Length)
                .FirstOrDefault(clip =>
                {
                    string name = clip.name.ToLowerInvariant();
                    return terms.Any(term => name.Contains(term));
                });
        }

        private static AnimatorController CreateLocomotionController(
            AnimationClip idle,
            AnimationClip walk,
            AnimationClip run)
        {
            string controllerPath = AnimationRoot + "/UCENO_Humanoid_Locomotion.controller";
            if (AssetDatabase.LoadAssetAtPath<AnimatorController>(controllerPath) != null)
                AssetDatabase.DeleteAsset(controllerPath);

            AnimatorController controller = AnimatorController.CreateAnimatorControllerAtPath(controllerPath);
            controller.AddParameter("MoveSpeed", AnimatorControllerParameterType.Float);

            BlendTree tree = new BlendTree
            {
                name = "UCENO Locomotion",
                blendType = BlendTreeType.Simple1D,
                blendParameter = "MoveSpeed",
                useAutomaticThresholds = false
            };
            tree.AddChild(idle, 0f);
            tree.AddChild(walk, 0.5f);
            tree.AddChild(run, 1f);
            AssetDatabase.AddObjectToAsset(tree, controller);

            AnimatorState state = controller.layers[0].stateMachine.AddState("Locomotion");
            state.motion = tree;
            controller.layers[0].stateMachine.defaultState = state;
            EditorUtility.SetDirty(controller);
            AssetDatabase.SaveAssets();
            return controller;
        }

        private static GameObject CreateModelPrefab(string relativeModelPath, string prefabName, bool addCollider)
        {
            string modelPath = EnvironmentRoot + "/" + relativeModelPath;
            GameObject source = AssetDatabase.LoadAssetAtPath<GameObject>(modelPath);
            if (source == null)
                throw new BuildFailedException("Could not load imported environment model: " + modelPath);

            GameObject wrapper = new GameObject(prefabName);
            GameObject model = UnityEngine.Object.Instantiate(source);
            model.name = source.name;
            model.transform.SetParent(wrapper.transform, false);
            Bounds modelBounds = CalculateLocalBounds(model);
            model.transform.localPosition += Vector3.up * -modelBounds.min.y;

            if (addCollider)
                AddEnvironmentCollider(wrapper, prefabName, CalculateLocalBounds(wrapper));

            string prefabPath = PrefabRoot + "/Environment/" + prefabName + ".prefab";
            GameObject prefab = PrefabUtility.SaveAsPrefabAsset(wrapper, prefabPath);
            UnityEngine.Object.DestroyImmediate(wrapper);
            if (prefab == null)
                throw new BuildFailedException("Could not save environment prefab: " + prefabPath);
            return prefab;
        }

        private static void AddEnvironmentCollider(GameObject wrapper, string prefabName, Bounds bounds)
        {
            if (prefabName.Contains("Shrub"))
                return;

            if (prefabName.Contains("Pachira") || prefabName.Contains("Street_Lamp"))
            {
                CapsuleCollider capsule = wrapper.AddComponent<CapsuleCollider>();
                capsule.direction = 1;
                capsule.center = bounds.center;
                capsule.height = Mathf.Max(bounds.size.y, 0.6f);
                capsule.radius = Mathf.Clamp(Mathf.Min(bounds.size.x, bounds.size.z) * 0.12f, 0.12f, 0.42f);
                return;
            }

            BoxCollider box = wrapper.AddComponent<BoxCollider>();
            box.center = bounds.center;
            box.size = Vector3.Max(bounds.size, new Vector3(0.2f, 0.2f, 0.2f));
        }

        private static Bounds CalculateLocalBounds(GameObject root)
        {
            Renderer[] renderers = root.GetComponentsInChildren<Renderer>(true);
            if (renderers.Length == 0)
                return new Bounds(Vector3.zero, Vector3.one);

            bool initialized = false;
            Bounds combined = new Bounds(Vector3.zero, Vector3.zero);
            foreach (Renderer renderer in renderers)
            {
                Bounds worldBounds = renderer.bounds;
                Vector3 min = root.transform.InverseTransformPoint(worldBounds.min);
                Vector3 max = root.transform.InverseTransformPoint(worldBounds.max);
                Bounds localBounds = new Bounds((min + max) * 0.5f, max - min);
                if (!initialized)
                {
                    combined = localBounds;
                    initialized = true;
                }
                else
                {
                    combined.Encapsulate(localBounds.min);
                    combined.Encapsulate(localBounds.max);
                }
            }
            return combined;
        }

        private static void BuildGroundAndRoad(
            Transform parent,
            Material asphalt,
            Material concrete,
            Material grass,
            Material grassVerge,
            Material edgeLine,
            Material centreLine)
        {
            CreatePlane("Grass Terrain", parent, new Vector3(0f, -0.08f, 0f), 180f, 160f, grass);
            CreatePlane("Main Asphalt Road", parent, new Vector3(0f, 0.005f, 0f), 10f, 90f, asphalt);
            CreatePlane("Left Concrete Walkway", parent, new Vector3(-6.25f, 0.02f, 0f), 2.5f, 90f, concrete);
            CreatePlane("Right Concrete Walkway", parent, new Vector3(6.25f, 0.02f, 0f), 2.5f, 90f, concrete);
            CreatePlane("Left Grass Verge", parent, new Vector3(-8.5f, 0.01f, 0f), 2f, 90f, grassVerge);
            CreatePlane("Right Grass Verge", parent, new Vector3(8.5f, 0.01f, 0f), 2f, 90f, grassVerge);

            CreateRoadLine(parent, edgeLine, new Vector3(-4.7f, 0.035f, -45f), new Vector3(-4.7f, 0.035f, 45f), 0.055f);
            CreateRoadLine(parent, edgeLine, new Vector3(4.7f, 0.035f, -45f), new Vector3(4.7f, 0.035f, 45f), 0.055f);
            for (int z = -40; z <= 40; z += 7)
                CreateRoadLine(parent, centreLine, new Vector3(0f, 0.04f, z), new Vector3(0f, 0.04f, z + 3.2f), 0.10f);
        }

        private static void CreatePlane(string name, Transform parent, Vector3 position, float width, float length, Material material)
        {
            GameObject plane = GameObject.CreatePrimitive(PrimitiveType.Plane);
            plane.name = name;
            plane.transform.SetParent(parent, false);
            plane.transform.localPosition = position;
            plane.transform.localScale = new Vector3(width / 10f, 1f, length / 10f);
            plane.GetComponent<Renderer>().sharedMaterial = material;
            SetStaticRecursive(plane);
        }

        private static void CreateRoadLine(Transform parent, Material material, Vector3 start, Vector3 end, float width)
        {
            GameObject lineObject = new GameObject("Road Marking");
            lineObject.transform.SetParent(parent, false);
            lineObject.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
            LineRenderer line = lineObject.AddComponent<LineRenderer>();
            line.useWorldSpace = true;
            line.positionCount = 2;
            line.SetPosition(0, start);
            line.SetPosition(1, end);
            line.startWidth = width;
            line.endWidth = width;
            line.sharedMaterial = material;
            line.alignment = LineAlignment.TransformZ;
            line.numCapVertices = 2;
            SetStaticRecursive(lineObject);
        }

        private static void BuildCityObjects(
            Transform parent,
            GameObject apartment,
            GameObject factory,
            GameObject lamp,
            GameObject pachira,
            GameObject shrub02,
            GameObject shrub03,
            GameObject car,
            GameObject fence)
        {
            Place(apartment, parent, new Vector3(-13.4f, 0f, 0f), Quaternion.Euler(0f, 90f, 0f), Vector3.one * 0.70f);
            Place(factory, parent, new Vector3(13.4f, 0f, 0f), Quaternion.Euler(0f, -90f, 0f), Vector3.one * 0.58f);

            foreach (float z in new[] { 0f })
            {
                Place(lamp, parent, new Vector3(-6.9f, 0f, z), Quaternion.identity, Vector3.one);
                Place(lamp, parent, new Vector3(6.9f, 0f, z), Quaternion.identity, Vector3.one);
            }

            Place(pachira, parent, new Vector3(-8.5f, 0f, 25f), Quaternion.Euler(0f, 25f, 0f), Vector3.one * 0.42f);
            Place(shrub02, parent, new Vector3(8.5f, 0f, -12f), Quaternion.Euler(0f, 130f, 0f), Vector3.one * 0.36f);
            Place(shrub03, parent, new Vector3(-8.5f, 0f, -5f), Quaternion.identity, Vector3.one);
            Place(shrub03, parent, new Vector3(8.5f, 0f, 18f), Quaternion.Euler(0f, 110f, 0f), Vector3.one);

            Place(car, parent, new Vector3(9.2f, 0f, -28f), Quaternion.Euler(0f, 90f, 0f), Vector3.one * 0.9f);
            Place(fence, parent, new Vector3(20.5f, 0f, 0f), Quaternion.Euler(0f, 90f, 0f), Vector3.one * 0.75f);
        }

        private static GameObject Place(
            GameObject prefab,
            Transform parent,
            Vector3 position,
            Quaternion rotation,
            Vector3 scale)
        {
            GameObject instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
            instance.transform.SetParent(parent, false);
            instance.transform.localPosition = position;
            instance.transform.localRotation = rotation;
            instance.transform.localScale = scale;
            SetStaticRecursive(instance);
            return instance;
        }

        private static void ConfigureLighting(Material skybox)
        {
            RenderSettings.skybox = skybox;
            RenderSettings.ambientMode = AmbientMode.Skybox;
            RenderSettings.ambientIntensity = 0.9f;
            RenderSettings.reflectionIntensity = 0.55f;
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = new Color(0.60f, 0.67f, 0.72f);
            RenderSettings.fogStartDistance = 65f;
            RenderSettings.fogEndDistance = 155f;

            GameObject lightObject = new GameObject("City Sun");
            Light sun = lightObject.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.color = new Color(1f, 0.94f, 0.84f);
            sun.intensity = 1.15f;
            sun.shadows = LightShadows.Soft;
            sun.shadowStrength = 0.78f;
            lightObject.transform.rotation = Quaternion.Euler(48f, -32f, 0f);

            QualitySettings.shadowDistance = 45f;
            QualitySettings.shadowResolution = ShadowResolution.Medium;
            QualitySettings.antiAliasing = 2;
            QualitySettings.pixelLightCount = 1;
            QualitySettings.vSyncCount = 0;
            QualitySettings.lodBias = 0.9f;
            QualitySettings.streamingMipmapsActive = true;
        }

        private static GameObject BuildPlayer(Transform parent, GameObject avatarPrefab)
        {
            GameObject player = new GameObject("UCENO Local Player");
            player.transform.SetParent(parent, false);
            player.transform.position = new Vector3(0f, 0.05f, -35f);

            CharacterController characterController = player.AddComponent<CharacterController>();
            characterController.height = 1.84f;
            characterController.radius = 0.33f;
            characterController.center = new Vector3(0f, 0.92f, 0f);
            characterController.slopeLimit = 48f;
            characterController.stepOffset = 0.30f;
            characterController.skinWidth = 0.045f;
            characterController.minMoveDistance = 0f;

            PlayerMotor motor = player.AddComponent<PlayerMotor>();
            SerializedObject motorData = new SerializedObject(motor);
            motorData.FindProperty("spawnPosition").vector3Value = new Vector3(0f, 0.05f, -35f);
            motorData.ApplyModifiedPropertiesWithoutUndo();

            GameObject avatar = (GameObject)PrefabUtility.InstantiatePrefab(avatarPrefab);
            avatar.name = "Player Visual";
            avatar.transform.SetParent(player.transform, false);
            avatar.transform.localPosition = Vector3.zero;
            avatar.transform.localRotation = Quaternion.identity;
            avatar.transform.localScale = Vector3.one;

            WorldStatusHud hud = player.AddComponent<WorldStatusHud>();
            SerializedObject hudData = new SerializedObject(hud);
            hudData.FindProperty("player").objectReferenceValue = motor;
            hudData.ApplyModifiedPropertiesWithoutUndo();
            return player;
        }

        private static void BuildCamera(Transform player)
        {
            GameObject cameraObject = new GameObject("Main Camera");
            cameraObject.tag = "MainCamera";
            Camera camera = cameraObject.AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.Skybox;
            camera.fieldOfView = 62f;
            camera.nearClipPlane = 0.1f;
            camera.farClipPlane = 180f;
            camera.allowHDR = false;
            cameraObject.AddComponent<AudioListener>();

            FollowCamera follow = cameraObject.AddComponent<FollowCamera>();
            follow.SetTarget(player);
            cameraObject.transform.position = player.position + new Vector3(0f, 3f, -6f);
        }

        private static void SetStaticRecursive(GameObject target)
        {
            const StaticEditorFlags flags =
                StaticEditorFlags.BatchingStatic |
                StaticEditorFlags.OccluderStatic |
                StaticEditorFlags.OccludeeStatic;
            GameObjectUtility.SetStaticEditorFlags(target, flags);
            foreach (Transform child in target.transform)
                SetStaticRecursive(child.gameObject);
        }

        private static void RegisterSceneInBuildSettings(string scenePath)
        {
            EditorBuildSettingsScene[] scenes = EditorBuildSettings.scenes;
            if (scenes.Any(scene => scene.path == scenePath))
                return;

            EditorBuildSettings.scenes = scenes
                .Concat(new[] { new EditorBuildSettingsScene(scenePath, true) })
                .ToArray();
        }

        private static Shader RequireShader(string shaderName)
        {
            Shader shader = Shader.Find(shaderName);
            if (shader == null)
                throw new BuildFailedException("Required Unity shader is unavailable: " + shaderName);
            return shader;
        }

        private static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path))
                return;

            string parent = Path.GetDirectoryName(path)?.Replace("\\", "/");
            string folder = Path.GetFileName(path);
            if (!string.IsNullOrEmpty(parent) && !AssetDatabase.IsValidFolder(parent))
                EnsureFolder(parent);
            if (!string.IsNullOrEmpty(parent))
                AssetDatabase.CreateFolder(parent, folder);
        }
    }
}
#endif
