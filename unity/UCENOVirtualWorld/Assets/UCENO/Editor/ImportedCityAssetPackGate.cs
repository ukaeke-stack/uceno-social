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
    /// Hard release gate for real, imported city art. Procedural primitives,
    /// flat-color blockouts, reused city packs and unlicensed assets cannot pass.
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
        [Serializable] private sealed class CityCatalog { public CatalogCity[] cities; }
        [Serializable] private sealed class CatalogCity { public string id; public CatalogLandmark[] landmarks; }
        [Serializable] private sealed class CatalogLandmark { public string id; }

        [MenuItem("UCENO/World/Validate Imported City Art Packs", false, 29)]
        public static void Validate()
        {
            string profileFile = AssetAbsolutePath(ProfilePath);
            string catalogFile = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", "..", CatalogPath));
            if (!File.Exists(profileFile) || !File.Exists(catalogFile))
                throw new InvalidOperationException("City catalogue or city asset profile is missing. Checked: " + catalogFile);

            var profiles = JsonUtility.FromJson<Profiles>(File.ReadAllText(profileFile));
            var catalog = JsonUtility.FromJson<CityCatalog>(File.ReadAllText(catalogFile));
            if (profiles?.cities == null || profiles.cities.Length != 9 ||
                catalog?.cities == null || catalog.cities.Length != 10)
                throw new InvalidOperationException("Expected nine city asset packs plus Meridian Prime.");

            var catalogById = catalog.cities.ToDictionary(c => c.id, StringComparer.Ordinal);
            var expectedCities = new HashSet<string>(catalog.cities.Select(c => c.id)
                .Where(id => !string.Equals(id, "meridian", StringComparison.OrdinalIgnoreCase)));
            var seenCities = new HashSet<string>();
            var crossCityFingerprints = new Dictionary<string, string>();
            int checkedPrefabs = 0;

            foreach (CityProfile city in profiles.cities)
            {
                Require(city != null && expectedCities.Contains(city.cityId) && seenCities.Add(city.cityId),
                    "Unknown or duplicate city profile: " + (city == null ? "<null>" : city.cityId));
                Require(city.assetRoot == "Assets/UCENO/Cities/" + city.cityId + "/Prefabs",
                    city.cityId + " asset root must be its exact city-owned Prefabs folder.");
                Require(city.architecturePrefabs != null && city.architecturePrefabs.Length == 5,
                    city.cityId + " must have five architecture prefabs.");
                Require(city.environmentPrefabs != null && city.environmentPrefabs.Length == 4,
                    city.cityId + " must have four environment prefabs.");
                Require(city.landmarks != null && city.landmarks.Length == 3,
                    city.cityId + " must have three dedicated landmark prefabs.");

                var expectedLandmarks = new HashSet<string>(
                    catalogById[city.cityId].landmarks.Select(x => x.id), StringComparer.Ordinal);
                var actualLandmarks = new HashSet<string>(
                    city.landmarks.Select(x => x.landmarkId), StringComparer.Ordinal);
                Require(expectedLandmarks.SetEquals(actualLandmarks),
                    city.cityId + " landmark prefab IDs must exactly match its city catalogue.");

                string cityRoot = "Assets/UCENO/Cities/" + city.cityId;
                string manifestPath = AssetAbsolutePath(cityRoot + "/" + ManifestName);
                Require(File.Exists(manifestPath), city.cityId + " is missing its imported source/licence manifest.");
                var manifest = JsonUtility.FromJson<SourceManifest>(File.ReadAllText(manifestPath));
                Require(manifest?.assets != null && manifest.assets.Length == 12,
                    city.cityId + " source manifest must account for all 12 imported prefabs.");

                var paths = city.architecturePrefabs.Concat(city.environmentPrefabs)
                    .Concat(city.landmarks.Select(l => l.prefab)).ToArray();
                Require(paths.Distinct(StringComparer.Ordinal).Count() == 12,
                    city.cityId + " reuses a prefab path inside its pack.");
                Require(manifest.assets.All(a => a != null && !string.IsNullOrWhiteSpace(a.prefab)) &&
                    manifest.assets.Select(a => a.prefab).Distinct(StringComparer.Ordinal).Count() == 12,
                    city.cityId + " source manifest contains missing or duplicate prefab records.");
                var manifestByPrefab = manifest.assets.ToDictionary(a => a.prefab, StringComparer.Ordinal);
                Require(new HashSet<string>(manifestByPrefab.Keys, StringComparer.Ordinal)
                    .SetEquals(paths),
                    city.cityId + " source manifest must cover exactly the 12 configured imported prefabs.");

                foreach (string path in paths)
                {
                    Require(path.StartsWith(city.assetRoot + "/", StringComparison.Ordinal),
                        city.cityId + " references an asset outside its own city folder: " + path);
                    Require(manifestByPrefab.TryGetValue(path, out SourceAsset source),
                        city.cityId + " has no provenance record for " + path);
                    Require(!string.IsNullOrWhiteSpace(source.sourceName) &&
                        Uri.TryCreate(source.sourceUrl, UriKind.Absolute, out Uri sourceUri) &&
                        sourceUri.Scheme == Uri.UriSchemeHttps &&
                        !string.IsNullOrWhiteSpace(source.attribution),
                        city.cityId + " has incomplete or non-HTTPS source attribution for " + path);
                    string license = (source.license ?? string.Empty).Trim();
                    string[] redistributableDerivativeLicenses = {
                        "CC0 1.0", "CC-BY 4.0", "CC-BY 3.0",
                        "CC-BY-SA 4.0", "CC-BY-SA 3.0"
                    };
                    Require(redistributableDerivativeLicenses.Contains(license, StringComparer.OrdinalIgnoreCase),
                        city.cityId + " uses an unapproved, non-commercial, no-derivatives or unverified licence for " + path);

                    GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                    Require(prefab != null, city.cityId + " imported prefab is missing: " + path);
                    var filters = prefab.GetComponentsInChildren<MeshFilter>(true);
                    var skinned = prefab.GetComponentsInChildren<SkinnedMeshRenderer>(true);
                    var renderers = prefab.GetComponentsInChildren<Renderer>(true);
                    var meshes = filters.Where(x => x.sharedMesh != null).Select(x => x.sharedMesh)
                        .Concat(skinned.Where(x => x.sharedMesh != null).Select(x => x.sharedMesh)).ToArray();
                    Require(meshes.Length > 0 && renderers.Length > 0,
                        path + " contains no imported renderable mesh geometry.");
                    Require(meshes.Any(m => m.vertexCount >= 100 && m.subMeshCount > 0 && m.GetIndexCount(0) >= 300),
                        path + " is only a primitive/blockout mesh; imported detailed geometry is required.");
                    Require(renderers.SelectMany(r => r.sharedMaterials).Any(m =>
                        m != null && m.mainTexture != null),
                        path + " has no textured imported material; flat-color placeholders are rejected.");

                    LODGroup lod = prefab.GetComponentInChildren<LODGroup>(true);
                    Require(lod != null && lod.GetLODs().Length >= 2,
                        path + " must include at least two valid LOD levels.");

                    if (path.Contains("/Landmarks/"))
                    {
                        var marker = prefab.GetComponent<WorldInteractable>();
                        var collider = prefab.GetComponent<Collider>();
                        Require(marker != null && collider != null && !collider.isTrigger,
                            path + " must have a root WorldInteractable and solid collider.");
                    }

                    string fingerprint = AssetDatabase.GetAssetDependencyHash(path).ToString();
                    if (crossCityFingerprints.TryGetValue(fingerprint, out string owner))
                        throw new InvalidOperationException(path + " duplicates the imported asset dependency fingerprint used by " + owner);
                    crossCityFingerprints.Add(fingerprint, path);
                    checkedPrefabs++;
                }

                Require(!string.IsNullOrWhiteSpace(city.skyboxTexture) &&
                    city.skyboxTexture.StartsWith("Assets/UCENO/Cities/" + city.cityId + "/Textures/Skybox/", StringComparison.Ordinal) &&
                    city.skyboxTexture.EndsWith(".hdr", StringComparison.OrdinalIgnoreCase),
                    city.cityId + " HDRI must be stored in its own city-specific Skybox folder.");
                Texture2D skybox = AssetDatabase.LoadAssetAtPath<Texture2D>(city.skyboxTexture);
                Require(skybox != null && skybox.width >= 1024 && skybox.height >= 512,
                    city.cityId + " needs a real imported HDRI panorama (minimum 1024x512).");
            }

            Require(seenCities.SetEquals(expectedCities), "Not all nine non-Meridian cities have profiles.");
            Debug.Log("Imported city art gate passed: " + checkedPrefabs +
                " unique textured imported prefabs, exact catalogue landmarks, nine provenance manifests and nine HDRI panoramas.");
        }

        private static string AssetAbsolutePath(string assetPath)
        {
            if (string.IsNullOrWhiteSpace(assetPath) || !assetPath.StartsWith("Assets/", StringComparison.Ordinal))
                throw new InvalidOperationException("Expected a project-relative Assets path: " + assetPath);
            return Path.GetFullPath(Path.Combine(Application.dataPath, assetPath.Substring("Assets/".Length)));
        }

        private static void Require(bool condition, string message)
        {
            if (!condition) throw new InvalidOperationException("Imported city art gate failed: " + message);
        }
    }
}
#endif
