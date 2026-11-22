using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace UCENO.VirtualWorld
{
    /// <summary>
    /// Builds a reusable, detailed residential shell around the server-authorized
    /// home anchor. The room is deliberately a furnished-ready shell: saved,
    /// owner-editable catalogue furniture is instantiated by WorldHomeClient.
    /// Materials are shared to avoid one material allocation per visiting home.
    /// </summary>
    public static class WorldHomeInteriorBuilder
    {
        private static readonly Dictionary<string, Material> Materials = new Dictionary<string, Material>();

        public static GameObject Create(string homeId, Vector3 anchor, Quaternion rotation)
        {
            GameObject root = new GameObject("UCENO Home Interior " + homeId);
            root.transform.SetPositionAndRotation(anchor, rotation);

            Material floor = CreateMaterial("Home Warm Timber", new Color(.34f, .20f, .12f), .08f, .28f);
            Material floorSeam = CreateMaterial("Home Timber Seam", new Color(.16f, .095f, .055f), .02f, .16f);
            Material wall = CreateMaterial("Home Warm Plaster", new Color(.82f, .78f, .69f), .02f, .18f);
            Material accent = CreateMaterial("Home Feature Wall", new Color(.31f, .25f, .20f), .04f, .22f);
            Material trim = CreateMaterial("Home Dark Timber Trim", new Color(.17f, .105f, .065f), .12f, .32f);
            Material metal = CreateMaterial("Home Brushed Metal", new Color(.34f, .39f, .42f), .78f, .72f);
            Material glass = CreateMaterial("Home Architectural Glass", new Color(.30f, .58f, .72f), .65f, .94f);
            Material ceiling = CreateMaterial("Home Ceiling", new Color(.93f, .91f, .86f), .02f, .16f);
            Material cabinet = CreateMaterial("Home Kitchen Cabinet", new Color(.25f, .19f, .14f), .08f, .28f);
            Material stone = CreateMaterial("Home Quartz Countertop", new Color(.70f, .69f, .64f), .12f, .38f);
            Material tile = CreateMaterial("Home Porcelain Tile", new Color(.66f, .68f, .66f), .04f, .32f);
            Material warmGlow = CreateMaterial("Home Warm Light Diffuser", new Color(1f, .72f, .42f), .02f, .55f);
            warmGlow.EnableKeyword("_EMISSION");
            warmGlow.SetColor("_EmissionColor", new Color(1f, .52f, .22f) * .7f);

            BuildFloor(root.transform, floor, floorSeam);
            BuildShell(root.transform, wall, accent, trim, glass, ceiling, metal);
            BuildKitchen(root.transform, cabinet, stone, tile, metal, glass);
            BuildBathroom(root.transform, tile, wall, glass, metal, stone);
            BuildLighting(root.transform, metal, warmGlow);
            BuildArchitecturalDetails(root.transform, trim, metal, accent);
            CombineDecorativeGeometry(root.transform);

            return root;
        }

        private static void BuildFloor(Transform root, Material timber, Material seam)
        {
            AddBox(root, "Structural floor slab", new Vector3(0f, -.12f, 0f),
                new Vector3(12f, .24f, 10f), timber);
            // Fine plank joints add scale and material breakup without a texture dependency.
            for (int row = 0; row < 20; row++)
            {
                float z = -4.75f + row * .5f;
                AddBox(root, "Timber plank joint " + row, new Vector3(0f, .006f, z),
                    new Vector3(11.92f, .008f, .012f), seam, false);
            }
            for (int column = 0; column < 24; column++)
            {
                float x = -5.75f + column * .5f;
                float offset = (column % 2) * .25f;
                for (int row = 0; row < 2; row++)
                    AddBox(root, "Staggered timber joint " + column + " " + row,
                        new Vector3(x, .007f, -2.5f + row * 5f + offset),
                        new Vector3(.012f, .008f, 4.9f), seam, false);
            }
        }

        private static void BuildShell(Transform root, Material wall, Material accent,
            Material trim, Material glass, Material ceiling, Material metal)
        {
            AddBox(root, "Back plaster wall", new Vector3(0f, 1.65f, 5f),
                new Vector3(12f, 3.3f, .20f), wall);
            AddBox(root, "Left plaster wall", new Vector3(-6f, 1.65f, 0f),
                new Vector3(.20f, 3.3f, 10f), wall);
            AddBox(root, "Right feature wall", new Vector3(6f, 1.65f, 0f),
                new Vector3(.20f, 3.3f, 10f), accent);
            AddBox(root, "Front wall left pier", new Vector3(-4.5f, 1.65f, -5f),
                new Vector3(3f, 3.3f, .20f), wall);
            AddBox(root, "Front wall right pier", new Vector3(4.5f, 1.65f, -5f),
                new Vector3(3f, 3.3f, .20f), wall);
            AddBox(root, "Front door lintel", new Vector3(0f, 3.05f, -5f),
                new Vector3(6f, .5f, .20f), wall);
            AddBox(root, "Ceiling", new Vector3(0f, 3.35f, 0f),
                new Vector3(12f, .18f, 10f), ceiling);

            AddBox(root, "Entry door leaf", new Vector3(0f, 1.05f, -4.94f),
                new Vector3(1.12f, 2.10f, .10f), trim, false);
            AddBox(root, "Entry door inset panel", new Vector3(0f, 1.10f, -4.875f),
                new Vector3(.78f, 1.48f, .025f), accent, false);
            AddBox(root, "Entry door handle", new Vector3(.40f, 1.05f, -4.84f),
                new Vector3(.055f, .12f, .055f), metal, false);
            AddBox(root, "Entry threshold", new Vector3(0f, .025f, -4.82f),
                new Vector3(1.3f, .05f, .34f), metal, false);

            BuildWindow(root, "Left", new Vector3(-5.87f, 2f, 1.7f), glass, trim, metal);
            BuildWindow(root, "Right", new Vector3(5.87f, 2f, 1.7f), glass, trim, metal);

            // Skirting, ceiling coves and slim ceiling beams make wall/ceiling transitions intentional.
            AddBox(root, "Back skirting", new Vector3(0f, .08f, 4.86f), new Vector3(11.8f, .16f, .08f), trim, false);
            AddBox(root, "Left skirting", new Vector3(-5.86f, .08f, 0f), new Vector3(.08f, .16f, 9.7f), trim, false);
            AddBox(root, "Right skirting", new Vector3(5.86f, .08f, 0f), new Vector3(.08f, .16f, 9.7f), trim, false);
            AddBox(root, "Back ceiling cove", new Vector3(0f, 3.20f, 4.82f), new Vector3(11.8f, .12f, .16f), trim, false);
            AddBox(root, "Left ceiling cove", new Vector3(-5.82f, 3.20f, 0f), new Vector3(.16f, .12f, 9.6f), trim, false);
            AddBox(root, "Right ceiling cove", new Vector3(5.82f, 3.20f, 0f), new Vector3(.16f, .12f, 9.6f), trim, false);
            for (int i = -2; i <= 2; i++)
                AddBox(root, "Ceiling timber detail " + i, new Vector3(i * 2.1f, 3.22f, 0f),
                    new Vector3(.055f, .06f, 9.5f), metal, false);
        }

        private static void BuildWindow(Transform root, string side, Vector3 center,
            Material glass, Material frame, Material metal)
        {
            AddBox(root, side + " panoramic glazing", center, new Vector3(.055f, 1.55f, 2.5f), glass, false);
            AddBox(root, side + " window top frame", center + new Vector3(0f, .82f, 0f),
                new Vector3(.16f, .12f, 2.7f), frame, false);
            AddBox(root, side + " window bottom frame", center + new Vector3(0f, -.82f, 0f),
                new Vector3(.18f, .12f, 2.7f), frame, false);
            for (int z = -1; z <= 1; z += 2)
                AddBox(root, side + " window side frame " + z, center + new Vector3(0f, 0f, z * 1.3f),
                    new Vector3(.16f, 1.75f, .12f), frame, false);
            AddBox(root, side + " window mullion", center, new Vector3(.18f, 1.55f, .055f), metal, false);
            AddBox(root, side + " curtain rail", center + new Vector3(0f, .98f, 0f),
                new Vector3(.10f, .08f, 2.9f), metal, false);
            for (int z = -1; z <= 1; z += 2)
                AddBox(root, side + " curtain panel " + z, center + new Vector3(0f, -.02f, z * 1.12f),
                    new Vector3(.045f, 1.48f, .28f), frame, false);
        }

        private static void BuildKitchen(Transform root, Material cabinet, Material stone,
            Material tile, Material metal, Material glass)
        {
            // A complete fitted kitchen occupies the rear-right zone while leaving the saved furniture layout clear.
            AddBox(root, "Kitchen lower cabinet run", new Vector3(3.55f, .48f, 4.12f),
                new Vector3(4.35f, .96f, 1.35f), cabinet);
            AddBox(root, "Kitchen quartz worktop", new Vector3(3.55f, 1.02f, 4.08f),
                new Vector3(4.48f, .12f, 1.48f), stone);
            AddBox(root, "Kitchen backsplash", new Vector3(3.55f, 1.68f, 4.82f),
                new Vector3(4.35f, .62f, .06f), tile, false);
            AddBox(root, "Kitchen upper cabinets", new Vector3(3.55f, 2.35f, 4.45f),
                new Vector3(4.35f, 1.0f, .72f), cabinet);
            for (int i = 0; i < 5; i++)
            {
                float x = 1.55f + i * 1.0f;
                AddBox(root, "Kitchen upper cabinet reveal " + i, new Vector3(x, 2.35f, 4.06f),
                    new Vector3(.025f, .86f, .025f), metal, false);
                AddBox(root, "Kitchen lower cabinet reveal " + i, new Vector3(x, .48f, 3.43f),
                    new Vector3(.025f, .82f, .025f), metal, false);
            }
            AddBox(root, "Kitchen sink basin", new Vector3(3.0f, 1.10f, 4.02f),
                new Vector3(1.05f, .055f, .72f), metal, false);
            AddBox(root, "Kitchen faucet stem", new Vector3(3.0f, 1.34f, 4.30f),
                new Vector3(.055f, .42f, .055f), metal, false);
            AddBox(root, "Kitchen faucet spout", new Vector3(3.0f, 1.53f, 4.14f),
                new Vector3(.055f, .055f, .34f), metal, false);
            AddBox(root, "Kitchen refrigerator", new Vector3(5.25f, 1.25f, 2.92f),
                new Vector3(1.05f, 2.5f, 1.05f), glass);
            AddBox(root, "Kitchen refrigerator handle", new Vector3(4.78f, 1.35f, 2.38f),
                new Vector3(.045f, .72f, .055f), metal, false);
            AddBox(root, "Kitchen island base", new Vector3(1.25f, .48f, 1.85f),
                new Vector3(2.35f, .96f, 1.15f), cabinet);
            AddBox(root, "Kitchen island stone top", new Vector3(1.25f, 1.02f, 1.85f),
                new Vector3(2.55f, .12f, 1.32f), stone);
            AddBox(root, "Kitchen island toe kick", new Vector3(1.25f, .12f, 1.27f),
                new Vector3(2.2f, .16f, .08f), metal, false);
        }

        private static void BuildBathroom(Transform root, Material tile, Material wall,
            Material glass, Material metal, Material stone)
        {
            // Compact enclosed wet-room zone at the front-left, separated from the main living area.
            // Two partition returns preserve a usable 0.8 m bathroom doorway.
            AddBox(root, "Bathroom partition left return", new Vector3(-5.4f, 1.55f, -2.55f),
                new Vector3(1.2f, 3.1f, .12f), wall);
            AddBox(root, "Bathroom partition right return", new Vector3(-3.2f, 1.55f, -2.55f),
                new Vector3(1.6f, 3.1f, .12f), wall);
            AddBox(root, "Bathroom partition return", new Vector3(-2.45f, 1.55f, -3.75f),
                new Vector3(.12f, 3.1f, 2.4f), wall);
            AddBox(root, "Bathroom tile floor", new Vector3(-4.15f, .018f, -3.72f),
                new Vector3(3.35f, .035f, 2.25f), tile, false);
            AddBox(root, "Bathroom shower tray", new Vector3(-4.95f, .10f, -3.72f),
                new Vector3(1.45f, .16f, 2.0f), stone, false);
            AddBox(root, "Bathroom shower glass", new Vector3(-4.18f, 1.15f, -3.72f),
                new Vector3(.045f, 2.2f, 1.95f), glass, false);
            AddBox(root, "Bathroom vanity cabinet", new Vector3(-3.0f, .48f, -4.35f),
                new Vector3(.92f, .96f, .75f), wall);
            AddBox(root, "Bathroom vanity stone", new Vector3(-3.0f, 1.0f, -4.35f),
                new Vector3(1.02f, .10f, .84f), stone, false);
            AddBox(root, "Bathroom mirror", new Vector3(-3.0f, 2.0f, -4.91f),
                new Vector3(.72f, 1.15f, .035f), glass, false);
            AddBox(root, "Bathroom shower rail", new Vector3(-4.95f, 2.55f, -4.45f),
                new Vector3(.06f, .06f, .75f), metal, false);
        }

        private static void BuildLighting(Transform root, Material metal, Material diffuser)
        {
            for (int x = -1; x <= 1; x++)
            for (int z = -1; z <= 1; z++)
            {
                Vector3 position = new Vector3(x * 3.1f, 3.08f, z * 2.6f);
                AddBox(root, "Recessed downlight trim " + x + " " + z, position,
                    new Vector3(.34f, .045f, .34f), metal, false);
                AddBox(root, "Recessed downlight diffuser " + x + " " + z,
                    position + new Vector3(0f, -.028f, 0f), new Vector3(.24f, .018f, .24f), diffuser, false);
            }
            CreatePointLight(root, "Warm living-zone light", new Vector3(-1.6f, 2.95f, .5f), 1.5f, 10f);
            CreatePointLight(root, "Kitchen task light", new Vector3(3.4f, 2.85f, 3.2f), 1.1f, 7f);
            CreatePointLight(root, "Bathroom light", new Vector3(-4.1f, 2.8f, -3.6f), .55f, 4f);
        }

        private static void BuildArchitecturalDetails(Transform root, Material trim, Material metal, Material accent)
        {
            AddBox(root, "Living feature wall inset", new Vector3(5.86f, 1.8f, -1.2f),
                new Vector3(.06f, 2.35f, 3.4f), accent, false);
            AddBox(root, "Living wall display shelf", new Vector3(5.68f, 1.35f, -1.2f),
                new Vector3(.32f, .08f, 2.8f), trim, false);
            AddBox(root, "Living wall display shelf upper", new Vector3(5.68f, 2.35f, -1.2f),
                new Vector3(.32f, .08f, 2.8f), trim, false);
            AddBox(root, "Entry wall metal reveal", new Vector3(-5.84f, 1.8f, -3.1f),
                new Vector3(.05f, 2.2f, .06f), metal, false);
        }

        private static void CombineDecorativeGeometry(Transform root)
        {
            // Merge collider-free architectural details by shared material. This
            // retains the authored appearance while avoiding hundreds of tiny
            // renderers and draw calls for every streamed residential interior.
            var batches = new Dictionary<Material, List<CombineInstance>>();
            var sourceObjects = new List<GameObject>();
            foreach (MeshFilter filter in root.GetComponentsInChildren<MeshFilter>(true))
            {
                MeshRenderer renderer = filter.GetComponent<MeshRenderer>();
                if (filter.sharedMesh == null || renderer == null ||
                    filter.GetComponent<Collider>() != null || renderer.sharedMaterial == null)
                    continue;

                Material material = renderer.sharedMaterial;
                if (!batches.TryGetValue(material, out List<CombineInstance> instances))
                {
                    instances = new List<CombineInstance>();
                    batches.Add(material, instances);
                }
                instances.Add(new CombineInstance
                {
                    mesh = filter.sharedMesh,
                    transform = root.worldToLocalMatrix * filter.transform.localToWorldMatrix
                });
                sourceObjects.Add(filter.gameObject);
            }

            foreach (KeyValuePair<Material, List<CombineInstance>> batch in batches)
            {
                var combined = new Mesh { name = "UCENO Interior " + batch.Key.name + " Batch" };
                int vertexCount = 0;
                foreach (CombineInstance instance in batch.Value)
                    vertexCount += instance.mesh.vertexCount;
                if (vertexCount > 65535) combined.indexFormat = IndexFormat.UInt32;
                combined.CombineMeshes(batch.Value.ToArray(), true, true, false);

                GameObject batchObject = new GameObject("Interior Batch - " + batch.Key.name);
                batchObject.transform.SetParent(root, false);
                batchObject.AddComponent<MeshFilter>().sharedMesh = combined;
                batchObject.AddComponent<MeshRenderer>().sharedMaterial = batch.Key;
            }

            foreach (GameObject source in sourceObjects)
                if (source != null) Object.Destroy(source);
        }

        private static void CreatePointLight(Transform parent, string name, Vector3 position,
            float intensity, float range)
        {
            GameObject lightObject = new GameObject(name);
            lightObject.transform.SetParent(parent, false);
            lightObject.transform.localPosition = position;
            Light light = lightObject.AddComponent<Light>();
            light.type = LightType.Point;
            light.color = new Color(1f, .84f, .68f);
            light.intensity = intensity;
            light.range = range;
            light.shadows = LightShadows.None;
        }

        private static void AddBox(Transform parent, string name, Vector3 localPosition,
            Vector3 localScale, Material material, bool collider = true)
        {
            GameObject box = GameObject.CreatePrimitive(PrimitiveType.Cube);
            box.name = name;
            box.transform.SetParent(parent, false);
            box.transform.localPosition = localPosition;
            box.transform.localScale = localScale;
            Renderer renderer = box.GetComponent<Renderer>();
            renderer.sharedMaterial = material;
            if (!collider)
            {
                Collider shape = box.GetComponent<Collider>();
                if (shape != null) Object.Destroy(shape);
            }
        }

        private static Material CreateMaterial(string name, Color color, float metallic, float smoothness)
        {
            string key = name + "|" + ColorUtility.ToHtmlStringRGBA(color) + "|" +
                metallic.ToString("F3") + "|" + smoothness.ToString("F3");
            if (Materials.TryGetValue(key, out Material cached) && cached != null) return cached;

            Shader shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) shader = Shader.Find("Standard");
            if (shader == null) throw new System.InvalidOperationException("No supported lit shader is available for the home interior.");
            Material material = new Material(shader) { name = name, color = color };
            material.SetFloat("_Metallic", metallic);
            material.SetFloat("_Smoothness", smoothness);
            material.SetFloat("_Glossiness", smoothness);
            Materials[key] = material;
            return material;
        }
    }
}
