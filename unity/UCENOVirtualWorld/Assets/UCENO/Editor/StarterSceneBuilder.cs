#if UNITY_EDITOR
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace UCENO.VirtualWorld.Editor
{
    public static class StarterSceneBuilder
    {
        [MenuItem("UCENO Virtual World/Create Starter Scene")]
        public static void CreateStarterScene()
        {
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
            GameObject bootstrap = new GameObject("UCENO World Bootstrap");
            bootstrap.AddComponent<WorldBootstrap>();

            const string folder = "Assets/UCENO/Scenes";
            if (!AssetDatabase.IsValidFolder("Assets/UCENO"))
                AssetDatabase.CreateFolder("Assets", "UCENO");
            if (!AssetDatabase.IsValidFolder(folder))
                AssetDatabase.CreateFolder("Assets/UCENO", "Scenes");

            EditorSceneManager.SaveScene(scene, folder + "/UCENO_Starter_World.unity");
            EditorBuildSettings.scenes = new[]
            {
                new EditorBuildSettingsScene(folder + "/UCENO_Starter_World.unity", true)
            };
            AssetDatabase.SaveAssets();
            Debug.Log("UCENO starter scene created and added to Build Settings.");
        }
    }
}
#endif
