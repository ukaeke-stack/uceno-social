using UnityEngine;
using UnityEngine.Rendering;

namespace UCENO.VirtualWorld
{
    public sealed class WorldBootstrap : MonoBehaviour
    {
        [SerializeField] private bool createDemoEnvironment = true;
        private PlayerMotor localPlayer;
        private static readonly Vector3 PlayerSpawn = new Vector3(0f, 1.15f, 0f);

        private void Start()
        {
            Application.targetFrameRate = 60;
            Screen.sleepTimeout = SleepTimeout.SystemSetting;
            if (!createDemoEnvironment) return;
            CreateGroundAndRoad();
            CreateLandmarks();
            CreatePlayer();
            CreateLighting();
        }

        private void CreateGroundAndRoad()
        {
            GameObject ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.name = "UCENO Grass Terrain";
            ground.transform.localScale = new Vector3(10f, 1f, 10f);
            ApplyMaterial(ground, new Color(0.22f, 0.48f, 0.25f));

            // A broad, explicit box collider provides a reliable walkable
            // surface for Android CharacterController builds.
            GameObject groundCollision = new GameObject("UCENO Ground Collision");
            groundCollision.transform.position = new Vector3(0f, -0.3f, 0f);
            BoxCollider groundBox = groundCollision.AddComponent<BoxCollider>();
            groundBox.size = new Vector3(100f, 0.6f, 100f);

            GameObject road = GameObject.CreatePrimitive(PrimitiveType.Cube);
            road.name = "Central Walkway";
            road.transform.position = new Vector3(0f, 0.035f, 9f);
            road.transform.localScale = new Vector3(5f, 0.07f, 34f);
            ApplyMaterial(road, new Color(0.34f, 0.34f, 0.36f));
            Collider roadCollider = road.GetComponent<Collider>();
            if (roadCollider != null) Destroy(roadCollider);
        }

        private void CreateLandmarks()
        {
            CreateBuilding("Welcome Hall", new Vector3(-8f, 2f, 13f), new Vector3(7f, 4f, 6f), new Color(0.78f, 0.72f, 0.58f));
            CreateBuilding("Community Centre", new Vector3(9f, 2.5f, 20f), new Vector3(8f, 5f, 7f), new Color(0.68f, 0.76f, 0.84f));
            CreateTree(new Vector3(-13f, 0f, 5f));
            CreateTree(new Vector3(-12f, 0f, 17f));
            CreateTree(new Vector3(13f, 0f, 8f));
            CreateTree(new Vector3(14f, 0f, 25f));
            CreateTree(new Vector3(-5f, 0f, 29f));
            CreateTree(new Vector3(6f, 0f, 31f));
            GameObject marker = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            marker.name = "Player Start Marker";
            marker.transform.position = new Vector3(0f, 0.12f, 0f);
            marker.transform.localScale = new Vector3(1.5f, 0.12f, 1.5f);
            ApplyMaterial(marker, new Color(0.95f, 0.72f, 0.12f));
            Collider markerCollider = marker.GetComponent<Collider>();
            if (markerCollider != null) Destroy(markerCollider);
        }

        private static void CreateBuilding(string name, Vector3 position, Vector3 scale, Color color)
        {
            GameObject building = GameObject.CreatePrimitive(PrimitiveType.Cube);
            building.name = name;
            building.transform.position = position;
            building.transform.localScale = scale;
            ApplyMaterial(building, color);
            GameObject roof = GameObject.CreatePrimitive(PrimitiveType.Cube);
            roof.name = name + " Roof";
            roof.transform.position = position + Vector3.up * (scale.y * 0.5f + 0.25f);
            roof.transform.localScale = new Vector3(scale.x + 0.5f, 0.5f, scale.z + 0.5f);
            ApplyMaterial(roof, new Color(0.32f, 0.20f, 0.16f));
        }

        private static void CreateTree(Vector3 position)
        {
            GameObject trunk = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            trunk.name = "Tree Trunk";
            trunk.transform.position = position + Vector3.up * 1.1f;
            trunk.transform.localScale = new Vector3(0.35f, 1.1f, 0.35f);
            ApplyMaterial(trunk, new Color(0.34f, 0.20f, 0.10f));
            GameObject canopy = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            canopy.name = "Tree Canopy";
            canopy.transform.position = position + Vector3.up * 3f;
            canopy.transform.localScale = new Vector3(2.2f, 2.4f, 2.2f);
            ApplyMaterial(canopy, new Color(0.12f, 0.38f, 0.16f));
        }

