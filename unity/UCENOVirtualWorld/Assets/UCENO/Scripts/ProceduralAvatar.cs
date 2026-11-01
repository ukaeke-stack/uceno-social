using UnityEngine;

namespace UCENO.VirtualWorld
{
    /// <summary>Lightweight placeholder humanoid assembled from built-in meshes.</summary>
    public sealed class ProceduralAvatar : MonoBehaviour
    {
        private Transform leftArm;
        private Transform rightArm;
        private Transform leftLeg;
        private Transform rightLeg;
        private PlayerMotor motor;
        private float animationClock;

        private void Awake()
        {
            motor = GetComponent<PlayerMotor>();
            Renderer capsule = GetComponent<Renderer>();
            if (capsule != null) capsule.enabled = false;

            Material shirt = MakeMaterial(new Color(0.05f, 0.22f, 0.78f));
            Material trousers = MakeMaterial(new Color(0.10f, 0.13f, 0.20f));
            Material skin = MakeMaterial(new Color(0.72f, 0.48f, 0.32f));
            Material shoes = MakeMaterial(new Color(0.06f, 0.06f, 0.07f));
            Material hair = MakeMaterial(new Color(0.08f, 0.045f, 0.025f));

            Part(PrimitiveType.Cube, "Torso", new Vector3(0f, 0.15f, 0f), new Vector3(0.62f, 0.72f, 0.32f), shirt);
            Part(PrimitiveType.Cylinder, "Neck", new Vector3(0f, 0.58f, 0f), new Vector3(0.13f, 0.12f, 0.13f), skin);
            Part(PrimitiveType.Sphere, "Head", new Vector3(0f, 0.83f, 0f), new Vector3(0.38f, 0.44f, 0.34f), skin);
            Part(PrimitiveType.Sphere, "Hair", new Vector3(0f, 1.00f, -0.035f), new Vector3(0.39f, 0.22f, 0.35f), hair);

            leftArm = Limb("Left Arm", new Vector3(-0.39f, 0.39f, 0f), new Vector3(0.16f, 0.48f, 0.17f), skin);
            rightArm = Limb("Right Arm", new Vector3(0.39f, 0.39f, 0f), new Vector3(0.16f, 0.48f, 0.17f), skin);
            leftLeg = Limb("Left Leg", new Vector3(-0.17f, -0.36f, 0f), new Vector3(0.20f, 0.58f, 0.22f), trousers);
            rightLeg = Limb("Right Leg", new Vector3(0.17f, -0.36f, 0f), new Vector3(0.20f, 0.58f, 0.22f), trousers);
            Part(PrimitiveType.Cube, "Left Shoe", new Vector3(-0.17f, -0.70f, 0.07f), new Vector3(0.22f, 0.13f, 0.36f), shoes);
            Part(PrimitiveType.Cube, "Right Shoe", new Vector3(0.17f, -0.70f, 0.07f), new Vector3(0.22f, 0.13f, 0.36f), shoes);
        }

        private void Update()
        {
            float amount = motor != null ? motor.MovementInput.magnitude : 0f;
            animationClock += Time.deltaTime * (amount > 0.05f ? 9f : 2f);
            float swing = amount > 0.05f ? Mathf.Sin(animationClock) * 32f : Mathf.Sin(animationClock) * 2f;
            leftArm.localRotation = Quaternion.Euler(swing, 0f, 0f);
            rightArm.localRotation = Quaternion.Euler(-swing, 0f, 0f);
            leftLeg.localRotation = Quaternion.Euler(-swing, 0f, 0f);
            rightLeg.localRotation = Quaternion.Euler(swing, 0f, 0f);
        }

        private Transform Limb(string partName, Vector3 position, Vector3 scale, Material material)
        {
            GameObject pivot = new GameObject(partName + " Pivot");
            pivot.transform.SetParent(transform, false);
            pivot.transform.localPosition = position;
            GameObject mesh = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            mesh.name = partName;
            mesh.transform.SetParent(pivot.transform, false);
            mesh.transform.localPosition = new Vector3(0f, -scale.y * 0.5f, 0f);
            mesh.transform.localScale = scale;
            RemoveCollider(mesh);
            mesh.GetComponent<Renderer>().material = material;
            return pivot.transform;
        }

        private void Part(PrimitiveType type, string partName, Vector3 position, Vector3 scale, Material material)
        {
            GameObject part = GameObject.CreatePrimitive(type);
            part.name = partName;
            part.transform.SetParent(transform, false);
            part.transform.localPosition = position;
            part.transform.localScale = scale;
            RemoveCollider(part);
            part.GetComponent<Renderer>().material = material;
        }

        private static void RemoveCollider(GameObject item)
        {
            Collider collider = item.GetComponent<Collider>();
            if (collider != null) Destroy(collider);
        }

        private static Material MakeMaterial(Color color)
        {
            Shader shader = Shader.Find("Standard");
            if (shader == null) shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) shader = Shader.Find("Unlit/Color");
            Material material = new Material(shader);
            material.color = color;
            return material;
        }
    }
}