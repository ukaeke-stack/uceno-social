using UnityEngine;

namespace UCENO.VirtualWorld
{
    /// <summary>Lightweight, grounded humanoid placeholder built from primitive meshes.</summary>
    public sealed class ProceduralAvatar : MonoBehaviour
    {
        private Transform leftArm, rightArm, leftLeg, rightLeg;
        private PlayerMotor motor;
        private float animationClock;

        private void Awake()
        {
            motor = GetComponent<PlayerMotor>();
            Renderer capsule = GetComponent<Renderer>();
            if (capsule != null) capsule.enabled = false;

            Material shirt = MakeMaterial(new Color(0.08f, 0.28f, 0.78f));
            Material trousers = MakeMaterial(new Color(0.12f, 0.14f, 0.19f));
            Material skin = MakeMaterial(new Color(0.62f, 0.39f, 0.26f));
            Material shoes = MakeMaterial(new Color(0.035f, 0.035f, 0.04f));
            Material hair = MakeMaterial(new Color(0.055f, 0.035f, 0.025f));
            Material white = MakeMaterial(Color.white);
            Material eyes = MakeMaterial(new Color(0.035f, 0.025f, 0.02f));

            Part(PrimitiveType.Cube, "Torso", new Vector3(0f, 0.12f, 0f), new Vector3(0.58f, 0.68f, 0.30f), shirt);
            Part(PrimitiveType.Cylinder, "Neck", new Vector3(0f, 0.51f, 0f), new Vector3(0.12f, 0.12f, 0.12f), skin);
            Part(PrimitiveType.Sphere, "Head", new Vector3(0f, 0.73f, 0f), new Vector3(0.34f, 0.40f, 0.31f), skin);
            Part(PrimitiveType.Sphere, "Hair", new Vector3(0f, 0.89f, -0.025f), new Vector3(0.35f, 0.19f, 0.32f), hair);
            Part(PrimitiveType.Sphere, "Left Eye", new Vector3(-0.105f, 0.755f, 0.145f), new Vector3(0.045f, 0.055f, 0.025f), white);
            Part(PrimitiveType.Sphere, "Right Eye", new Vector3(0.105f, 0.755f, 0.145f), new Vector3(0.045f, 0.055f, 0.025f), white);
            Part(PrimitiveType.Sphere, "Left Pupil", new Vector3(-0.105f, 0.755f, 0.168f), new Vector3(0.022f, 0.03f, 0.012f), eyes);
            Part(PrimitiveType.Sphere, "Right Pupil", new Vector3(0.105f, 0.755f, 0.168f), new Vector3(0.022f, 0.03f, 0.012f), eyes);

            leftArm = Limb("Left Arm", new Vector3(-0.37f, 0.35f, 0f), new Vector3(0.16f, 0.48f, 0.17f), skin);
            rightArm = Limb("Right Arm", new Vector3(0.37f, 0.35f, 0f), new Vector3(0.16f, 0.48f, 0.17f), skin);
            leftLeg = Limb("Left Leg", new Vector3(-0.16f, -0.34f, 0f), new Vector3(0.21f, 0.62f, 0.22f), trousers);
            rightLeg = Limb("Right Leg", new Vector3(0.16f, -0.34f, 0f), new Vector3(0.21f, 0.62f, 0.22f), trousers);
            Part(PrimitiveType.Cube, "Left Shoe", new Vector3(-0.16f, -0.88f, 0.055f), new Vector3(0.23f, 0.16f, 0.34f), shoes);
            Part(PrimitiveType.Cube, "Right Shoe", new Vector3(0.16f, -0.88f, 0.055f), new Vector3(0.23f, 0.16f, 0.34f), shoes);
        }

        private void Update()
        {
            float amount = motor != null ? motor.MovementInput.magnitude : 0f;
            animationClock += Time.deltaTime * (amount > 0.05f ? 9f : 2f);
            float swing = amount > 0.05f ? Mathf.Sin(animationClock) * 28f : Mathf.Sin(animationClock) * 1.5f;
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
            GameObject mesh = GameObject.CreatePrimitive(PrimitiveType.Cube);
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
            Shader shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) shader = Shader.Find("Standard");
            if (shader == null) shader = Shader.Find("Unlit/Color");
            Material material = new Material(shader);
            material.color = color;
            return material;
        }
    }
}