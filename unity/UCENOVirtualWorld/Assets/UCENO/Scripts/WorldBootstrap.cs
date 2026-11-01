using UnityEngine;
using UnityEngine.Rendering;

namespace UCENO.VirtualWorld
{
    public sealed class WorldBootstrap : MonoBehaviour
    {
        [SerializeField] private bool createDemoEnvironment = true;
        private PlayerMotor localPlayer;
        private static readonly Vector3 PlayerSpawn = new Vector3(0f, 1.05f, 0f);

        private void Start()
        {
            Application.targetFrameRate = 60;
            Screen.sleepTimeout = SleepTimeout.SystemSetting;
            if (!createDemoEnvironment) return;
            CreateGroundAndRoad();
            CreateTown();
            CreateStreetFurniture();
            CreatePlayer();
            CreateLighting();
        }

        private void CreateGroundAndRoad()
        {
            GameObject ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.name = "UCENO Grass Terrain";
            ground.transform.localScale = new Vector3(12f, 1f, 12f);
            ApplyMaterial(ground, new Color(0.28f, 0.52f, 0.27f));

            GameObject collision = new GameObject("UCENO Ground Collision");
            collision.transform.position = new Vector3(0f, -0.3f, 0f);
            collision.AddComponent<BoxCollider>().size = new Vector3(120f, 0.6f, 120f);

            CreateBlock("Main Street", new Vector3(0f, 0.045f, 12f), new Vector3(6f, 0.09f, 46f), new Color(0.22f, 0.23f, 0.25f));
            CreateBlock("Left Pavement", new Vector3(-3.65f, 0.10f, 12f), new Vector3(1.25f, 0.20f, 46f), new Color(0.66f, 0.65f, 0.60f));
            CreateBlock("Right Pavement", new Vector3(3.65f, 0.10f, 12f), new Vector3(1.25f, 0.20f, 46f), new Color(0.66f, 0.65f, 0.60f));
            for (int z = -8; z < 34; z += 8)
                CreateBlock("Road Centre Marking", new Vector3(0f, 0.10f, z), new Vector3(0.13f, 0.025f, 3.2f), new Color(0.95f, 0.88f, 0.58f));
        }

        private void CreateTown()
        {
            CreateBuilding("Welcome Hall", new Vector3(-11f, 2.4f, 13f), new Vector3(8f, 4.8f, 7f), new Color(0.83f, 0.72f, 0.56f));
            CreateBuilding("Community Centre", new Vector3(11f, 2.8f, 20f), new Vector3(8f, 5.6f, 8f), new Color(0.68f, 0.76f, 0.84f));
            CreateBuilding("Corner Shop", new Vector3(-11f, 1.8f, -5f), new Vector3(7f, 3.6f, 6f), new Color(0.80f, 0.66f, 0.54f));
            CreateBuilding("Town Apartments", new Vector3(12f, 3.8f, -5f), new Vector3(7f, 7.6f, 7f), new Color(0.72f, 0.73f, 0.68f));
            for (int z = -7; z <= 25; z += 8)
            {
                CreateTree(new Vector3(-6.2f, 0f, z));
                CreateTree(new Vector3(6.2f, 0f, z + 2f));
            }
            CreateSign("UCENO TOWN", new Vector3(0f, 3.2f, 34f));
        }

        private static void CreateBuilding(string name, Vector3 position, Vector3 scale, Color color)
        {
            CreateBlock(name, position, scale, color);
            CreateBlock(name + " Roof", position + Vector3.up * (scale.y * 0.5f + 0.22f),
                new Vector3(scale.x + 0.4f, 0.44f, scale.z + 0.4f), new Color(0.30f, 0.19f, 0.15f));
            float front = position.z - scale.z * 0.5f - 0.035f;
            for (float x = -scale.x * 0.32f; x <= scale.x * 0.32f; x += scale.x * 0.32f)
            {
                for (float y = 0.8f; y < scale.y * 0.5f - 0.25f; y += 1.5f)
                    CreateBlock(name + " Window", new Vector3(position.x + x, position.y + y, front),
                        new Vector3(0.85f, 0.72f, 0.07f), new Color(0.20f, 0.55f, 0.68f));
            }
            CreateBlock(name + " Door", new Vector3(position.x, 0.95f, front - 0.045f),
                new Vector3(0.9f, 1.9f, 0.10f), new Color(0.22f, 0.13f, 0.08f));
        }

