#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;

namespace UCENO.VirtualWorld.Editor
{
    /// <summary>
    /// Adds an original, editor-generated high-rise skyline to the starter
    /// district. Geometry is authored from UCENO-owned modules; no runtime
    /// primitives, paid packages, or external model downloads are required.
    /// </summary>
    public static class PhotorealCityDistrictBuilder
    {
        private static readonly Color Concrete = new Color(0.58f, 0.60f, 0.61f);
        private static readonly Color DarkStone = new Color(0.16f, 0.19f, 0.22f);
        private static readonly Color Glass = new Color(0.035f, 0.12f, 0.17f);
        private static readonly Color LitGlass = new Color(0.22f, 0.31f, 0.36f);

        public static void Build(Transform parent)
        {
            Material concrete = CreateMaterial("UCENO_Tower_Architectural_Concrete", Concrete, 0.12f, 0.28f);
            Material stone = CreateMaterial("UCENO_Tower_Dark_Stone", DarkStone, 0.18f, 0.34f);
            Material glass = CreateMaterial("UCENO_Tower_Curtain_Glass", Glass, 0.82f, 0.94f);
            Material litGlass = CreateMaterial("UCENO_Tower_Interior_Lit_Glass", LitGlass, 0.58f, 0.88f);
            // Give selected occupied floors a warm, low-intensity interior glow at dusk/night.
            // This is authored into the saved city materials, not a runtime light per window.
            litGlass.EnableKeyword("_EMISSION");
            litGlass.SetColor("_EmissionColor", new Color(0.48f, 0.29f, 0.16f) * 0.72f);
            Material metal = CreateMaterial("UCENO_Tower_Brushed_Metal", new Color(0.34f, 0.39f, 0.42f), 0.78f, 0.72f);

            int[,] layout =
            {
                { -43, -68, 18 }, { 43, -64, 21 },
                { -46, -8, 16 },  { 45, 2, 24 },
                { -42, 58, 20 },  { 44, 66, 17 },
                { -82, -30, 15 }, { 82, 34, 19 }
            };

            for (int i = 0; i < layout.GetLength(0); i++)
            {
                int x = layout[i, 0];
                int z = layout[i, 1];
                int floors = layout[i, 2];
                float width = i % 3 == 0 ? 20f : 17f;
                float depth = i % 2 == 0 ? 18f : 16f;
                BuildTower(parent, "UCENO Original Tower " + (i + 1), new Vector3(x, 0f, z),
                    width, depth, floors, i, concrete, stone, glass, litGlass, metal);
            }

            BuildPlaza(parent, stone, metal, concrete);
            BuildExpandedUrbanGrid(parent, concrete, stone, glass, litGlass, metal);
            UCENOCityPublicRealmBuilder.Build(parent);
            BuildBoulevardRetail(parent, concrete, stone, glass, litGlass, metal);

        }


