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
    /// Imports one acquired GLB into a temporary staging folder and records
    /// Unity's actual imported hierarchy. It never creates a city prefab.
    /// </summary>
    public static class ArchitecturePilotImport
    {
        private const string StagingRoot = "Assets/UCENO/ImportStaging/SolsticeBay";
        private const string ReportPath = "artifacts/uceno-solsticebay-glb-import-report.json";

        [Serializable]
        private sealed class ImportReport
        {
            public string candidate;
            public string importedAssetPath;
            public string unityVersion;
            public bool importedGameObject;
            public int meshCount;
            public int rendererCount;
            public int materialCount;
            public int texturedMaterialCount;
            public int textureCount;
            public int triangleCount;
            public string[] meshNames;
            public string[] materialNames;
            public string[] errors;
            public string status;
        }

        public static void Run()
        {
            string source = Environment.GetEnvironmentVariable("UCENO_PILOT_GLB");
            if (string.IsNullOrWhiteSpace(source) || !File.Exists(source))
                throw new FileNotFoundException("UCENO_PILOT_GLB must point to the acquired SolsticeBay LOD0 GLB.", source);

            Directory.CreateDirectory(Path.Combine(Application.dataPath, "UCENO/ImportStaging/SolsticeBay"));
            string destination = StagingRoot + "/solsticebay-apartment-lod0.glb";
            File.Copy(source, destination, true);
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            AssetDatabase.ImportAsset(destination, ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);

            var report = new ImportReport
            {
                candidate = "SolsticeBay Korean Apartment Tower (Tevy CC0 candidate)",
                importedAssetPath = destination,
                unityVersion = Application.unityVersion,
                meshNames = Array.Empty<string>(),
                materialNames = Array.Empty<string>(),
                errors = Array.Empty<string>(),
                status = "failed"
            };

            GameObject root = AssetDatabase.LoadAssetAtPath<GameObject>(destination);
            report.importedGameObject = root != null;
            if (root == null)
            {
                report.errors = new[] { "Unity did not expose the imported GLB as a GameObject. Check importer registration and Editor logs." };
                WriteReport(report);
                throw new InvalidOperationException(report.errors[0]);
            }

            MeshFilter[] filters = root.GetComponentsInChildren<MeshFilter>(true);
            SkinnedMeshRenderer[] skinned = root.GetComponentsInChildren<SkinnedMeshRenderer>(true);
            Mesh[] meshes = filters.Where(x => x.sharedMesh != null).Select(x => x.sharedMesh)
                .Concat(skinned.Where(x => x.sharedMesh != null).Select(x => x.sharedMesh)).ToArray();
            Renderer[] renderers = root.GetComponentsInChildren<Renderer>(true);
            Material[] materials = renderers.SelectMany(x => x.sharedMaterials).Where(x => x != null).Distinct().ToArray();
            Texture[] textures = materials.Select(x => x.mainTexture).Where(x => x != null).Distinct().ToArray();

            report.meshCount = meshes.Length;
            report.rendererCount = renderers.Length;
            report.materialCount = materials.Length;
            report.texturedMaterialCount = materials.Count(x => x.mainTexture != null);
            report.textureCount = textures.Length;
            report.triangleCount = meshes.Sum(x => Enumerable.Range(0, x.subMeshCount)
                .Sum(i => (int)(x.GetIndexCount(i) / 3)));
            report.meshNames = meshes.Select(x => x.name).ToArray();
            report.materialNames = materials.Select(x => x.name).ToArray();

            var errors = new List<string>();
            if (report.meshCount == 0) errors.Add("No imported meshes were found.");
            if (report.rendererCount == 0) errors.Add("No renderers were found.");
            if (report.triangleCount == 0) errors.Add("Imported geometry contains zero triangles.");
            if (report.materialCount == 0) errors.Add("No imported materials were found.");
            if (report.texturedMaterialCount == 0 || report.textureCount == 0)
                errors.Add("No material main textures were exposed by the imported GLB.");
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
            string fullPath = Path.GetFullPath(Path.Combine(Application.dataPath, "../../..", ReportPath));
            Directory.CreateDirectory(Path.GetDirectoryName(fullPath));
            File.WriteAllText(fullPath, JsonUtility.ToJson(report, true) + Environment.NewLine);
        }
    }
}
#endif
