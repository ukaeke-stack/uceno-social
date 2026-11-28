#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using UnityEditor;
using UnityEngine;

namespace UCENO.VirtualWorld.Editor
{
    /// <summary>
    /// Imports one acquired GLB into a temporary staging folder and records
    /// Unity's actual imported hierarchy. It never creates a city prefab.
    /// </summary>
    public static class ArchitecturePilotImport
    {
        private const string StagingRoot = "Assets/UCENO/ImportStaging/SolsticeBay";

        [Serializable]
        private sealed class ImportReport
        {
            public string candidate;
            public string importedAssetPath;
            public string unityVersion;
            public string importerType;
            public string sourceSha256;
            public string sourceManifestSha256;
            public string sourceManifestFile;
            public long sourceManifestBytes;
            public long sourceBytes;
            public bool importedGameObject;
            public int meshCount;
            public int rendererCount;
            public int materialCount;
            public int texturedMaterialCount;
            public int textureCount;
            public int triangleCount;
            public string[] meshNames;
            public string[] materialNames;
            public string[] textureNames;
            public string[] textureBindings;
            public string[] errors;
            public string status;
        }

        public static void Run()
        {
            string source = Environment.GetEnvironmentVariable("UCENO_PILOT_GLB");
            if (string.IsNullOrWhiteSpace(source) || !File.Exists(source))
                throw new FileNotFoundException("UCENO_PILOT_GLB must point to the acquired SolsticeBay LOD0 GLB.", source);
            string expectedSha = Environment.GetEnvironmentVariable("UCENO_PILOT_EXPECTED_SHA256");
            string sourceManifest = Environment.GetEnvironmentVariable("UCENO_PILOT_SOURCE_MANIFEST");
            if (string.IsNullOrWhiteSpace(sourceManifest) || !File.Exists(sourceManifest))
                throw new FileNotFoundException("UCENO_PILOT_SOURCE_MANIFEST must point to the original acquisition manifest.", sourceManifest);
            string manifestSha;
            using (var sha = SHA256.Create())
            using (var stream = File.OpenRead(sourceManifest))
                manifestSha = BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
            string actualSha;
            using (var sha = SHA256.Create())
            using (var stream = File.OpenRead(source))
                actualSha = BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
            if (!string.IsNullOrWhiteSpace(expectedSha) &&
                !string.Equals(actualSha, expectedSha.Trim(), StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("The staged GLB SHA-256 does not match the workflow checksum.");

            Directory.CreateDirectory(Path.Combine(Application.dataPath, "UCENO/ImportStaging/SolsticeBay"));
            string destination = StagingRoot + "/solsticebay-apartment-lod0.glb";
            string destinationAbsolute = Path.Combine(Application.dataPath, "UCENO/ImportStaging/SolsticeBay/solsticebay-apartment-lod0.glb");
            File.Copy(source, destinationAbsolute, true);
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            AssetDatabase.ImportAsset(destination, ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);

            var report = new ImportReport
            {
                candidate = Environment.GetEnvironmentVariable("UCENO_PILOT_CANDIDATE_NAME") ?? "Unspecified manifest candidate",
                importedAssetPath = destination,
                unityVersion = Application.unityVersion,
                sourceSha256 = actualSha,
                sourceManifestSha256 = manifestSha,
                sourceManifestFile = Path.GetFileName(sourceManifest),
                sourceManifestBytes = new FileInfo(sourceManifest).Length,
                sourceBytes = new FileInfo(source).Length,
                meshNames = Array.Empty<string>(),
                materialNames = Array.Empty<string>(),
                textureNames = Array.Empty<string>(),
                textureBindings = Array.Empty<string>(),
                errors = Array.Empty<string>(),
                status = "failed"
            };

            AssetImporter importer = AssetImporter.GetAtPath(destination);
            report.importerType = importer == null ? null : importer.GetType().FullName;
            GameObject root = AssetDatabase.LoadAssetAtPath<GameObject>(destination);
            report.importedGameObject = root != null;
            if (root == null)
            {
                report.errors = new[] { importer == null
                    ? "Unity did not register an AssetImporter for the staged GLB."
                    : "Unity did not expose the imported GLB as a GameObject. Check importer registration and Editor logs." };
                WriteReport(report);
                throw new InvalidOperationException(report.errors[0]);
            }

            MeshFilter[] filters = root.GetComponentsInChildren<MeshFilter>(true);
            SkinnedMeshRenderer[] skinned = root.GetComponentsInChildren<SkinnedMeshRenderer>(true);
            Mesh[] meshes = filters.Where(x => x.sharedMesh != null).Select(x => x.sharedMesh)
                .Concat(skinned.Where(x => x.sharedMesh != null).Select(x => x.sharedMesh)).ToArray();
            Renderer[] renderers = root.GetComponentsInChildren<Renderer>(true);
            Material[] materials = renderers.SelectMany(x => x.sharedMaterials).Where(x => x != null).Distinct().ToArray();
            var textureReferences = new List<string>();
            var textures = new HashSet<Texture>();
            foreach (Material material in materials)
            {
                Shader shader = material.shader;
                if (shader == null) continue;
                for (int propertyIndex = 0; propertyIndex < shader.GetPropertyCount(); propertyIndex++)
                {
                    if (shader.GetPropertyType(propertyIndex) != UnityEngine.Rendering.ShaderPropertyType.Texture)
                        continue;
                    string propertyName = shader.GetPropertyName(propertyIndex);
                    if (!material.HasProperty(propertyName)) continue;
                    Texture texture = material.GetTexture(propertyName);
                    if (texture == null) continue;
                    textures.Add(texture);
                    textureReferences.Add(material.name + ":" + propertyName + "->" + texture.name);
                }
            }

            report.meshCount = meshes.Length;
            report.rendererCount = renderers.Length;
            report.materialCount = materials.Length;
            report.texturedMaterialCount = materials.Count(material =>
                material.shader != null && Enumerable.Range(0, material.shader.GetPropertyCount())
                    .Any(i => material.shader.GetPropertyType(i) == UnityEngine.Rendering.ShaderPropertyType.Texture &&
                              material.HasProperty(material.shader.GetPropertyName(i)) &&
                              material.GetTexture(material.shader.GetPropertyName(i)) != null));
            report.textureCount = textures.Count;
            report.triangleCount = meshes.Sum(x => Enumerable.Range(0, x.subMeshCount)
                .Sum(i => (int)(x.GetIndexCount(i) / 3)));
            report.meshNames = meshes.Select(x => x.name).ToArray();
            report.materialNames = materials.Select(x => x.name).ToArray();
            report.textureNames = textures.Select(x => x.name).ToArray();
            report.textureBindings = textureReferences.ToArray();

            var errors = new List<string>();
            if (report.meshCount == 0) errors.Add("No imported meshes were found.");
            if (report.rendererCount == 0) errors.Add("No renderers were found.");
            if (report.triangleCount == 0) errors.Add("Imported geometry contains zero triangles.");
            if (report.materialCount == 0) errors.Add("No imported materials were found.");
            if (report.texturedMaterialCount == 0 || report.textureCount == 0)
                errors.Add("No shader texture-property bindings were exposed by the imported GLB.");
            report.errors = errors.ToArray();
            report.status = errors.Count == 0 ? "technical-import-pass-visual-review-pending" : "failed";
            WriteReport(report);

            if (errors.Count > 0)
                throw new InvalidOperationException("Architecture pilot import failed: " + string.Join(" ", errors));

            Debug.Log("UCENO architecture pilot import passed technical checks; visual acceptance remains pending. " +
                "Meshes=" + report.meshCount + ", renderers=" + report.rendererCount +
                ", materials=" + report.materialCount + ", textures=" + report.textureCount +
                ", triangles=" + report.triangleCount);
        }

        private static void WriteReport(ImportReport report)
        {
            string configuredPath = Environment.GetEnvironmentVariable("UCENO_PILOT_REPORT");
            string fullPath = string.IsNullOrWhiteSpace(configuredPath)
                ? Path.GetFullPath(Path.Combine(Application.dataPath, "../../..", "artifacts/uceno-solsticebay-glb-import-report.json"))
                : Path.GetFullPath(configuredPath);
            Directory.CreateDirectory(Path.GetDirectoryName(fullPath));
            File.WriteAllText(fullPath, JsonUtility.ToJson(report, true) + Environment.NewLine);
        }
    }
}
#endif
