type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteBounded(value: unknown, minimum: number, maximum: number): boolean {
  return typeof value === "number" && Number.isFinite(value) &&
    value >= minimum && value <= maximum;
}

export function isValidHomeTransform(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return finiteBounded(value.x, -10000, 10000) &&
    finiteBounded(value.y, 1.15, 10000) &&
    finiteBounded(value.z, -10000, 10000) &&
    (!("yaw" in value) || finiteBounded(value.yaw, -360, 360));
}

export function isValidHomeFurnishing(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > 100) return false;
  return value.every((item) => {
    if (!isRecord(item)) return false;
    if (typeof item.id !== "string" || !/^[a-z0-9-]{1,80}$/i.test(item.id)) return false;
    if (typeof item.assetId !== "string" || !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(item.assetId)) return false;
    // Furniture positions are home-local coordinates, not arbitrary world positions.
    if (!finiteBounded(item.x, -25, 25) ||
        !finiteBounded(item.y, -2, 10) ||
        !finiteBounded(item.z, -25, 25) ||
        !finiteBounded(item.yaw, -360, 360) ||
        !finiteBounded(item.scale, 0.05, 10)) return false;
    return true;
  });
}