        private static void BuildBoulevardRetail(Transform parent, Material concrete,
            Material stone, Material glass, Material litGlass, Material metal)
        {
            // Mixed-use street frontage breaks up the skyline with walkable,
            // human-scale retail buildings. Every block is its own district
            // child so Addressables extraction can stream it with its area.
            Material warmStone = CreateMaterial("UCENO_Retail_Warm_Stone",
                new Color(0.48f, 0.39f, 0.29f), 0.08f, 0.28f);
            Material darkGlass = CreateMaterial("UCENO_Retail_Tinted_Glass",
                new Color(0.025f, 0.075f, 0.09f), 0.68f, 0.9f);
            Material signGlow = CreateMaterial("UCENO_Retail_Signage_Light",
                new Color(0.18f, 0.62f, 0.72f), 0.18f, 0.62f);
            signGlow.EnableKeyword("_EMISSION");
            signGlow.SetColor("_EmissionColor", new Color(0.08f, 0.48f, 0.62f) * 1.25f);

            int[] positions = { -205, -145, -85, -25, 35, 95, 155, 215 };
            for (int side = -1; side <= 1; side += 2)
            for (int i = 0; i < positions.Length; i++)
            {
                float z = positions[i];
                float x = side * 25f;
                float width = 13f + (i % 3) * 1.5f;
                float depth = 24f + (i % 2) * 4f;
                float height = 10.5f + (i % 3) * 1.6f;
                GameObject block = new GameObject("UCENO Boulevard Retail Pavilion " + side + " " + i);
                block.transform.SetParent(parent, false);
                block.transform.localPosition = new Vector3(x, 0f, z);
                Transform root = block.transform;

                Box(root, "Retail stone podium", new Vector3(0f, 1.05f, 0f),
                    new Vector3(width, 2.1f, depth), warmStone, true);
                Box(root, "Continuous shopfront glazing", new Vector3(0f, 1.2f, depth * 0.5f + 0.035f),
                    new Vector3(width - 1.1f, 1.75f, 0.08f), darkGlass, false);
                Box(root, "Recessed upper glazing", new Vector3(0f, 5.1f, depth * 0.5f + 0.04f),
                    new Vector3(width - 1.5f, 3.0f, 0.08f), glass, false);
                Box(root, "Upper floor slab", new Vector3(0f, 3.0f, 0f),
                    new Vector3(width + 0.45f, 0.22f, depth + 0.45f), concrete, false);
                Box(root, "Roof terrace parapet", new Vector3(0f, height, 0f),
                    new Vector3(width + 0.2f, 0.55f, depth + 0.2f), stone, false);
                Box(root, "Retail entrance canopy", new Vector3(0f, 2.35f, depth * 0.5f + 1.1f),
                    new Vector3(width * 0.76f, 0.18f, 2.1f), metal, false);
                Box(root, "Illuminated shop fascia", new Vector3(0f, 2.35f, depth * 0.5f + 0.11f),
                    new Vector3(width * 0.68f, 0.34f, 0.09f), signGlow, false);

                for (int bay = -2; bay <= 2; bay++)
                {
                    float finX = bay * (width / 5f);
                    Box(root, "Facade vertical bronze fin",
                        new Vector3(finX, 5.15f, depth * 0.5f + 0.12f),
                        new Vector3(0.12f, 3.5f, 0.18f), metal, false);
                }
                for (int sideIndex = -1; sideIndex <= 1; sideIndex += 2)
                {
                    Box(root, "Corner stone pier",
                        new Vector3(sideIndex * (width * 0.5f - 0.22f), 3.3f, depth * 0.5f + 0.12f),
                        new Vector3(0.42f, 6.6f, 0.32f), warmStone, false);
                }

                // A shallow planted roof deck gives the low-rise blocks a
                // recognisable mixed-use terrace silhouette.
                Box(root, "Roof garden planter", new Vector3(0f, height + 0.42f, -depth * 0.22f),
                    new Vector3(width * 0.62f, 0.72f, 2.0f), warmStone, false);
                Box(root, "Roof shade pergola beam", new Vector3(0f, height + 2.1f, -depth * 0.22f),
                    new Vector3(width * 0.58f, 0.14f, 2.5f), metal, false);
                GameObjectUtility.SetStaticEditorFlags(block,
                    StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccludeeStatic |
                    StaticEditorFlags.OccluderStatic | StaticEditorFlags.ContributeGI);
            }
        }

        private static void BuildExpandedUrbanGrid(Transform parent, Material concrete,
            Material stone, Material glass, Material litGlass, Material metal)
        {
            int[] rows = { -190, -125, 125, 190 };
            float[] columns = { -100f, -52f, 52f, 100f };
            int seed = 20;
            foreach (int z in rows)
            foreach (float x in columns)
            {
                float width = (seed % 3 == 0) ? 19f : 16f;
                float depth = (seed % 2 == 0) ? 18f : 15f;
                int floors = 11 + (seed * 7 % 13);
                BuildTower(parent, "UCENO Skyline Tower " + seed,
                    new Vector3(x, 0f, z + ((seed % 2 == 0) ? 10f : -10f)),
                    width, depth, floors, seed, concrete, stone, glass, litGlass, metal);
                seed++;
            }

            Material asphalt = CreateMaterial("UCENO_City_Grid_Asphalt",
                new Color(0.105f, 0.12f, 0.135f), 0.08f, 0.22f);
            Material markings = CreateMaterial("UCENO_City_Grid_Road_Marking",
                new Color(0.86f, 0.84f, 0.74f), 0.02f, 0.18f);
            for (int side = -1; side <= 1; side += 2)
            for (int segment = -180; segment <= 180; segment += 120)
            {
                Transform boulevard = new GameObject("UCENO Secondary Boulevard " + side + " Segment " + segment).transform;
                boulevard.SetParent(parent, false);
                boulevard.localPosition = new Vector3(side * 72f, 0f, segment);
                Box(boulevard, "Boulevard asphalt", Vector3.zero,
                    new Vector3(12f, 0.12f, 132f), asphalt, true);
                Box(boulevard, "Boulevard median", new Vector3(0f, 0.08f, 0f),
                    new Vector3(0.45f, 0.08f, 132f), concrete, false);
                for (int z = -60; z <= 60; z += 18)
                    Box(boulevard, "Lane dash", new Vector3(-2.8f, 0.16f, z),
                        new Vector3(0.10f, 0.025f, 7f), markings, false);
            }

            for (int z = -180; z <= 180; z += 90)
            {
                Transform crossStreet = new GameObject("UCENO Cross Street " + z).transform;
                crossStreet.SetParent(parent, false);
                crossStreet.localPosition = new Vector3(0f, 0f, z);
                Box(crossStreet, "Cross street asphalt", Vector3.zero,
                    new Vector3(250f, 0.12f, 10f), asphalt, true);
                for (int x = -115; x <= 115; x += 18)
                    Box(crossStreet, "Cross street lane dash", new Vector3(x, 0.16f, 0f),
                        new Vector3(7f, 0.025f, 0.10f), markings, false);
            }
        }