        private void CreatePlayer()
        {
            GameObject player = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            player.name = "UCENO Local Player";
            player.transform.position = PlayerSpawn;
            ApplyMaterial(player, new Color(0.08f, 0.30f, 0.95f));
            Collider primitiveCollider = player.GetComponent<Collider>();
            if (primitiveCollider != null) Destroy(primitiveCollider);
            CharacterController controller = player.AddComponent<CharacterController>();
            controller.height = 2f;
            controller.radius = 0.45f;
            controller.center = Vector3.zero;
            controller.skinWidth = 0.08f;
            controller.minMoveDistance = 0f;
            GameObject head = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            head.name = "Player Head";
            head.transform.SetParent(player.transform, false);
            head.transform.localPosition = new Vector3(0f, 0.78f, 0f);
            head.transform.localScale = new Vector3(0.58f, 0.58f, 0.58f);
            ApplyMaterial(head, new Color(0.88f, 0.66f, 0.48f));
            Collider headCollider = head.GetComponent<Collider>();
            if (headCollider != null) Destroy(headCollider);
            localPlayer = player.AddComponent<PlayerMotor>();

            Camera camera = Camera.main;
            if (camera == null)
            {
                GameObject cameraObject = new GameObject("Main Camera");
                cameraObject.tag = "MainCamera";
                camera = cameraObject.AddComponent<Camera>();
                cameraObject.AddComponent<AudioListener>();
            }
            camera.enabled = true;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.42f, 0.70f, 0.92f);
            camera.fieldOfView = 60f;
            camera.nearClipPlane = 0.1f;
            camera.farClipPlane = 500f;
            camera.allowHDR = false;
            camera.allowMSAA = true;
            FollowCamera follow = camera.GetComponent<FollowCamera>();
            if (follow == null) follow = camera.gameObject.AddComponent<FollowCamera>();
            follow.SetTarget(player.transform);
            camera.transform.position = player.transform.position + new Vector3(0f, 3.2f, -6f);
        }

        private static void CreateLighting()
        {
            Light sun = Object.FindFirstObjectByType<Light>();
            if (sun == null)
            {
                GameObject lightObject = new GameObject("UCENO Sun");
                sun = lightObject.AddComponent<Light>();
                sun.type = LightType.Directional;
            }
            sun.intensity = 1.15f;
            sun.transform.rotation = Quaternion.Euler(50f, -30f, 0f);
        }

        private static void ApplyMaterial(GameObject target, Color color)
        {
            Renderer renderer = target.GetComponent<Renderer>();
            if (renderer == null) return;
            Shader shader = GraphicsSettings.currentRenderPipeline != null
                ? Shader.Find("Universal Render Pipeline/Lit")
                : Shader.Find("Standard");
            if (shader == null) shader = Shader.Find("Universal Render Pipeline/Unlit");
            if (shader == null) shader = Shader.Find("Unlit/Color");
            if (shader == null)
            {
                Debug.LogError("UCENO: No compatible material shader was found. Check the project's render pipeline.");
                return;
            }
            Material material = new Material(shader);
            material.color = color;
            renderer.material = material;
        }

        private void OnGUI()
        {
            GUIStyle panel = new GUIStyle(GUI.skin.box)
            {
                alignment = TextAnchor.UpperLeft,
                fontSize = Mathf.Max(13, Screen.width / 48),
                wordWrap = true
            };
            string position = localPlayer != null ? localPlayer.transform.position.ToString("F1") : "Starting...";
            string movement = localPlayer != null && localPlayer.MovementInput.sqrMagnitude > 0.01f ? "MOVING" : "STOPPED";
            string controls = Application.isMobilePlatform
                ? "LEFT HALF: drag to move   |   RIGHT HALF: drag to look"
                : "WASD: move   |   Mouse: look";
            GUI.Box(new Rect(10f, 10f, Mathf.Min(Screen.width - 20f, 440f), 104f),
                "UCENO VIRTUAL WORLD - TEST AREA\n" + controls + "\nPlayer position: " + position + "\nMovement: " + movement, panel);
        }
    }
}