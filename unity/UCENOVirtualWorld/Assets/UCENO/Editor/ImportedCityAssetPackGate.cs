#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace UCENO.VirtualWorld.Editor
{
    /// <summary>
    /// Hard release gate for real, imported city art. Procedurally generated
    /// primitives, flat-color blockouts and unlicensed assets cannot satisfy it.
    /// </summary>
    public static class ImportedCityAssetPackGate
    {
        private const string ProfilePath = "Assets/UCENO/Editor/city-scene-asset-profiles.json";
        private const string CatalogPath = "runtime/world-gateway/config/world-cities.json";
        private const string ManifestName = "source-manifest.json";

        [Serializable] private sealed class Profiles { public CityProfile[] cities; }
        [Serializable] private sealed class CityProfile
        {
            public string cityId, assetRoot, skyboxTexture;
            public string[] architecturePrefabs, environmentPrefabs;
            public LandmarkProfile[] landmarks;
        }
        [Serializable] private sealed class LandmarkProfile { public string landmarkId, prefab; }
        [Serializable] private sealed class SourceManifest { public SourceAsset[] assets; }
        [Serializable] private sealed class SourceAsset
        {
            public string prefab, sourceName, sourceUrl, license, attribution;
        }

        [MenuItem("UCENO/World/Validate Imported City Art Packs", false, 29)]
        public static void Validate()
        {
            if (!File.Exists(ProfilePath) || !File.Exists(CatalogPath))
                throw new InvalidOperationException("City catalogue or city asset profile is missing.");

            var profiles = JsonUtility.FromJson<Profiles>(File.ReadAllText(ProfilePath));
            var catalog = JsonUtility.FromJson<CityCatalog>(File.ReadAllText(CatalogPath));
            if (profiles?.cities == null || profiles.cities.Length != 9 ||
                catalog?.cities == null || catalog.cities.Length != 10)
                throw new InvalidOperationException("Expected nine city asset packs plus Meridian Prime.");

            var expectedCities = new HashSet<string>(catalog.cities.Select(c => c.id)
                .Where(id => !string.Equals(id, "meridian", StringComparison.OrdinalIgnoreCase)));
            var seenCities = new HashSet<string>();
            var crossCityFingerprints = new Dictionary<string, string>();
            int checkedPrefabs = 0;

            foreach (CityProfile city in profiles.cities)
            {
                Require(city != null && expectedCities.Contains(city.cityId) && seenCities.Add(city.cityId),
                    "Unknown or duplicate city profile: " + (city == null ? "<null>" : city.cityId));
                Require(city.architecturePrefabs != null && city.architecturePrefabs.Length == 5,
                    city.cityId + " must have five architecture prefabs.");
                Require(city.environmentPrefabs != null && city.environmentPrefabs.Length == 4,
                    city.cityId + " must have four environment prefabs.");
                Require(city.landmarks != null && city.landmarks.Length == 3,
                    city.cityId + " must have three dedicated landmark prefabs.");

                string cityRoot = "Assets/UCENO/Cities/" + city.cityId;
                string manifestPath = cityRoot + "/" + ManifestName;
                Require(File.Exists(manifestPath), city.cityId + " is missing its imported source/licence manifest.");
                var manifest = JsonUtility.FromJson<SourceManifest>(File.ReadAllText(manifestPath));
                Require(manifest?.assets != null && manifest.assets.Length == 12,
                    city.cityId + " source manifest must account for all 12 imported prefabs.");

                var manifestByPrefab = manifest.assets.ToDictionary(a => a.prefab, StringComparer.Ordinal);
                var paths = city.architecturePrefabs.Concat(city.environmentPrefabs)
                    .Concat(city.landmarks.Select(l => l.prefab)).ToArray();
                Require(paths.Distinct(StringComparer.Ordinal).Count() == 12,
                    city.cityId + " reuses a prefab path inside its pack.");

                foreach (string path in paths)
                {
                    Require(path.StartsWith(city.assetRoot + "/", StringComparison.Ordinal),
                        city.cityId + " references an asset outside its own city folder: " + path);
                    Require(manifestByPrefab.TryGetValue(path, out SourceAsset source),
                        city.cityId + " has no provenance record for " + path);
                    Require(!string.IsNullOrWhiteSpace(source.sourceName) &&
                        !string.IsNullOrWhiteSpace(source.sourceUrl) &&
                        !string.IsNullOrWhiteSpace(source.license) &&
                        !string.IsNullOrWhiteSpace(source.attribution),
                        city.cityId + " has incomplete source/licence attribution for " + path);

                    GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                    Require(prefab != null, city.cityId + " imported prefab is missing: " + path);
                    var filters = prefab.GetComponentsInChildren<MeshFilter>(true);
                    var skinned = prefab.GetComponentsInChildren<SkinnedMeshRenderer>(true);
                    var renderers = prefab.GetComponentsInChildren<Renderer>(true);
                    var meshes = filters.Where(x => x.sharedMesh != null).Select(x => x.sharedMesh)
                        .Concat(skinned.Where(x => x.sharedMesh != null).Select(x => x.sharedMesh)).ToArray();
                    Require(meshes.Length > 0 && renderers.Length > 0,
                        path + " contains no imported renderable mesh geometry.");
                    Require(meshes.Any(m => m.vertexCount >= 100 && m.triangles.Length >= 300),
                        path + " is only a primitive/blockout mesh; imported detailed geometry is required.");
                    Require(renderers.SelectMany(r => r.sharedMaterials).Any(m =>
                        m != null && m.mainTexture != null),
                        path + " has no textured imported material; flat-color placeholders are rejected.");

                    LODGroup lod = prefab.GetComponentInChildren<LODGroup>(true);
                    Require(lod != null && lod.GetLODs().Length >= 2,
                        path + " must include at least two valid LOD levels.");

                    if (path.Contains("/Landmarks/"))
                        Require(prefab.GetComponent<WorldInteractable>() != null &&
                            prefab.GetComponent<Collider>() != null && !prefab.GetComponent<Collider>().isTrigger,
                            path + " must have a root WorldInteractable and solid collider.");

                    string fingerprint = AssetDatabase.GetAssetDependencyHash(path).ToString();
                    if (crossCityFingerprints.TryGetValue(fingerprint, out string owner))
                        throw new InvalidOperationException(path + " duplicates the imported asset dependency fingerprint used by " + owner);
                    crossCityFingerprints.Add(fingerprint, path);
                    checkedPrefabs++;
                }

                Texture2D skybox = AssetDatabase.LoadAssetAtPath<Texture2D>(city.skyboxTexture);
                Require(skybox != null && skybox.width >= 1024 && skybox.height >= 512,
                    city.cityId + " needs a real imported HDRI panorama (minimum 1024x512).");
            }

            Require(seenCities.SetEquals(expectedCities), "Not all nine non-Meridian cities have profiles.");
            Debug.Log("Imported city art gate passed: " + checkedPrefabs +
                " unique textured imported prefabs, nine city provenance manifests and nine HDRI panoramas.");
        }

        private static void Require(bool condition, string message)
        {
            if (!condition) throw new InvalidOperationException("Imported city art gate failed: " + message);
        }

        [Serializable] private sealed class CityCatalog { public CatalogCity[] cities; }
        [Serializable] private sealed class CatalogCity { public string id; }
    }
}
#endif