        private static void BuildTower(Transform parent, string name, Vector3 origin,
            float width, float depth, int floors, int seed,
            Material concrete, Material stone, Material glass, Material litGlass, Material metal)
        {
            GameObject root = new GameObject(name);
            root.transform.SetParent(parent, false);
            root.transform.localPosition = origin;
            float floorHeight = 3.55f;
            float height = floors * floorHeight;

            Box(root.transform, "Podium", new Vector3(0f, 1.25f, 0f),
                new Vector3(width + 5f, 2.5f, depth + 5f), stone, true);
            Box(root.transform, "Lobby glazing", new Vector3(0f, 1.55f, depth * 0.5f + 2.53f),
                new Vector3(width + 1f, 1.9f, 0.12f), glass, false);

            // A legible, human-scale entrance portal gives the tower podium
            // a designed arrival point instead of an uninterrupted blank base.
            float portalZ = depth * 0.5f + 2.62f;
            for (int side = -1; side <= 1; side += 2)
            {
                Box(root.transform, "Lobby portal stone jamb",
                    new Vector3(side * (width * 0.28f), 2.15f, portalZ),
                    new Vector3(0.42f, 3.1f, 0.42f), concrete, false);
                Box(root.transform, "Lobby portal metal reveal",
                    new Vector3(side * (width * 0.28f - 0.28f), 2.15f, portalZ + 0.22f),
                    new Vector3(0.075f, 2.65f, 0.08f), metal, false);
            }
            Box(root.transform, "Lobby portal header",
                new Vector3(0f, 3.72f, portalZ),
                new Vector3(width * 0.58f, 0.38f, 0.48f), stone, false);
            Box(root.transform, "Lobby entrance threshold",
                new Vector3(0f, 0.12f, portalZ + 0.18f),
                new Vector3(width * 0.58f, 0.16f, 1.05f), metal, false);

            // Recessed floor bands, curtain-wall glazing, structural piers,
            // and metal fins create a varied high-rise facade rather than a
            // single repeated solid box.
            for (int floor = 0; floor < floors; floor++)
            {
                float y = 2.5f + floor * floorHeight;
                float inset = floor > floors * 0.72f ? (floor - floors * 0.72f) * 0.32f : 0f;
                float w = width - inset;
                float d = depth - inset * 0.8f;
                Box(root.transform, "Floor slab " + floor, new Vector3(0f, y, 0f),
                    new Vector3(w + 0.35f, 0.22f, d + 0.35f), concrete, false);

                Material windowMaterial = ((floor + seed * 3) % 5 == 0) ? litGlass : glass;
                float windowY = y + floorHeight * 0.53f;
                Box(root.transform, "Front curtain wall " + floor,
                    new Vector3(0f, windowY, d * 0.5f - 0.08f),
                    new Vector3(w - 0.65f, 2.15f, 0.12f), windowMaterial, false);
                Box(root.transform, "Rear curtain wall " + floor,
                    new Vector3(0f, windowY, -d * 0.5f + 0.08f),
                    new Vector3(w - 0.65f, 2.15f, 0.12f), windowMaterial, false);
                Box(root.transform, "Left curtain wall " + floor,
                    new Vector3(-w * 0.5f + 0.08f, windowY, 0f),
                    new Vector3(0.12f, 2.15f, d - 0.65f), windowMaterial, false);
                Box(root.transform, "Right curtain wall " + floor,
                    new Vector3(w * 0.5f - 0.08f, windowY, 0f),
                    new Vector3(0.12f, 2.15f, d - 0.65f), windowMaterial, false);

                float mullionY = windowY;
                for (int bay = -2; bay <= 2; bay++)
                {
                    float px = bay * (w / 5f);
                    Box(root.transform, "Front mullion", new Vector3(px, mullionY, d * 0.5f - 0.16f),
                        new Vector3(0.055f, 2.25f, 0.10f), metal, false);
                    Box(root.transform, "Rear mullion", new Vector3(px, mullionY, -d * 0.5f + 0.16f),
                        new Vector3(0.055f, 2.25f, 0.10f), metal, false);
                }

                // Side-facade mullions keep the curtain wall articulated from
                // oblique camera angles instead of reading as a flat glass slab.
                for (int bay = -2; bay <= 2; bay++)
                {
                    float pz = bay * (d / 5f);
                    Box(root.transform, "Left facade mullion",
                        new Vector3(-w * 0.5f + 0.16f, mullionY, pz),
                        new Vector3(0.10f, 2.25f, 0.055f), metal, false);
                    Box(root.transform, "Right facade mullion",
                        new Vector3(w * 0.5f - 0.16f, mullionY, pz),
                        new Vector3(0.10f, 2.25f, 0.055f), metal, false);
                }

                // Subtle alternating shadow fins add depth and reduce the
                // repetitive appearance across the generated tower family.
                if ((floor + seed) % 3 == 0)
                {
                    for (int fin = -1; fin <= 1; fin++)
                    {
                        float finX = fin * (w * 0.31f);
                        Box(root.transform, "Front vertical solar shade fin",
                            new Vector3(finX, windowY, d * 0.5f + 0.015f),
                            new Vector3(0.16f, 2.45f, 0.22f), stone, false);
                    }
                }

                if (floor % 4 == 0 && floor > 1)
                {
                    Box(root.transform, "Front balcony", new Vector3(0f, y + 0.32f, d * 0.5f + 0.72f),
                        new Vector3(w * 0.48f, 0.12f, 1.25f), concrete, false);
                    Box(root.transform, "Balcony rail", new Vector3(0f, y + 0.9f, d * 0.5f + 1.28f),
                        new Vector3(w * 0.48f, 0.9f, 0.055f), metal, false);
                }
            }

            // Strong corner piers and a distinctive stepped crown give each
            // tower its own silhouette.
            for (int sx = -1; sx <= 1; sx += 2)
            for (int sz = -1; sz <= 1; sz += 2)
                Box(root.transform, "Corner structural pier",
                    new Vector3(sx * (width * 0.5f - 0.28f), height * 0.5f + 1.8f,
                        sz * (depth * 0.5f - 0.28f)),
                    new Vector3(0.42f, height, 0.42f), concrete, true);

            Box(root.transform, "Crown", new Vector3(0f, height + 3.1f, 0f),
                new Vector3(width * 0.72f, 2.1f, depth * 0.72f), stone, false);
            Box(root.transform, "Roof feature", new Vector3(0f, height + 5.0f, 0f),
                new Vector3(width * 0.34f, 1.7f, depth * 0.34f), metal, false);

            // Roof plant and communications details vary deterministically by
            // tower seed, creating a more convincing skyline without runtime
            // lights, scripts, or expensive animated geometry.
            float plantWidth = width * (0.24f + (seed % 3) * 0.035f);
            float plantDepth = depth * 0.22f;
            float plantY = height + 6.25f;
            Box(root.transform, "Rooftop mechanical penthouse",
                new Vector3((seed % 2 == 0 ? -1f : 1f) * width * 0.22f, plantY, -depth * 0.18f),
                new Vector3(plantWidth, 2.5f + (seed % 2) * 0.55f, plantDepth), concrete, false);
            Box(root.transform, "Rooftop plant screen",
                new Vector3((seed % 2 == 0 ? -1f : 1f) * width * 0.22f, plantY + 1.25f, -depth * 0.18f),
                new Vector3(plantWidth + 0.18f, 0.12f, plantDepth + 0.18f), metal, false);

            if (seed % 3 != 1)
            {
                float mastHeight = 4.5f + (seed % 4) * 1.25f;
                float mastX = (seed % 2 == 0 ? 1f : -1f) * width * 0.18f;
                Box(root.transform, "Roof communications mast",
                    new Vector3(mastX, height + 7.2f + mastHeight * 0.5f, depth * 0.18f),
                    new Vector3(0.12f, mastHeight, 0.12f), metal, false);
                Box(root.transform, "Roof mast crossarm",
                    new Vector3(mastX, height + 8.4f + mastHeight * 0.55f, depth * 0.18f),
                    new Vector3(1.15f, 0.10f, 0.10f), metal, false);
            }

            // A simple ground-level entrance canopy makes the tower base
            // legible at street scale.
            Box(root.transform, "Entrance canopy", new Vector3(0f, 3.0f, depth * 0.5f + 2.1f),
                new Vector3(width * 0.42f, 0.22f, 3.4f), metal, false);

            GameObject distant = GameObject.CreatePrimitive(PrimitiveType.Cube);
            distant.name = "Distance Skyline LOD";
            distant.transform.SetParent(root.transform, false);
            distant.transform.localPosition = new Vector3(0f, height * 0.5f + 1.8f, 0f);
            distant.transform.localScale = new Vector3(width * 0.82f, height, depth * 0.82f);
            distant.GetComponent<Renderer>().sharedMaterial = stone;
            Collider distantCollider = distant.GetComponent<Collider>();
            if (distantCollider != null) Object.DestroyImmediate(distantCollider);
            Renderer[] detailedRenderers = root.GetComponentsInChildren<Renderer>(true);
            Renderer distantRenderer = distant.GetComponent<Renderer>();
            Renderer[] closeRenderers = System.Array.FindAll(detailedRenderers,
                renderer => renderer != distantRenderer);
            LODGroup lodGroup = root.AddComponent<LODGroup>();
            lodGroup.SetLODs(new[]
            {
                new LOD(0.22f, closeRenderers),
                new LOD(0.035f, new[] { distantRenderer })
            });
            lodGroup.RecalculateBounds();

            GameObjectUtility.SetStaticEditorFlags(root,
                StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccludeeStatic |
                StaticEditorFlags.OccluderStatic | StaticEditorFlags.ContributeGI);
        }

