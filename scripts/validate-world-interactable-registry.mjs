#!/usr/bin/env node
import fs from "node:fs";

const [registryPath, districtsPath] = process.argv.slice(2);
if (!registryPath || !districtsPath) {
  console.error("Usage: validate-world-interactable-registry.mjs <registry.json> <districts.json>");
  process.exit(2);
}
const document = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const districtDocument = JSON.parse(fs.readFileSync(districtsPath, "utf8"));
if (!document || !Array.isArray(document.interactables) || document.interactables.length === 0) {
  throw new Error("world-interactables.json must contain a non-empty interactables array");
}
if (document.interactables.length > 500) {
  throw new Error("world-interactables.json exceeds the gateway limit of 500 interactables");
}
if (!districtDocument || !Array.isArray(districtDocument.districts) ||
    districtDocument.districts.length === 0 || districtDocument.districts.length > 100) {
  throw new Error("world-districts.json must contain between 1 and 100 districts");
}
const worldBounds = Number(process.env.WORLD_BOUNDS || 10000);\nif (!Number.isFinite(worldBounds) || worldBounds <= 0) throw new Error("WORLD_BOUNDS must be a positive finite number");\nconst bounded = value => Number.isFinite(value) && value >= -worldBounds && value <= worldBounds;\nconst districts = districtDocument.districts;
const districtIds = new Set();
for (let i = 0; i < districts.length; i++) {
  const district = districts[i];
  if (!district || typeof district.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(district.id) || districtIds.has(district.id) ||
      typeof district.name !== "string" || !district.name.trim() || district.name.length > 80 ||
      typeof district.contentLabel !== "string" ||
      !/^world-city-district-[a-z0-9-]{1,48}$/.test(district.contentLabel) ||
      ![district.minX, district.maxX, district.minZ, district.maxZ].every(bounded) ||
      district.minX >= district.maxX || district.minZ >= district.maxZ) {
    throw new Error("Invalid or duplicate gateway district definition");
  }
  districtIds.add(district.id);
  for (let j = 0; j < i; j++) {
    const previous = districts[j];
    if (district.minX < previous.maxX && district.maxX > previous.minX &&
        district.minZ < previous.maxZ && district.maxZ > previous.minZ) {
      throw new Error("Gateway districts overlap: " + previous.id + " and " + district.id);
    }
  }
}
const ids = new Set();
for (const item of document.interactables) {
  if (!item || typeof item.id !== "string" || !/^scene:[0-9a-f]{32}$/.test(item.id) ||
      !["door", "seat", "furniture", "vehicle", "object"].includes(item.kind) ||
      ![item.x, item.y, item.z].every(bounded) || !Number.isFinite(item.yaw) ||
      item.yaw < -Math.PI * 4 || item.yaw > Math.PI * 4 || ids.has(item.id)) {
    throw new Error("Invalid or duplicate scene interactable entry");
  }
  const owners = districts.filter(district =>
    item.x >= district.minX && item.x < district.maxX &&
    item.z >= district.minZ && item.z < district.maxZ);
  if (owners.length !== 1) {
    throw new Error("Scene interactable must belong to exactly one configured gateway district: " + item.id);
  }
  ids.add(item.id);
}
console.log("Validated " + ids.size + " exported scene interactables against " + districts.length + " gateway districts");
