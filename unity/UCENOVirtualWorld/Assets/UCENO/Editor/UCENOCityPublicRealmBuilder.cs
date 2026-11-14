#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;

namespace UCENO.VirtualWorld.Editor
{
    /// <summary>
    /// Original UCENO public-realm kit: tropical boulevard planting, pedestrian
    /// lighting, street furniture and transit stops. Generated in the Editor,
    /// then saved into the district scenes and streamed with their parent area.
    /// </summary>
    public static class UCENOCityPublicRealmBuilder
    {
        private static Material pavement;
        private static Material darkMetal;
        private static Material warmLight;
        private static Material leaf;
        private static Material trunk;
        private static Material planter;
        private static Material shelterGlass;
        private static Material seatWood;

        public static void Build(Transform cityRoot)
        {
            pavement = Make("UCENO_PublicRealm_Paving", new Color(0.48f, 0.51f, 0.52f), 0.08f, 0.28f);
            darkMetal = Make("UCENO_PublicRealm_GraphiteMetal", new Color(0.075f, 0.095f, 0.105f), 0.78f, 0.72f);
            warmLight = Make("UCENO_PublicRealm_WarmLED", new Color(1f, 0.72f, 0.38f), 0.15f, 0.45f);
            warmLight.EnableKeyword("_EMISSION");
            warmLight.SetColor("_EmissionColor", new Color(1f, 0.42f, 0.12f) * 1.8f);
            leaf = Make("UCENO_PublicRealm_TropicalCanopy", new Color(0.16f, 0.34f, 0.22f), 0.02f, 0.22f);
            trunk = Make("UCENO_PublicRealm_TreeTrunk", new Color(0.28f, 0.19f, 0.12f), 0f, 0.12f);
            planter = Make("UCENO_PublicRealm_StonePlanter", new Color(0.28f, 0.31f, 0.32f), 0.12f, 0.32f);
            shelterGlass = Make("UCENO_PublicRealm_ShelterGlass", new Color(0.42f, 0.62f, 0.66f), 0.48f, 0.82f);
            seatWood = Make("UCENO_PublicRealm_Teak", new Color(0.31f, 0.17f, 0.09f), 0.05f, 0.3f);

            BuildTreeRows(cityRoot, -13f, -248f, 248f, 28f);
            BuildTreeRows(cityRoot, 13f, -248f, 248f, 28f);
            BuildTreeRows(cityRoot, -82f, -210f, 210f, 42f);
            BuildTreeRows(cityRoot, 82f, -210f, 210f, 42f);
            BuildLightingRows(cityRoot, -9.5f, -240f, 240f, 42f);
            BuildLightingRows(cityRoot, 9.5f, -240f, 240f, 42f);
            BuildStreetFurniture(cityRoot);
            BuildTransitShelters(cityRoot);
            BuildPedestrianCrossings(cityRoot);
            AssetDatabase.SaveAssets();
        }

        private static void BuildTreeRows(Transform parent, float x, float startZ, float endZ, float spacing)
        {
            int index = 0;
            for (float z = startZ; z <= endZ; z += spacing)
            {
                Transform root = Group(parent, "UCENO Tropical Street Tree " + x + " " + index,
                    new Vector3(x, 0f, z));
                Primitive(root, PrimitiveType.Cube, "Raised stone tree bed",
                    new Vector3(0f, 0.12f, 0f), new Vector3(3.4f, 0.24f, 3.4f), planter);
                Primitive(root, PrimitiveType.Cylinder, "Tree trunk",
                    new Vector3(0f, 2.3f, 0f), new Vector3(0.34f, 2.3f, 0.34f), trunk);
                Primitive(root, PrimitiveType.Sphere, "Canopy core",
                    new Vector3(0f, 5.2f, 0f), new Vector3(3.3f, 3.1f, 3.3f), leaf);
                Primitive(root, PrimitiveType.Sphere, "Canopy upper",
                    new Vector3(0.1f, 6.3f, 0.25f), new Vector3(2.6f, 2.2f, 2.6f), leaf);
                index++;
            }
        }

        private static void BuildLightingRows(Transform parent, float x, float startZ, float endZ, float spacing)
        {
            int index = 0;
            for (float z = startZ; z <= endZ; z += spacing)
            {
                Transform root = Group(parent, "UCENO Pedestrian Light " + x + " " + index,
                    new Vector3(x, 0f, z));
                Primitive(root, PrimitiveType.Cylinder, "Tapered light column",
                    new Vector3(0f, 3.1f, 0f), new Vector3(0.11f, 3.1f, 0.11f), darkMetal);
                Primitive(root, PrimitiveType.Cube, "Cantilever arm",
                    new Vector3(0.48f, 6.1f, 0f), new Vector3(1.05f, 0.09f, 0.09f), darkMetal);
                Primitive(root, PrimitiveType.Cube, "Warm LED luminaire",
                    new Vector3(0.92f, 6.02f, 0f), new Vector3(0.55f, 0.12f, 0.32f), warmLight);
                index++;
            }
        }

