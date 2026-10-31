using UnityEngine;

namespace UCENO.VirtualWorld
{
    public sealed class WorldBootstrap : MonoBehaviour
    {
        [SerializeField] private bool createDemoEnvironment = true;

        private void Start()
        {
            Application.targetFrameRate = 60;
            Screen.sleepTimeout = SleepTimeout.SystemSetting;

            if (!createDemoEnvironment) return;

            CreateGround();
            CreatePlayer();
            CreateLighting();
        }

        private static void CreateGround()
        {
            GameObject ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.name = "Starter Ground";
            ground.transform.localScale = new Vector3(8f, 1f, 8f);
            ground.GetComponent<Renderer>().material = MakeMaterial(new Color(0.24f, 0.42f, 0.28f));
        }

        private static void CreatePlayer()
        {
            GameObject player = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            player.name = "Local Player";
            player.transform.position = new Vector3(0f, 1f, 0f);
            player.GetComponent<Renderer>().material = MakeMaterial(new Color(0.18f, 0.48f, 0.85f));

            Collider primitiveCollider = player.GetComponent<Collider>();
            if (primitiveCollider != null) Object.Destroy(primitiveCollider);

            CharacterController controller = player.AddComponent<CharacterController>();
            controller.height = 2f;
            controller.radius = 0.45f;
            controller.center = Vector3.zero;
            player.AddComponent<PlayerMotor>();

            Camera camera = Camera.main;
            if (camera == null)
            {
                GameObject cameraObject = new GameObject("Main Camera");
                cameraObject.tag = "MainCamera";
                camera = cameraObject.AddComponent<Camera>();
                cameraObject.AddComponent<AudioListener>();
            }

            FollowCamera follow = camera.GetComponent<FollowCamera>();
            if (follow == null) follow = camera.gameObject.AddComponent<FollowCamera>();
            follow.SetTarget(player.transform);
            camera.transform.position = player.transform.position + new Vector3(0f, 3.2f, -5.5f);
        }

        private static void CreateLighting()
        {
            if (Object.FindObjectOfType<Light>() != null) return;
            GameObject lightObject = new GameObject("Sun");
            Light sun = lightObject.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.intensity = 1.1f;
            lightObject.transform.rotation = Quaternion.Euler(50f, -30f, 0f);
        }

        private static Material MakeMaterial(Color color)
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) shader = Shader.Find("Standard");
            Material material = new Material(shader);
            material.color = color;
            return material;
        }

        private void OnGUI()
        {
            GUI.Box(new Rect(12f, 12f, 310f, 66f),
                Application.isMobilePlatform
                    ? "UCENO Virtual World prototype\nLeft side: move  |  Right side: look"
                    : "UCENO Virtual World prototype\nWASD: move  |  Mouse: look");
        }
    }
}
