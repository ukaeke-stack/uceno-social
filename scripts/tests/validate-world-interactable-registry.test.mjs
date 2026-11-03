import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const validator = path.join(root, "scripts/validate-world-interactable-registry.mjs");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "uceno-registry-test-"));
const districts = {
  districts: [
    { id: "central", name: "Central District", contentLabel: "world-city-district-central",
      minX: 0, maxX: 100, minZ: 0, maxZ: 100 },
    { id: "harbour", name: "Harbour District", contentLabel: "world-city-district-harbour",
      minX: 100, maxX: 200, minZ: 0, maxZ: 100 }
  ]
};
const item = { id: "scene:0123456789abcdef0123456789abcdef", kind: "door",
  x: 25, y: 0, z: 25, yaw: 0 };
function run(registry, districtDoc = districts) {
  const registryPath = path.join(temp, "registry.json");
  const districtsPath = path.join(temp, "districts.json");
  fs.writeFileSync(registryPath, JSON.stringify(registry));
  fs.writeFileSync(districtsPath, JSON.stringify(districtDoc));
  return spawnSync(process.execPath, [validator, registryPath, districtsPath], { encoding: "utf8" });
}
function rejected(registry, districtDoc, pattern) {
  const result = run(registry, districtDoc);
  assert.notEqual(result.status, 0, "expected invalid registry to be rejected");
  assert.match(result.stderr, pattern);
}
try {
  const valid = run({ interactables: [item] });
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /Validated 1 exported scene interactables against 2 gateway districts/);

  rejected({ interactables: [] }, districts, /non-empty interactables/);
  rejected({ interactables: [{ ...item, kind: "teleporter" }] }, districts, /Invalid or duplicate scene interactable/);
  rejected({ interactables: [{ ...item, id: "scene:0123456789abcdef0123456789abcdef" }, { ...item }] },
    districts, /Invalid or duplicate scene interactable/);
  rejected({ interactables: [{ ...item, x: 250 }] }, districts, /exactly one configured gateway district/);
  rejected({ interactables: [{ ...item, yaw: Math.PI * 5 }] }, districts, /Invalid or duplicate scene interactable/);
  rejected({ interactables: [item] }, { districts: [districts.districts[0], { ...districts.districts[1], minX: 90 }] },
    /districts overlap/);
  rejected({ interactables: [item] }, { districts: [districts.districts[0], { ...districts.districts[1], id: "central" }] },
    /Invalid or duplicate gateway district/);
  rejected({ interactables: Array.from({ length: 501 }, (_, i) => ({ ...item,
    id: "scene:" + i.toString(16).padStart(32, "0") })) }, districts, /exceeds the gateway limit/);

  console.log("UBA registry validator tests passed (8 rejection cases plus valid export)");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