        private static void BuildPlaza(Transform parent, Material stone, Material metal, Material concrete)
        {
            GameObject plaza = new GameObject("UCENO Skyline Arrival Plaza");
            plaza.transform.SetParent(parent, false);
            plaza.transform.localPosition = new Vector3(0f, 0f, 150f);
            Box(plaza.transform, "Plaza platform", Vector3.zero,
                new Vector3(82f, 0.35f, 34f), concrete, true);
            Box(plaza.transform, "Reflecting pool", new Vector3(0f, 0.22f, 5f),
                new Vector3(24f, 0.08f, 12f), stone, false);
            for (int i = -3; i <= 3; i++)
            {
                Box(plaza.transform, "Sculptural light column " + i,
                    new Vector3(i * 10f, 3.1f, -9f),
                    new Vector3(0.28f, 6.2f, 0.28f), metal, false);
            }
        }

        private static GameObject Box(Transform parent, string name, Vector3 position,
            Vector3 scale, Material material, bool collider)
        {
            GameObject box = GameObject.CreatePrimitive(PrimitiveType.Cube);
            box.name = name;
            box.transform.SetParent(parent, false);
            box.transform.localPosition = position;
            box.transform.localScale = scale;
            Renderer renderer = box.GetComponent<Renderer>();
            renderer.sharedMaterial = material;
            if (!collider)
            {
                Collider shape = box.GetComponent<Collider>();
                if (shape != null) Object.DestroyImmediate(shape);
            }
            GameObjectUtility.SetStaticEditorFlags(box,
                StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccludeeStatic);
            return box;
        }

        private static Material CreateMaterial(string name, Color color, float metallic, float smoothness)
        {
            string folder = "Assets/UCENO/Materials";
            if (!AssetDatabase.IsValidFolder(folder))
                AssetDatabase.CreateFolder("Assets/UCENO", "Materials");
            string path = folder + "/" + name + ".mat";
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
