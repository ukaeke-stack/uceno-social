#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace UCENO.VirtualWorld.Editor
{
    public static class BuildCommand
    {
        // Configure the project before Unity Build Automation performs its
        // normal player build. Set this method as the target's Pre-Export Method.
        public static void PrepareAndroidBuild()
        {
            StarterSceneBuilder.CreateStarterScene();

            PlayerSettings.companyName = "UCENO";
            PlayerSettings.productName = "UCENO Virtual World";
            PlayerSettings.SetApplicationIdentifier(
                NamedBuildTarget.Android,
                "com.uceno.virtualworld.dev"
            );
            PlayerSettings.SetScriptingBackend(
                NamedBuildTarget.Android,
                ScriptingImplementation.IL2CPP
            );
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
        }

        // Run with Unity Editor batch mode and -executeMethod
        // UCENO.VirtualWorld.Editor.BuildCommand.ExportWorldContentOnly.
        // This generates and validates scene content without invoking
        // BuildPipeline.BuildPlayer or creating an Android package.
        public static void ExportWorldContentOnly()
        {
            StarterSceneBuilder.CreateStarterScene();

            string repositoryRoot = Path.GetFullPath(Path.Combine(
                Directory.GetParent(Application.dataPath).FullName, "..", ".."));
            string[] requiredFiles =
            {
                "unity/UCENOVirtualWorld/Assets/UCENO/Scenes/UCENO_Starter_World.unity",
                "unity/UCENOVirtualWorld/Assets/UCENO/Scenes/Districts/UCENO_District_South.unity",
                "unity/UCENOVirtualWorld/Assets/UCENO/Scenes/Districts/UCENO_District_Central_South.unity",
                "unity/UCENOVirtualWorld/Assets/UCENO/Scenes/Districts/UCENO_District_Central_North.unity",
                "unity/UCENOVirtualWorld/Assets/UCENO/Scenes/Districts/UCENO_District_North.unity",
                "runtime/world-gateway/config/world-interactables.json",
                "runtime/world-gateway/data/uceno-city-collision-boxes.json"
            };

            foreach (string relativePath in requiredFiles)
            {
                string path = Path.Combine(repositoryRoot, relativePath);
                FileInfo info = new FileInfo(path);
                if (!info.Exists || info.Length == 0)
                    throw new Exception("Unity content export is incomplete; missing or empty artifact: " + path);
                Debug.Log("UCENO content export artifact: " + relativePath + " (" + info.Length + " bytes)");
            }

            // Export a portable Unity package with scene dependencies included.
            // The package can be imported into another Unity project without
            // relying on the original repository checkout being present.
            string packageDirectory = Path.Combine(repositoryRoot, "artifacts");
            Directory.CreateDirectory(packageDirectory);
            string packagePath = Path.Combine(packageDirectory, "uceno-world-content.unitypackage");
            string[] sceneAssets =
            {
                "Assets/UCENO/Scenes/UCENO_Starter_World.unity",
                "Assets/UCENO/Scenes/Districts/UCENO_District_South.unity",
                "Assets/UCENO/Scenes/Districts/UCENO_District_Central_South.unity",
                "Assets/UCENO/Scenes/Districts/UCENO_District_Central_North.unity",
                "Assets/UCENO/Scenes/Districts/UCENO_District_North.unity"
            };
            AssetDatabase.ExportPackage(
                sceneAssets,
                packagePath,
                ExportPackageOptions.Recurse | ExportPackageOptions.IncludeDependencies
            );
            FileInfo packageInfo = new FileInfo(packagePath);
            if (!packageInfo.Exists || packageInfo.Length == 0)
                throw new Exception("Unity content export did not create a non-empty dependency package: " + packagePath);
            Debug.Log("UCENO content export artifact: artifacts/uceno-world-content.unitypackage (" + packageInfo.Length + " bytes)");

            Debug.Log("UCENO content-only export completed. No Android player build was requested.");
        }

        // Used by the repository's optional GitHub Actions/GameCI pipeline.
        public static void BuildAndroidDevelopment()
        {
            PrepareAndroidBuild();

            EditorUserBuildSettings.SwitchActiveBuildTarget(
                BuildTargetGroup.Android,
                BuildTarget.Android
            );

            string outputDirectory = Path.Combine("Builds", "Android");
            Directory.CreateDirectory(outputDirectory);

            string outputPath = Path.Combine(
                outputDirectory,
                "UCENO-Virtual-World-dev.apk"
            );

            BuildPlayerOptions options = new BuildPlayerOptions
            {
                scenes = GetEnabledScenes(),
                locationPathName = outputPath,
                target = BuildTarget.Android,
                options = BuildOptions.Development | BuildOptions.AllowDebugging
            };

            BuildReport report = BuildPipeline.BuildPlayer(options);
            if (report.summary.result != BuildResult.Succeeded)
            {
                throw new Exception(
                    "UCENO Android development build failed: " +
                    report.summary.result + ". See the Unity build log."
                );
            }

            Debug.Log(
                "UCENO Android development APK created: " +
                Path.GetFullPath(outputPath)
            );
        }

        private static string[] GetEnabledScenes()
        {
            var scenes = EditorBuildSettings.scenes;
            var enabled = new System.Collections.Generic.List<string>();

            foreach (var scene in scenes)
            {
                if (scene.enabled && !string.IsNullOrEmpty(scene.path))
                    enabled.Add(scene.path);
            }

            if (enabled.Count == 0)
                throw new Exception("No enabled scenes were registered for the build.");

            return enabled.ToArray();
        }
    }
}
#endif