        private static void CreateTree(Vector3 position)
        {
            GameObject trunk = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            trunk.name = "Tree Trunk";
            trunk.transform.position = position + Vector3.up;
            trunk.transform.localScale = new Vector3(0.32f, 1f, 0.32f);
            ApplyMaterial(trunk, new Color(0.34f, 0.20f, 0.10f));
            GameObject canopy = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            canopy.name = "Tree Canopy";
            canopy.transform.position = position + Vector3.up * 2.7f;
            canopy.transform.localScale = new Vector3(2.1f, 2.4f, 2.1f);
            ApplyMaterial(canopy, new Color(0.12f, 0.38f, 0.16f));
        }

        private static void CreateStreetFurniture()
        {
            for (int z = -3; z <= 25; z += 9)
            {
                CreateBlock("Lamp Post", new Vector3(-4.5f, 2f, z), new Vector3(0.12f, 4f, 0.12f), new Color(0.12f, 0.13f, 0.15f));
                CreateBlock("Lamp Head", new Vector3(-4.5f, 4.05f, z), new Vector3(0.65f, 0.18f, 0.35f), new Color(0.95f, 0.86f, 0.56f));
                CreateBlock("Lamp Post", new Vector3(4.5f, 2f, z + 4f), new Vector3(0.12f, 4f, 0.12f), new Color(0.12f, 0.13f, 0.15f));
                CreateBlock("Lamp Head", new Vector3(4.5f, 4.05f, z + 4f), new Vector3(0.65f, 0.18f, 0.35f), new Color(0.95f, 0.86f, 0.56f));
            }
        }

        private static void CreateSign(string label, Vector3 position)
        {
            CreateBlock("Town Sign Board", position, new Vector3(5f, 1.3f, 0.18f), new Color(0.10f, 0.28f, 0.18f));
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
            controller.radius = 0.38f;
            controller.center = Vector3.zero;
            controller.skinWidth = 0.06f;
            controller.minMoveDistance = 0f;
            localPlayer = player.AddComponent<PlayerMotor>();
            player.AddComponent<ProceduralAvatar>();

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
            camera.backgroundColor = new Color(0.38f, 0.68f, 0.90f, 1f);
            camera.fieldOfView = 62f;
            camera.nearClipPlane = 0.1f;
            camera.farClipPlane = 500f;
            camera.allowHDR = false;
            camera.allowMSAA = true;
            FollowCamera follow = camera.GetComponent<FollowCamera>();
            if (follow == null) follow = camera.gameObject.AddComponent<FollowCamera>();
            follow.SetTarget(player.transform);
            camera.transform.position = player.transform.position + new Vector3(0f, 3.2f, -6f);
        }

        private static void CreateBlock(string name, Vector3 position, Vector3 scale, Color color)
        {
            GameObject block = GameObject.CreatePrimitive(PrimitiveType.Cube);
            block.name = name;
            block.transform.position = position;
            block.transform.localScale = scale;
            ApplyMaterial(block, color);
            Collider collider = block.GetComponent<Collider>();
            if (collider != null && name != "Main Street") Destroy(collider);
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
            sun.intensity = 1.2f;
            sun.color = new Color(1f, 0.95f, 0.84f);
            sun.transform.rotation = Quaternion.Euler(48f, -30f, 0f);
            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.62f, 0.65f, 0.70f);
        }

        private static void ApplyMaterial(GameObject target, Color color)
        {
            Renderer renderer = target.GetComponent<Renderer>();
            if (renderer == null) return;
            Shader shader = GraphicsSettings.currentRenderPipeline != null
                ? Shader.Find("Universal Render Pipeline/Lit")
                : Shader.Find("Standard");
            if (shader == null) shader = Shader.Find("Unlit/Color");
            if (shader == null)
            {
                Debug.LogError("UCENO: No compatible material shader was found.");
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
                "UCENO VIRTUAL WORLD - TOWN TEST\n" + controls + "\nPlayer position: " + position + "\nMovement: " + movement, panel);
        }
    }
}