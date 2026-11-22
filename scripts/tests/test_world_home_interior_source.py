import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCE = ROOT / "unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldHomeInteriorBuilder.cs"
CODE = SOURCE.read_text(encoding="utf-8")


def method_body(name):
    match = re.search(r"private static void " + re.escape(name) + r"\\([^)]*\\)\\s*\\{", CODE)
    if not match:
        raise AssertionError("Missing method: " + name)
    start = match.end()
    depth = 1
    for index in range(start, len(CODE)):
        if CODE[index] == "{":
            depth += 1
        elif CODE[index] == "}":
            depth -= 1
            if depth == 0:
                return CODE[start:index]
    raise AssertionError("Unclosed method: " + name)


class HomeInteriorSourceContractTests(unittest.TestCase):
    def test_home_builds_complete_room_zones(self):
        for feature in ("BuildFloor", "BuildShell", "BuildKitchen", "BuildBathroom",
                        "BuildLighting", "BuildArchitecturalDetails"):
            self.assertIn(feature + "(root.transform", CODE)

    def test_materials_are_shared_between_home_instances(self):
        self.assertIn("Dictionary<string, Material> Materials", CODE)
        self.assertIn("Materials.TryGetValue(key", CODE)
        self.assertIn("renderer.sharedMaterial = material", CODE)

    def test_entry_door_does_not_block_home_spawn_or_exit(self):
        shell = method_body("BuildShell")
        self.assertRegex(shell, r'"Entry door leaf".*?trim, false\\)')
        self.assertIn('"Entry door handle"', shell)

    def test_bathroom_has_an_opening_not_a_full_width_blocking_wall(self):
        bathroom = method_body("BuildBathroom")
        self.assertIn("Bathroom partition left return", bathroom)
        self.assertIn("Bathroom partition right return", bathroom)
        self.assertNotIn('"Bathroom partition left"', bathroom)

    def test_decorative_geometry_can_omit_colliders(self):
        add_box = re.search(r"private static void AddBox\\([\\s\\S]*?\\n        }", CODE)
        self.assertIsNotNone(add_box)
        self.assertIn("if (!collider)", add_box.group(0))
        self.assertIn("Object.Destroy(shape)", add_box.group(0))

    def test_no_per_home_material_allocation_when_cached(self):
        material_method = method_body("CreateMaterial")
        self.assertLess(material_method.index("Materials.TryGetValue"), material_method.index("new Material(shader)"))


if __name__ == "__main__":
    unittest.main()
