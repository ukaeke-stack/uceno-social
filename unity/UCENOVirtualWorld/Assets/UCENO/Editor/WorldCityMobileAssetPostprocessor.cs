#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;

namespace UCENO.VirtualWorld.Editor
{
    /// <summary>
    /// Applies consistent mobile import budgets to the nine city-specific asset packs.
    /// Visual quality still depends on source model quality and authored LOD meshes.
    /// </summary>
    public sealed class WorldCityMobileAssetPostprocessor : AssetPostprocessor
    {
        private const string CityAssetRoot = "Assets/UCENO/Cities/";

        private void OnPreprocessModel()
        {
            if (!assetPath.StartsWith(CityAssetRoot, System.StringComparison.Ordinal)) return;
            if (!(assetImporter is ModelImporter importer)) return;

            importer.animationType = ModelImporterAnimationType.None;
            importer.importAnimation = false;
            importer.importBlendShapes = false;
            importer.optimizeMesh = true;
            importer.meshCompression = ModelImporterMeshCompression.Medium;
            importer.importCameras = false;
            importer.importLights = false;
            importer.isReadable = false;
            importer.weldVertices = true;
            importer.importNormals = ModelImporterNormals.Import;
            importer.importTangents = ModelImporterTangents.CalculateMikk;
        }

        private void OnPreprocessTexture()
        {
            if (!assetPath.StartsWith(CityAssetRoot, System.StringComparison.Ordinal)) return;
            if (!(assetImporter is TextureImporter importer)) return;

            bool foliageOrSmallDetail = assetPath.Contains("/Environment/") ||
                assetPath.Contains("/Vegetation/");
            importer.mipmapEnabled = true;
            importer.textureCompression = TextureImporterCompression.Compressed;
            importer.maxTextureSize = foliageOrSmallDetail ? 1024 : 2048;

            TextureImporterPlatformSettings android = importer.GetPlatformTextureSettings("Android");
            android.name = "Android";
            android.overridden = true;
            android.maxTextureSize = foliageOrSmallDetail ? 1024 : 2048;
            android.format = importer.DoesSourceTextureHaveAlpha()
                ? TextureImporterFormat.ETC2_RGBA8
                : TextureImporterFormat.ETC2_RGB4;
            android.compressionQuality = 55;
            importer.SetPlatformTextureSettings(android);
        }
    }
}
#endif
