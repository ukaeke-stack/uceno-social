#!/usr/bin/env node
import fs from "node:fs";
import { parseWorldDistricts } from "../runtime/world-gateway/dist/district-policy.js";
import { parseInteractableRegistry } from "../runtime/world-gateway/dist/interactable-registry-policy.js";

const [registryPath, districtsPath] = process.argv.slice(2);
if (!registryPath || !districtsPath) {
  console.error("Usage: validate-world-interactable-registry.mjs <registry.json> <districts.json>");
  process.exit(2);
}
const registryText = fs.readFileSync(registryPath, "utf8");
const districtsText = fs.readFileSync(districtsPath, "utf8");
const worldBounds = Number(process.env.WORLD_BOUNDS || 10000);
if (!Number.isFinite(worldBounds) || worldBounds <= 0)
  throw new Error("WORLD_BOUNDS must be a positive finite number");

let rawRegistry;
try { rawRegistry = JSON.parse(registryText); }
catch { throw new Error("world-interactables.json must be valid JSON"); }
if (!rawRegistry || !Array.isArray(rawRegistry.interactables) || rawRegistry.interactables.length === 0)
  throw new Error("world-interactables.json must contain a non-empty interactables array");

const districts = parseWorldDistricts(districtsText, worldBounds);
if (districts.length === 0)
  throw new Error("world-districts.json must contain at least one configured district");

for (const item of rawRegistry.interactables) {
  if (!item || typeof item.id !== "string" || !/^scene:[0-9a-f]{32}$/.test(item.id) ||
      typeof item.yaw !== "number" || !Number.isFinite(item.yaw))
    throw new Error("Every exported scene interactable must have a stable scene: ID");
}
const parsed = parseInteractableRegistry(registryText, districts, worldBounds);
if (parsed.size !== rawRegistry.interactables.length)
  throw new Error("Gateway parser did not retain every exported scene interactable");

console.log("Gateway parser validated " + parsed.size + " exported scene interactables against " + districts.length + " configured districts");
