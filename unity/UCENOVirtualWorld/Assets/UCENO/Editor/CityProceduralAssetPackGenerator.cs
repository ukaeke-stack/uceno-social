#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace UCENO.VirtualWorld.Editor
{
    [Serializable] internal sealed class CityAssetCatalog { public CityAssetCity[] cities; }
    [Serializable] internal sealed class CityAssetCity { public string id, identity, climate, architecture; public CityAssetLandmark[] landmarks; }
    [Serializable] internal sealed class CityAssetLandmark { public string id; }
    [Serializable] internal sealed class GeneratedCityProfiles
    {
        public int version = 2;
        public string description = "Generated, city-owned mesh prefab packs. Every city receives unique geometry, three authored LODs and its own panoramic environment texture.";
        public GeneratedCityProfile[] cities;
    }
    [Serializable] internal sealed class GeneratedCityProfile
    {
        public string cityId, assetRoot, skyboxTexture;
        public string[] architecturePrefabs, environmentPrefabs;
        public GeneratedCityLandmark[] landmarks;
    }
    [Serializable] internal sealed class GeneratedCityLandmark { public string landmarkId, prefab; }

    /// <summary>
    /// Creates city-owned mesh assets before the strict scene pipeline runs.
    /// Geometry is authored as saved meshes and prefabs, not scene-time primitive
    /// placeholders. Each city receives a different silhouette palette and form language.
    /// </summary>
    public static class CityProceduralAssetPackGenerator
    {
        private const string CatalogPath = "runtime/world-gateway/config/world-cities.json";
        private const string ProfilePath = "unity/UCENOVirtualWorld/Assets/UCENO/Editor/city-scene-asset-profiles.json";
        private static readonly string[] ArchitectureNames =
        {
            "signature-skyline-anchor", "residential-typology", "commercial-civic-typology",
            "transit-industrial-structure", "public-realm-structure"
        };
        private static readonly string[] EnvironmentNames =
        {
            "biome-tree", "ground-cover", "street-furniture", "signature-landscape-prop"
        };
        private static readonly Color[] CityColors =
        {
            new Color(.24f,.65f,.78f), new Color(.20f,.48f,.32f), new Color(.36f,.55f,.82f),
            new Color(.62f,.72f,.82f), new Color(.78f,.52f,.27f), new Color(.22f,.54f,.57f),
            new Color(.46f,.27f,.72f), new Color(.63f,.58f,.31f), new Color(.42f,.49f,.55f)
        };

        [MenuItem("UCENO/World/Generate Nine City-Specific Asset Packs", false, 30)]
        public static void GenerateAll()
        {
            // This legacy generator creates synthetic meshes and flat materials. It is not an imported-art pipeline.
            // Keep it disabled so it cannot overwrite city profiles or create blockouts that look like finished assets.
            throw new InvalidOperationException(
                "Procedural city asset generation is disabled for release work. Import licensed, city-specific FBX/prefab packs, 1K+ PBR textures and HDRI panoramas, record source-manifest.json for each city, then run UCENO > World > Validate Imported City Art Packs. The nine-city scene pipeline will remain blocked until that gate passes.");
            string root = RepositoryRoot();
            string catalogPath = Path.Combine(root, CatalogPath);
            if (!File.Exists(catalogPath)) throw new InvalidOperationException("Missing city catalogue: " + catalogPath);
            CityAssetCatalog catalog = JsonUtility.FromJson<CityAssetCatalog>(File.ReadAllText(catalogPath));
            if (catalog?.cities == null || catalog.cities.Length != 10)
                throw new InvalidOperationException("Expected the ten-city catalogue (Meridian Prime plus nine remaining cities).");

            var generated = new List<GeneratedCityProfile>();
            int cityIndex = 0;
            foreach (CityAssetCity city in catalog.cities)
            {
                if (city == null || string.IsNullOrWhiteSpace(city.id)) throw new InvalidOperationException("Invalid city catalogue entry.");
                if (city.id == "meridian") { cityIndex++; continue; }

                string cityRoot = "Assets/UCENO/Cities/" + city.id;
                EnsureFolder("Assets/UCENO/Cities");
                EnsureFolder(cityRoot);
                EnsureFolder(cityRoot + "/Meshes");
                EnsureFolder(cityRoot + "/Prefabs");
                EnsureFolder(cityRoot + "/Prefabs/Architecture");
                EnsureFolder(cityRoot + "/Prefabs/Environment");
                EnsureFolder(cityRoot + "/Prefabs/Landmarks");
                EnsureFolder(cityRoot + "/Textures");
                EnsureFolder(cityRoot + "/Textures/Skybox");

                int architecturalStyle = DetermineArchitecturalStyle(city.architecture);
                Material material = CreateCityMaterial(city.id, cityIndex);
                var profile = new GeneratedCityProfile
                {
                    cityId = city.id,
                    assetRoot = cityRoot + "/Prefabs",
                    architecturePrefabs = new string[ArchitectureNames.Length],
                    environmentPrefabs = new string[EnvironmentNames.Length],
                    landmarks = new GeneratedCityLandmark[city.landmarks?.Length ?? 0],
                    skyboxTexture = CreatePanorama(cityRoot, city.id, cityIndex)
                };

                for (int i = 0; i < ArchitectureNames.Length; i++)
                {
                    string path = cityRoot + "/Prefabs/Architecture/" + ArchitectureNames[i] + ".prefab";
                    CreatePrefab(cityRoot, city.id, "architecture-" + i, path, material, architecturalStyle, i, false);
                    profile.architecturePrefabs[i] = path;
                }
                for (int i = 0; i < EnvironmentNames.Length; i++)
                {
                    string path = cityRoot + "/Prefabs/Environment/" + EnvironmentNames[i] + ".prefab";
                    CreatePrefab(cityRoot, city.id, "environment-" + i, path, material, architecturalStyle, i, true);
                    profile.environmentPrefabs[i] = path;
                }
                for (int i = 0; i < profile.landmarks.Length; i++)
                {
                    string landmarkId = city.landmarks[i].id;
                    string path = cityRoot + "/Prefabs/Landmarks/" + landmarkId + ".prefab";
                    CreatePrefab(cityRoot, city.id, "landmark-" + landmarkId, path, material, architecturalStyle, i, false);
                    profile.landmarks[i] = new GeneratedCityLandmark { landmarkId = landmarkId, prefab = path };
                }
                generated.Add(profile);
                cityIndex++;
            }

            var document = new GeneratedCityProfiles { cities = generated.ToArray() };
            File.WriteAllText(Path.Combine(root, ProfilePath), JsonUtility.ToJson(document, true));
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();

            // Validate the actual imported Unity assets immediately, rather than
            // treating successful file generation as proof that the scene pipeline
            // can consume them. This checks prefab geometry, all three LODs,
            // city-unique asset ownership, panorama imports and landmark targeting.
            WorldCityScenePipeline.ValidateRemainingCityPacks();

            Debug.Log("Generated and validated " + generated.Count +
                " city-owned asset packs. District scene generation and visual acceptance remain separate steps.");
        }

        private static int DetermineArchitecturalStyle(string architecture)
        {
            string value = (architecture ?? string.Empty).ToLowerInvariant();
            if (value.Contains("terraced waterfront") || value.Contains("marina")) return 0;
            if (value.Contains("biophilic") || value.Contains("forest") || value.Contains("botanical")) return 1;
            if (value.Contains("parametric") || value.Contains("research") || value.Contains("kinetic")) return 2;
            if (value.Contains("hillside") || value.Contains("alpine") || value.Contains("cable transit")) return 3;
            if (value.Contains("shaded arcade") || value.Contains("solar mega") || value.Contains("oasis")) return 4;
            if (value.Contains("elevated") || value.Contains("flood") || value.Contains("canal")) return 5;
            if (value.Contains("entertainment") || value.Contains("kinetic light") || value.Contains("nightlife")) return 6;
            if (value.Contains("garden city") || value.Contains("agr") || value.Contains("campus")) return 7;
            if (value.Contains("industrial") || value.Contains("logistics") || value.Contains("manufacturing")) return 8;
            throw new InvalidOperationException("No city-specific architectural style rule matches: " + architecture);
        }

        private static void CreatePrefab(string cityRoot, string cityId, string assetKey, string prefabPath,
            Material material, int architecturalStyle, int kind, bool environment)
        {
            string meshFolder = cityRoot + "/Meshes";
            var root = new GameObject(cityId + " " + assetKey);
            var lodRenderers = new Renderer[3];
            Mesh highestDetailMesh = null;
            try
            {
                for (int lod = 0; lod < 3; lod++)
                {
                    Mesh mesh = BuildMesh(architecturalStyle, kind, lod, environment, assetKey);
                    mesh.name = cityId + "_" + assetKey + "_LOD" + lod;
                    if (lod == 0) highestDetailMesh = mesh;
                    string meshPath = meshFolder + "/" + cityId + "_" + assetKey + "_LOD" + lod + ".asset";
                    UnityEngine.Object existing = AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(meshPath);
                    if (existing != null) AssetDatabase.DeleteAsset(meshPath);
                    AssetDatabase.CreateAsset(mesh, meshPath);

                    var lodObject = new GameObject("LOD" + lod);
                    lodObject.transform.SetParent(root.transform, false);
                    var filter = lodObject.AddComponent<MeshFilter>();
                    filter.sharedMesh = mesh;
                    var renderer = lodObject.AddComponent<MeshRenderer>();
                    renderer.sharedMaterial = material;
                    renderer.shadowCastingMode = lod == 2 ? ShadowCastingMode.Off : ShadowCastingMode.On;
                    renderer.receiveShadows = lod != 2;
                    lodRenderers[lod] = renderer;
                }
                LODGroup group = root.AddComponent<LODGroup>();
                group.fadeMode = LODFadeMode.CrossFade;
                group.animateCrossFading = true;
                group.SetLODs(new[]
                {
                    new LOD(.24f, new[] { lodRenderers[0] }),
                    new LOD(.075f, new[] { lodRenderers[1] }),
                    new LOD(.012f, new[] { lodRenderers[2] })
                });
                group.RecalculateBounds();

                // The city scene pipeline rejects decorative landmark prefabs that
                // cannot be targeted by the interaction raycaster. Give each
                // generated landmark a real root marker and a collider derived
                // from its highest-detail mesh bounds. The scene registry exporter
                // assigns the final stable scene ID after the prefab is placed.
                if (assetKey.StartsWith("landmark-", StringComparison.Ordinal))
                {
                    root.AddComponent<WorldInteractable>();
                    if (highestDetailMesh == null || highestDetailMesh.bounds.size.sqrMagnitude < 0.0001f)
                        throw new InvalidOperationException("Landmark mesh has no usable collider bounds: " + assetKey);
                    BoxCollider collider = root.AddComponent<BoxCollider>();
                    collider.center = highestDetailMesh.bounds.center;
                    collider.size = highestDetailMesh.bounds.size;
                    collider.isTrigger = false;
                }

                PrefabUtility.SaveAsPrefabAsset(root, prefabPath);
            }
            finally { UnityEngine.Object.DestroyImmediate(root); }
        }

        private static Mesh BuildMesh(int architecturalStyle, int kind, int lod, bool environment, string key)
        {
            var b = new MeshBuilder();
            float detail = lod == 0 ? 1f : lod == 1 ? .55f : .18f;
            int style = architecturalStyle;
            if (environment)
            {
                switch (kind)
                {
                    case 0: // biome tree
                        b.Cylinder(0, 0, 0, .38f, 5.2f, 10);
                        b.Ellipsoid(0, 5.6f, 0, 2.3f + style * .08f, 2.1f, 2.3f, lod == 2 ? 6 : 10);
                        if (lod == 0 && style == 1) b.Ellipsoid(0, 7.0f, 0, 1.7f, 1.7f, 1.7f, 9);
                        break;
                    case 1: // ground cover / planting clusters
                        for (int i = 0; i < (lod == 0 ? 9 : lod == 1 ? 5 : 2); i++)
                            b.Cone((i % 3 - 1) * .8f, .6f + (i % 2) * .2f, (i / 3 - 1) * .8f, .32f, 1.4f + (i % 3) * .25f, 6);
                        b.Box(0, .12f, 0, 3.2f, .2f, 3.2f);
                        break;
                    case 2: // furniture / transit shelter
                        b.Box(0, .55f, 0, 3.2f, .18f, .65f);
                        b.Box(0, 1.05f, -.25f, 3.2f, .85f, .16f);
                        b.Box(0, 2.55f, 0, 3.8f, .18f, 2.0f);
                        if (lod == 0) for (int x = -1; x <= 1; x += 2)
                            for (int z = -1; z <= 1; z += 2) b.Box(x * 1.7f, 1.3f, z * .85f, .12f, 2.5f, .12f);
                        break;
                    default: // signature landscape sculpture / water feature
                        b.Cylinder(0, .25f, 0, 3.2f, .35f, lod == 2 ? 8 : 20);
                        b.Cylinder(0, 1.3f, 0, .28f, 2.1f, lod == 2 ? 6 : 12);
                        b.Ellipsoid(0, 2.7f, 0, 1.5f + style * .05f, .7f, 1.5f, lod == 2 ? 6 : 12);
                        break;
                }
            }
            else if (key.StartsWith("landmark-", StringComparison.Ordinal))
            {
                float h = 24f + (kind % 3) * 8f + style * 1.1f;
                if (style == 4) { b.Box(0, 2, 0, 24, 4, 18); b.Cylinder(0, h * .55f, 0, 8, h, lod == 2 ? 8 : 18); }
                else if (style == 5) { b.Box(0, 4, 0, 28, 8, 20); b.Box(0, 12, 0, 34, 2, 24); b.Box(0, 18, 0, 24, 2, 18); }
                else if (style == 6) { b.Cylinder(0, h * .5f, 0, 10, h, lod == 2 ? 8 : 24); b.Cylinder(0, h + 2, 0, 13, 2, lod == 2 ? 8 : 24); }
                else if (style == 8) { b.Box(0, 4, 0, 30, 8, 20); b.Box(0, 12, 0, 22, 8, 16); b.Box(0, 20, 0, 14, 8, 12); }
                else { b.Frustum(0, h * .5f, 0, 14, 14, 7 + style, 7 + style, h); b.Cylinder(0, h + 1.5f, 0, 5, 3, lod == 2 ? 8 : 18); }
                if (lod == 0) for (int i = 0; i < 8; i++)
                    b.Box((float)Math.Cos(i * Math.PI / 4) * 8, h * .25f, (float)Math.Sin(i * Math.PI / 4) * 8, .45f, h * .5f, .45f);
            }
            else
            {
                float width = environment ? 1 : 18f + (style % 3) * 2f;
                switch (kind)
                {
                    case 0: // signature skyline anchor
                        b.Frustum(0, 22 + style, 0, width, width, width * (.38f + style * .015f), width * (.38f + style * .015f), 44 + style * 2);
                        b.Box(0, 4, 0, width + 4, 1.2f, width + 4);
                        if (lod == 0) for (int floor = 1; floor < 9; floor++)
                            b.Box(0, floor * 4.2f, 0, width + 1.5f, .18f, width + 1.5f);
                        if (style == 1) for (int side = -1; side <= 1; side++) b.Box(side * 7, 24, 0, 1.2f, 48, 1.2f);
                        if (style == 4) b.Cone(0, 48, 0, 6, 12, 8);
                        break;
                    case 1: // residential
                        b.Box(0, 9, 0, 26, 18, 20);
                        b.Box(0, 19, 0, 22, 3, 18);
                        if (lod == 0) for (int floor = 1; floor < 5; floor++)
                            b.Box(0, floor * 3.2f, 10.3f, 27, .22f, 1.0f);
                        if (style == 0 || style == 4) b.Box(0, 1.5f, 0, 29, 1.2f, 23);
                        break;
                    case 2: // commercial and civic
                        b.Box(0, 8, 0, 34, 16, 24);
                        b.Box(0, 17, 0, 27, 2, 19);
                        if (lod == 0) for (int x = -2; x <= 2; x++)
                            b.Cylinder(x * 5, 5, 12, .55f, 10, 10);
                        if (style == 2) b.Frustum(0, 23, 0, 18, 14, 9, 7, 12);
                        break;
                    case 3: // transit and industrial
                        b.Box(0, 5, 0, 42, 10, 22);
                        b.Box(0, 11, 0, 48, 1.2f, 27);
                        if (lod == 0) for (int x = -2; x <= 2; x++)
                            b.Box(x * 9, 7, 0, .7f, 12, 23);
                        if (style == 8) for (int x = -1; x <= 1; x++) b.Cylinder(x * 12, 17, 0, 1.1f, 14, 10);
                        break;
                    default: // civic/public realm pavilion
                        b.Box(0, 1, 0, 34, 2, 28);
                        b.Box(0, 10, 0, 34, 1.5f, 28);
                        if (lod == 0) for (int x = -2; x <= 2; x++)
                            for (int z = -1; z <= 1; z += 2) b.Cylinder(x * 6, 5, z * 11, .65f, 9, 10);
                        if (style == 7) b.Ellipsoid(0, 12, 0, 7, 3, 7, lod == 2 ? 6 : 12);
                        break;
                }
                if (lod == 0)
                {
                    int fins = 4 + style % 5;
                    for (int i = 0; i < fins; i++)
                        b.Box(-width * .48f + i * width * .96f / Math.Max(1, fins - 1), 18, -width * .53f,
                            .42f, 34, .55f);
                }
            }
            return b.ToMesh(key + "_mesh");
        }

        private static Material CreateCityMaterial(string cityId, int index)
        {
            string folder = "Assets/UCENO/Materials/Cities";
            EnsureFolder("Assets/UCENO/Materials");
            EnsureFolder(folder);
            string path = folder + "/UCENO_" + cityId + "_Generated.mat";
            Material material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null)
            {
                Shader shader = Shader.Find("Standard");
                if (shader == null) throw new InvalidOperationException("Standard shader is unavailable.");
                material = new Material(shader);
                AssetDatabase.CreateAsset(material, path);
            }
            Color baseColor = CityColors[index % CityColors.Length];
            material.color = Color.Lerp(baseColor, new Color(.78f,.81f,.83f), .18f);
            material.SetFloat("_Metallic", .32f + (index % 4) * .08f);
            material.SetFloat("_Glossiness", .62f);
            EditorUtility.SetDirty(material);
            return material;
        }

        private static string CreatePanorama(string cityRoot, string cityId, int index)
        {
            string path = cityRoot + "/Textures/Skybox/" + cityId + "_environment.asset";
            Texture2D texture = AssetDatabase.LoadAssetAtPath<Texture2D>(path);
            if (texture != null) AssetDatabase.DeleteAsset(path);
            texture = new Texture2D(512, 256, TextureFormat.RGBA32, false, true)
            { name = cityId + "_environment", wrapMode = TextureWrapMode.Repeat, filterMode = FilterMode.Bilinear };
            Color horizon = CityColors[index % CityColors.Length];
            Color zenith = Color.Lerp(horizon, new Color(.035f,.075f,.15f), .72f);
            for (int y = 0; y < 256; y++)
            {
                float t = y / 255f;
                Color row = Color.Lerp(horizon, zenith, Mathf.SmoothStep(0, 1, t));
                for (int x = 0; x < 512; x++)
                {
                    float sun = Mathf.Clamp01(1f - Mathf.Abs(x - (80 + index * 41) % 512) / 70f) * Mathf.Clamp01(1f - Mathf.Abs(y - 145) / 45f);
                    texture.SetPixel(x, y, Color.Lerp(row, new Color(1f,.78f,.52f), sun * .42f));
                }
            }
            texture.Apply(false, false);
            AssetDatabase.CreateAsset(texture, path);
            return path;
        }

        private static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            string parent = Path.GetDirectoryName(path).Replace("\\", "/");
            string name = Path.GetFileName(path);
            if (!AssetDatabase.IsValidFolder(parent)) EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, name);
        }

        private static string RepositoryRoot()
        {
            return Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", ".."));
        }

        private sealed class MeshBuilder
        {
            private readonly List<Vector3> vertices = new List<Vector3>();
            private readonly List<int> triangles = new List<int>();

            public void Box(float x, float y, float z, float sx, float sy, float sz)
            {
                Frustum(x, y, z, sx, sz, sx, sz, sy);
            }

            public void Frustum(float x, float y, float z, float bottomX, float bottomZ,
                float topX, float topZ, float height)
            {
                int start = vertices.Count;
                vertices.Add(new Vector3(x-bottomX/2,y-height/2,z-bottomZ/2));
                vertices.Add(new Vector3(x+bottomX/2,y-height/2,z-bottomZ/2));
                vertices.Add(new Vector3(x+bottomX/2,y-height/2,z+bottomZ/2));
                vertices.Add(new Vector3(x-bottomX/2,y-height/2,z+bottomZ/2));
                vertices.Add(new Vector3(x-topX/2,y+height/2,z-topZ/2));
                vertices.Add(new Vector3(x+topX/2,y+height/2,z-topZ/2));
                vertices.Add(new Vector3(x+topX/2,y+height/2,z+topZ/2));
                vertices.Add(new Vector3(x-topX/2,y+height/2,z+topZ/2));
                int[] faces = {0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7};
                for (int i=0;i<faces.Length;i++) triangles.Add(start+faces[i]);
            }

            public void Cylinder(float x, float y, float z, float radius, float height, int sides)
            {
                int start = vertices.Count;
                for (int ring = 0; ring < 2; ring++)
                    for (int i = 0; i < sides; i++)
                    {
                        double a = Math.PI * 2 * i / sides;
                        vertices.Add(new Vector3(x + (float)Math.Cos(a) * radius,
                            y + (ring == 0 ? -height / 2 : height / 2),
                            z + (float)Math.Sin(a) * radius));
                    }
                int bottomCenter = vertices.Count;
                vertices.Add(new Vector3(x, y - height / 2, z));
                int topCenter = vertices.Count;
                vertices.Add(new Vector3(x, y + height / 2, z));
                for (int i = 0; i < sides; i++)
                {
                    int next = (i + 1) % sides;
                    triangles.AddRange(new[] { start + i, start + next, start + sides + next,
                        start + i, start + sides + next, start + sides + i });
                    triangles.AddRange(new[] { bottomCenter, start + next, start + i });
                    triangles.AddRange(new[] { topCenter, start + sides + i, start + sides + next });
                }
            }

            public void Cone(float x,float y,float z,float radius,float height,int sides)
            {
                int start=vertices.Count;
                vertices.Add(new Vector3(x,y+height/2,z));
                for(int i=0;i<sides;i++)
                {
                    double a=Math.PI*2*i/sides;
                    vertices.Add(new Vector3(x+(float)Math.Cos(a)*radius,y-height/2,z+(float)Math.Sin(a)*radius));
                }
                for(int i=0;i<sides;i++) triangles.AddRange(new[]{start,start+1+i,start+1+(i+1)%sides});
            }

            public void Ellipsoid(float x,float y,float z,float rx,float ry,float rz,int segments)
            {
                int rings=Math.Max(4,segments/2), start=vertices.Count;
                for(int r=0;r<=rings;r++)
                {
                    double phi=Math.PI*r/rings;
                    for(int s=0;s<=segments;s++)
                    {
                        double theta=Math.PI*2*s/segments;
                        vertices.Add(new Vector3(x+(float)(Math.Sin(phi)*Math.Cos(theta))*rx,
                            y+(float)Math.Cos(phi)*ry,z+(float)(Math.Sin(phi)*Math.Sin(theta))*rz));
                    }
                }
                for(int r=0;r<rings;r++) for(int s=0;s<segments;s++)
                {
                    int a=start+r*(segments+1)+s, b=a+segments+1;
                    triangles.AddRange(new[]{a,b,a+1,a+1,b,b+1});
                }
            }

            public Mesh ToMesh(string name)
            {
                var mesh = new Mesh { name = name, indexFormat = IndexFormat.UInt32 };
                mesh.SetVertices(vertices);
                mesh.SetTriangles(triangles, 0);
                mesh.RecalculateNormals();
                mesh.RecalculateBounds();
                return mesh;
            }
        }
    }
}
#endif
