#if UNITY_EDITOR
using System;
using UnityEditor;
using UnityEngine;

namespace UCENO.VirtualWorld.Editor
{
    /// <summary>
    /// Applies mobile-conscious import settings to bundled free PBR assets.
    /// Colour maps remain sRGB; normal, roughness and AO data maps are linear.
    /// </summary>
    public sealed class FreeAssetTexturePostprocessor : AssetPostprocessor
    {
        private const string EnvironmentRoot = "Assets/UCENO/Environment/Imported/";
        private const string CharacterRoot = "Assets/UCENO/Characters/Imported/";

        private void OnPreprocessTexture()
        {
            if (!(assetImporter is TextureImporter importer))
                return;

            bool environment = assetPath.StartsWith(EnvironmentRoot, StringComparison.Ordinal);
            bool character = assetPath.StartsWith(CharacterRoot, StringComparison.Ordinal);
            if (!environment && !character)
                return;

            string lowerPath = assetPath.ToLowerInvariant();
            importer.maxTextureSize = environment ? 1024 : 2048;
            importer.textureCompression = TextureImporterCompression.CompressedHQ;
            importer.compressionQuality = 75;
            importer.crunchedCompression = true;
            importer.mipmapEnabled = true;
            importer.wrapMode = TextureWrapMode.Repeat;

            if (lowerPath.Contains("_nor_gl") || lowerPath.Contains("_normal"))
            {
                importer.textureType = TextureImporterType.NormalMap;
                importer.sRGBTexture = false;
            }
            else if (lowerPath.Contains("_rough") || lowerPath.Contains("_ao") || lowerPath.Contains("_metal"))
            {
                importer.textureType = TextureImporterType.Default;
                importer.sRGBTexture = false;
            }
            else
            {
                importer.textureType = TextureImporterType.Default;
                importer.sRGBTexture = true;
            }

            if (lowerPath.Contains("/hdri/"))
            {
                importer.maxTextureSize = 1024;
                importer.textureCompression = TextureImporterCompression.Compressed;
                importer.crunchedCompression = false;
                importer.mipmapEnabled = false;
                importer.wrapMode = TextureWrapMode.Repeat;
            }
        }
    }
}
#endif
