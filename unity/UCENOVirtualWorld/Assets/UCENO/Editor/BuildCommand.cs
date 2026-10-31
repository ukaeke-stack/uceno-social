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
