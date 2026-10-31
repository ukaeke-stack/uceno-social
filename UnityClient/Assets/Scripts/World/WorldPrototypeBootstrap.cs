using UnityEngine;

/// <summary>
/// Optional helper for quickly creating a temporary test floor and light
/// when the prototype scene has not yet been assembled in the Unity Editor.
/// </summary>
public sealed class WorldPrototypeBootstrap : MonoBehaviour
{
    [SerializeField] private bool createFloorIfMissing = true;
    [SerializeField] private bool createDirectionalLightIfMissing = true;

    private void Start()
    {
        if (createFloorIfMissing && FindObjectOfType<Terrain>() == null &&
            GameObject.Find("PrototypeFloor") == null)
        {
            GameObject floor = GameObject.CreatePrimitive(PrimitiveType.Plane);
            floor.name = "PrototypeFloor";
            floor.transform.localScale = new Vector3(10f, 1f, 10f);
        }

        if (createDirectionalLightIfMissing && FindObjectOfType<Light>() == null)
        {
            GameObject lightObject = new GameObject("PrototypeDirectionalLight");
            Light light = lightObject.AddComponent<Light>();
            light.type = LightType.Directional;
            lightObject.transform.rotation = Quaternion.Euler(50f, -30f, 0f);
        }
    }
}