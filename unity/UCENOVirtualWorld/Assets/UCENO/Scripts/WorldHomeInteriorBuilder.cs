using UnityEngine;

namespace UCENO.VirtualWorld
{
    /// <summary>
    /// Builds the shared residential room shell around the server-authorized
    /// home anchor. Imported catalogue furniture is instantiated separately
    /// by WorldHomeClient so every visitor sees the same saved layout.
    /// </summary>
    public static class WorldHomeInteriorBuilder
    {
        public static GameObject Create(string homeId, Vector3 anchor, Quaternion rotation)
        {
            GameObject root = new GameObject("UCENO Home Interior " + homeId);
            root.transform.SetPositionAndRotation(anchor, rotation);

            Material floor = CreateMaterial("Home Warm Timber", new Color(0.38f, 0.24f, 0.15f), 0.08f);
            Material wall = CreateMaterial("Home Warm Plaster", new Color(0.82f, 0.78f, 0.69f), 0.02f);
            Material trim = CreateMaterial("Home Dark Timber Trim", new Color(0.20f, 0.13f, 0.09f), 0.12f);
            Material glass = CreateMaterial("Home Window Glass", new Color(0.30f, 0.58f, 0.72f), 0.65f);
            Material ceiling = CreateMaterial("Home Ceiling", new Color(0.91f, 0.89f, 0.83f), 0.02f);

            // A 12 x 10 metre open-plan living room with a defined entry,
            // two glazed windows, skirting, ceiling and warm interior lighting.
            AddBox(root.transform, "Timber Floor", new Vector3(0f, -0.10f, 0f),
                new Vector3(12f, 0.20f, 10f), floor);
            AddBox(root.transform, "Back Wall", new Vector3(0f, 1.65f, 5f),
                new Vector3(12f, 3.3f, 0.20f), wall);
            AddBox(root.transform, "Left Wall", new Vector3(-6f, 1.65f, 0f),
                new Vector3(0.20f, 3.3f, 10f), wall);
            AddBox(root.transform, "Right Wall", new Vector3(6f, 1.65f, 0f),
                new Vector3(0.20f, 3.3f, 10f), wall);
            AddBox(root.transform, "Front Wall Left", new Vector3(-4.5f, 1.65f, -5f),
                new Vector3(3f, 3.3f, 0.20f), wall);
            AddBox(root.transform, "Front Wall Right", new Vector3(4.5f, 1.65f, -5f),
                new Vector3(3f, 3.3f, 0.20f), wall);
            AddBox(root.transform, "Front Header", new Vector3(0f, 3.05f, -5f),
                new Vector3(6f, 0.5f, 0.20f), wall);
            AddBox(root.transform, "Ceiling", new Vector3(0f, 3.35f, 0f),
                new Vector3(12f, 0.18f, 10f), ceiling);

            AddBox(root.transform, "Entry Door", new Vector3(0f, 1.05f, -4.94f),
                new Vector3(1.12f, 2.10f, 0.10f), trim);
            AddBox(root.transform, "Entry Door Handle", new Vector3(0.40f, 1.05f, -4.86f),
                new Vector3(0.06f, 0.12f, 0.06f), glass);

            AddBox(root.transform, "Left Window", new Vector3(-5.87f, 2.0f, 1.7f),
                new Vector3(0.06f, 1.25f, 2.4f), glass);
            AddBox(root.transform, "Right Window", new Vector3(5.87f, 2.0f, 1.7f),
                new Vector3(0.06f, 1.25f, 2.4f), glass);
            AddBox(root.transform, "Left Window Sill", new Vector3(-5.78f, 1.34f, 1.7f),
                new Vector3(0.32f, 0.10f, 2.55f), trim);
            AddBox(root.transform, "Right Window Sill", new Vector3(5.78f, 1.34f, 1.7f),
                new Vector3(0.32f, 0.10f, 2.55f), trim);

            AddBox(root.transform, "Back Skirting", new Vector3(0f, 0.08f, 4.86f),
                new Vector3(11.8f, 0.16f, 0.08f), trim);
            AddBox(root.transform, "Left Skirting", new Vector3(-5.86f, 0.08f, 0f),
                new Vector3(0.08f, 0.16f, 9.7f), trim);
            AddBox(root.transform, "Right Skirting", new Vector3(5.86f, 0.08f, 0f),
                new Vector3(0.08f, 0.16f, 9.7f), trim);

            GameObject lightObject = new GameObject("Warm Ceiling Light");
            lightObject.transform.SetParent(root.transform, false);
            lightObject.transform.localPosition = new Vector3(0f, 3.0f, 0.8f);
            Light light = lightObject.AddComponent<Light>();
            light.type = LightType.Point;
            light.color = new Color(1f, 0.84f, 0.65f);
            light.intensity = 2.0f;
            light.range = 12f;
            light.shadows = LightShadows.None;

            return root;
        }

        private static void AddBox(Transform parent, string name, Vector3 localPosition,
            Vector3 localScale, Material material)
        {
            GameObject box = GameObject.CreatePrimitive(PrimitiveType.Cube);
            box.name = name;
            box.transform.SetParent(parent, false);
            box.transform.localPosition = localPosition;
            box.transform.localScale = localScale;
            // Keep the primitive collider: these generated walls, floor and ceiling
            // are the actual home collision shell used by the player's CharacterController.
            // Removing it made the rendered room physically non-solid.
            Renderer renderer = box.GetComponent<Renderer>();
            renderer.sharedMaterial = material;
        }

        private static Material CreateMaterial(string name, Color color, float metallic)
        {
            Shader shader = Shader.Find("Standard");
            if (shader == null) shader = Shader.Find("Universal Render Pipeline/Lit");
            Material material = new Material(shader) { name = name, color = color };
            material.SetFloat("_Metallic", metallic);
            material.SetFloat("_Glossiness", metallic > 0.5f ? 0.65f : 0.18f);
            return material;
        }
    }
}