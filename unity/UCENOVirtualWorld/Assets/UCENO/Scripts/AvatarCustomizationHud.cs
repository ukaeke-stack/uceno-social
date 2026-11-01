using UnityEngine;

namespace UCENO.VirtualWorld
{
    /// <summary>
    /// In-world appearance controls. Palette choices are cached locally and
    /// synchronized to the authenticated account when a world session is active.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class AvatarCustomizationHud : MonoBehaviour
    {
        private const string SavePrefix = "UCENO.AvatarPalette.";
        private static readonly Color[] SkinOptions =
        {
            new Color(0.25f, 0.13f, 0.08f), new Color(0.43f, 0.24f, 0.14f),
            new Color(0.58f, 0.34f, 0.21f), new Color(0.72f, 0.48f, 0.32f),
            new Color(0.84f, 0.65f, 0.49f)
        };
        private static readonly Color[] HairOptions =
        {
            new Color(0.035f, 0.025f, 0.02f), new Color(0.12f, 0.065f, 0.035f),
            new Color(0.32f, 0.16f, 0.07f), new Color(0.55f, 0.31f, 0.12f),
            new Color(0.72f, 0.66f, 0.52f)
        };
        private static readonly Color[] ClothingOptions =
        {
            new Color(0.08f, 0.18f, 0.32f), new Color(0.45f, 0.10f, 0.12f),
            new Color(0.10f, 0.32f, 0.20f), new Color(0.48f, 0.34f, 0.12f),
            new Color(0.28f, 0.22f, 0.38f), new Color(0.72f, 0.72f, 0.68f)
        };
        private static readonly Color[] TrousersOptions =
        {
            new Color(0.055f, 0.065f, 0.08f), new Color(0.10f, 0.16f, 0.28f),
            new Color(0.30f, 0.24f, 0.17f), new Color(0.28f, 0.30f, 0.31f)
        };
        private static readonly Color[] ShoeOptions =
        {
            new Color(0.035f, 0.03f, 0.025f), new Color(0.30f, 0.12f, 0.07f),
            new Color(0.68f, 0.66f, 0.60f), new Color(0.12f, 0.15f, 0.18f)
        };

        private AvatarAppearanceProfile profile;
        private AvatarAppearanceSyncClient appearanceSync;
        private AvatarAppearanceProfile.Palette palette;
        private bool visible;
        private GUIStyle titleStyle;
        private GUIStyle buttonStyle;
        private GUIStyle panelStyle;

        private void Awake()
        {
            profile = GetComponentInChildren<AvatarAppearanceProfile>();
            if (profile == null) profile = GetComponent<AvatarAppearanceProfile>();
            if (profile == null) return;

            palette = profile.CurrentPalette;
            LoadColor("skin", ref palette.skin);
            LoadColor("hair", ref palette.hair);
            LoadColor("top", ref palette.top);
            LoadColor("trousers", ref palette.trousers);
            LoadColor("shoes", ref palette.shoes);
            profile.Apply(palette);
            WorldSessionClient session = FindObjectOfType<WorldSessionClient>();
            if (session != null)
            {
                appearanceSync = GetComponent<AvatarAppearanceSyncClient>();
                if (appearanceSync == null) appearanceSync = gameObject.AddComponent<AvatarAppearanceSyncClient>();
                appearanceSync.Initialize(session, profile);
            }
        }

        public void ApplyAccountPalette(AvatarAppearanceProfile.Palette accountPalette)
        {
            palette = accountPalette;
            if (profile != null) profile.Apply(palette);
        }

        private void Update()
        {
            if (Input.GetKeyDown(KeyCode.C)) visible = !visible;
        }

        private void OnGUI()
        {
            if (profile == null) return;
            EnsureStyles();
            float scale = Mathf.Clamp(Screen.width / 520f, 1f, 1.7f);
            Rect toggleRect = new Rect(Screen.width - 132f * scale, 88f * scale, 120f * scale, 42f * scale);
            if (GUI.Button(toggleRect, visible ? "CLOSE LOOK" : "CUSTOMIZE", buttonStyle))
                visible = !visible;
            if (!visible) return;
            float width = Mathf.Min(Screen.width - 24f, 310f * scale);
            float rowHeight = 44f * scale;
            float height = 66f * scale + rowHeight * 5f + 54f * scale;
            Rect panel = new Rect(12f, Screen.height - height - 18f, width, height);

            Color old = GUI.color;
            GUI.color = new Color(0.025f, 0.035f, 0.05f, 0.94f);
            GUI.Box(panel, GUIContent.none, panelStyle);
            GUI.color = old;
            GUI.Label(new Rect(panel.x + 12f, panel.y + 8f, width - 24f, 30f * scale),
                "AVATAR APPEARANCE", titleStyle);

            float y = panel.y + 42f * scale;
            DrawChoiceRow(panel, ref y, rowHeight, scale, "SKIN", SkinOptions, ref palette.skin, "skin");
            DrawChoiceRow(panel, ref y, rowHeight, scale, "HAIR", HairOptions, ref palette.hair, "hair");
            DrawChoiceRow(panel, ref y, rowHeight, scale, "TOP", ClothingOptions, ref palette.top, "top");
            DrawChoiceRow(panel, ref y, rowHeight, scale, "TROUSERS", TrousersOptions, ref palette.trousers, "trousers");
            DrawChoiceRow(panel, ref y, rowHeight, scale, "SHOES", ShoeOptions, ref palette.shoes, "shoes");

            if (GUI.Button(new Rect(panel.x + 12f, y + 3f, width - 24f, 38f * scale),
                "SAVE LOOK ON THIS DEVICE", buttonStyle))
                SavePalette();
        }

        private void DrawChoiceRow(Rect panel, ref float y, float rowHeight, float scale,
            string label, Color[] options, ref Color selected, string key)
        {
            float labelWidth = 92f * scale;
            GUI.Label(new Rect(panel.x + 12f, y, labelWidth, rowHeight), label, buttonStyle);
            float swatchWidth = (panel.width - labelWidth - 34f) / options.Length;
            for (int i = 0; i < options.Length; i++)
            {
                Rect swatch = new Rect(panel.x + 12f + labelWidth + i * swatchWidth,
                    y + 5f * scale, swatchWidth - 4f, rowHeight - 10f * scale);
                Color before = GUI.backgroundColor;
                GUI.backgroundColor = options[i];
                bool clicked = GUI.Button(swatch, IsSameColor(selected, options[i]) ? "✓" : "", buttonStyle);
                GUI.backgroundColor = before;
                if (clicked)
                {
                    selected = options[i];
                    profile.Apply(palette);
                    SaveColor(key, selected);
                    if (appearanceSync != null) appearanceSync.Save(palette);
                }
            }
            y += rowHeight;
        }

        private void SavePalette()
        {
            SaveColor("skin", palette.skin);
            SaveColor("hair", palette.hair);
            SaveColor("top", palette.top);
            SaveColor("trousers", palette.trousers);
            SaveColor("shoes", palette.shoes);
            PlayerPrefs.Save();
            if (appearanceSync != null) appearanceSync.Save(palette);
        }

        private static void SaveColor(string key, Color color)
        {
            string prefix = SavePrefix + key + ".";
            PlayerPrefs.SetFloat(prefix + "r", color.r);
            PlayerPrefs.SetFloat(prefix + "g", color.g);
            PlayerPrefs.SetFloat(prefix + "b", color.b);
            PlayerPrefs.SetFloat(prefix + "a", color.a);
        }

        private static void LoadColor(string key, ref Color color)
        {
            string prefix = SavePrefix + key + ".";
            if (!PlayerPrefs.HasKey(prefix + "r")) return;
            color = new Color(
                PlayerPrefs.GetFloat(prefix + "r", color.r),
                PlayerPrefs.GetFloat(prefix + "g", color.g),
                PlayerPrefs.GetFloat(prefix + "b", color.b),
                PlayerPrefs.GetFloat(prefix + "a", color.a));
        }

        private static bool IsSameColor(Color a, Color b)
        {
            return Mathf.Abs(a.r - b.r) < 0.015f &&
                   Mathf.Abs(a.g - b.g) < 0.015f &&
                   Mathf.Abs(a.b - b.b) < 0.015f;
        }

        private void EnsureStyles()
        {
            if (titleStyle != null) return;
            titleStyle = new GUIStyle(GUI.skin.label)
            {
                fontSize = Mathf.Max(14, Screen.width / 42),
                fontStyle = FontStyle.Bold,
                normal = { textColor = Color.white }
            };
            buttonStyle = new GUIStyle(GUI.skin.button)
            {
                fontSize = Mathf.Max(11, Screen.width / 58),
                fontStyle = FontStyle.Bold,
                wordWrap = true
            };
            panelStyle = new GUIStyle(GUI.skin.box);
        }
    }
}
