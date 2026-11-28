#if UNITY_EDITOR
namespace UCENO.VirtualWorld.Editor
{
    public static class StarterSceneBuilder
    {
        [UnityEditor.MenuItem("UCENO Virtual World/Build Realistic City Scene")]
        public static void CreateStarterScene()
        {
            FreeAssetWorldSceneBuilder.CreateStarterScene();
        }
    }
}
#endif