        private static void BuildStreetFurniture(Transform parent)
        {
            for (int i = 0; i < 8; i++)
            {
                float z = -196f + i * 56f;
                BuildBench(parent, new Vector3(-16.5f, 0f, z));
                BuildBench(parent, new Vector3(16.5f, 0f, z + 22f));
            }
        }

        private static void BuildBench(Transform parent, Vector3 position)
        {
            Transform root = Group(parent, "UCENO Public Bench", position);
            Primitive(root, PrimitiveType.Cube, "Teak seat",
                new Vector3(0f, 0.55f, 0f), new Vector3(2.1f, 0.12f, 0.58f), seatWood);
            Primitive(root, PrimitiveType.Cube, "Teak back",
                new Vector3(0f, 0.98f, -0.24f), new Vector3(2.1f, 0.72f, 0.12f), seatWood);
            for (int side = -1; side <= 1; side += 2)
                Primitive(root, PrimitiveType.Cube, "Graphite bench support",
                    new Vector3(side * 0.78f, 0.28f, 0f), new Vector3(0.12f, 0.56f, 0.48f), darkMetal);
        }

        private static void BuildTransitShelters(Transform parent)
        {
            BuildShelter(parent, new Vector3(-91f, 0f, -6f));
            BuildShelter(parent, new Vector3(91f, 0f, 78f));
        }

        private static void BuildShelter(Transform parent, Vector3 position)
        {
            Transform root = Group(parent, "UCENO Modern Transit Shelter", position);
            Primitive(root, PrimitiveType.Cube, "Shelter canopy",
                new Vector3(0f, 3.1f, 0f), new Vector3(7.2f, 0.22f, 2.8f), darkMetal);
            for (int x = -1; x <= 1; x += 2)
            for (int z = -1; z <= 1; z += 2)
                Primitive(root, PrimitiveType.Cube, "Shelter support",
                    new Vector3(x * 3.35f, 1.55f, z * 1.22f),
                    new Vector3(0.12f, 3.1f, 0.12f), darkMetal);
            Primitive(root, PrimitiveType.Cube, "Rear glass panel",
                new Vector3(0f, 1.65f, -1.2f), new Vector3(6.5f, 2.65f, 0.055f), shelterGlass);
            Primitive(root, PrimitiveType.Cube, "Passenger bench",
                new Vector3(0f, 0.58f, 0.42f), new Vector3(3.2f, 0.12f, 0.55f), seatWood);
            Primitive(root, PrimitiveType.Cube, "Route information display",
                new Vector3(2.7f, 1.75f, 1.18f), new Vector3(0.72f, 1.35f, 0.12f), darkMetal);
        }

        private static void BuildPedestrianCrossings(Transform parent)
        {
            Material stripe = Make("UCENO_PublicRealm_CrosswalkIvory", new Color(0.88f, 0.87f, 0.81f), 0f, 0.12f);
            for (int z = -180; z <= 180; z += 90)
            {
                Transform crossing = Group(parent, "UCENO Raised Pedestrian Crossing " + z,
                    new Vector3(0f, 0.18f, z));
                for (int i = -5; i <= 5; i++)
                    Primitive(crossing, PrimitiveType.Cube, "Crosswalk stripe",
                        new Vector3(i * 1.55f, 0f, 0f), new Vector3(0.92f, 0.035f, 5.8f), stripe);
            }
        }

        private static Transform Group(Transform parent, string name, Vector3 position)
        {
            GameObject root = new GameObject(name);
            root.transform.SetParent(parent, false);
            root.transform.localPosition = position;
            return root.transform;
        }

        private static GameObject Primitive(Transform parent, PrimitiveType type, string name,
            Vector3 position, Vector3 scale, Material material)
        {
            GameObject item = GameObject.CreatePrimitive(type);
            item.name = name;
            item.transform.SetParent(parent, false);
            item.transform.localPosition = position;
            item.transform.localScale = scale;
            Renderer renderer = item.GetComponent<Renderer>();
            renderer.sharedMaterial = material;
            Collider collider = item.GetComponent<Collider>();
            if (collider != null) Object.DestroyImmediate(collider);
            GameObjectUtility.SetStaticEditorFlags(item,
                StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccludeeStatic);
            return item;
        }

        private static Material Make(string name, Color color, float metallic, float smoothness)
        {
            string path = "Assets/UCENO/Materials/" + name + ".mat";
            Material material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null)
            {
                Shader shader = Shader.Find("Standard");
                if (shader == null) throw new System.InvalidOperationException("Unity Standard shader is unavailable.");
                material = new Material(shader);
                AssetDatabase.CreateAsset(material, path);
            }
            material.color = color;
            material.SetFloat("_Metallic", metallic);
            material.SetFloat("_Glossiness", smoothness);
            EditorUtility.SetDirty(material);
            return material;
        }
    }
}
#endif
