import test from "node:test";
import assert from "node:assert/strict";
import { parseDistrictCollisionBoxes, parseDistrictCollisionManifest } from "../dist/district-collision-policy.js";

const districts = [
  { id: "south", contentLabel: "south-label", minX: -10, maxX: 0, minZ: -10, maxZ: 0 },
  { id: "north", contentLabel: "north-label", minX: -10, maxX: 0, minZ: 0, maxZ: 10 }
];
const box = { minX: -2, maxX: 2, minY: 0, maxY: 3, minZ: -2, maxZ: 2 };
const manifest = (entries = districts.map(d => ({
  id: d.id, contentLabel: d.contentLabel, file: d.id + ".json",
  minX: d.minX, maxX: d.maxX, minZ: d.minZ, maxZ: d.maxZ
}))) => JSON.stringify({ districts: entries });
const load = (raw = manifest(), maps = {}) => parseDistrictCollisionManifest(
  raw, districts, 100, filename => JSON.stringify({ boxes: maps[filename] ?? [box] })
);

test("loads exactly one validated collision map per configured district", () => {
  const maps = load();
  assert.deepEqual([...maps.keys()], ["south", "north"]);
  assert.deepEqual(maps.get("south"), [box]);
});
test("rejects malformed manifest and missing/extra districts", () => {
  assert.throws(() => load("{"), /not valid JSON/);
  assert.throws(() => load(JSON.stringify({ districts: [] })), /every configured district/);
  assert.throws(() => load(manifest(districts.slice(0, 1))), /every configured district/);
});
test("rejects duplicate and unknown district IDs", () => {
  const entries = JSON.parse(manifest()).districts;
  assert.throws(() => load(manifest([entries[0], entries[0]])), /invalid or duplicate/);
  entries[1].id = "unknown";
  assert.throws(() => load(manifest(entries)), /does not match/);
});
test("rejects content-label and district-bound mismatches", () => {
  const entries = JSON.parse(manifest()).districts;
  entries[0].contentLabel = "other";
  assert.throws(() => load(manifest(entries)), /does not match/);
  entries[0].contentLabel = "south-label";
  entries[0].maxX = 1;
  assert.throws(() => load(manifest(entries)), /does not match/);
});
test("rejects unsafe, duplicate and non-json map filenames", () => {
  for (const filename of ["../south.json", "/tmp/south.json", "sub/south.json", "south.txt", "..\\south.json"]) {
    const entries = JSON.parse(manifest()).districts;
    entries[0].file = filename;
    assert.throws(() => load(manifest(entries)), /invalid or duplicate/);
  }
  const entries = JSON.parse(manifest()).districts;
  entries[1].file = entries[0].file;
  assert.throws(() => load(manifest(entries)), /invalid or duplicate/);
});
test("rejects empty, excessive and malformed collision maps", () => {
  assert.throws(() => parseDistrictCollisionBoxes(JSON.stringify({ boxes: [] }), "south", 100), /1–500/);
  assert.throws(() => parseDistrictCollisionBoxes(JSON.stringify({ boxes: Array(501).fill(box) }), "south", 100), /1–500/);
  assert.throws(() => parseDistrictCollisionBoxes(JSON.stringify({ boxes: [{ ...box, minX: "bad" }] }), "south", 100), /invalid minX/);
  assert.throws(() => parseDistrictCollisionBoxes(JSON.stringify({ boxes: [{ ...box, maxX: -3 }] }), "south", 100), /invalid bounds/);
  assert.throws(() => parseDistrictCollisionBoxes(JSON.stringify({ boxes: [{ ...box, maxZ: 101 }] }), "south", 100), /invalid bounds/);
});
test("propagates missing map-file errors", () => {
  assert.throws(() => parseDistrictCollisionManifest(manifest(), districts, 100, () => { throw new Error("missing map file"); }), /missing map file/);
});
