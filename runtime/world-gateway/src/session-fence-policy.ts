function safeInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

export function checkpointVersionForSession(
  storedGeneration: unknown,
  storedVersion: unknown,
  activeGeneration: number
): number {
  const generation = safeInteger(storedGeneration);
  const version = safeInteger(storedVersion);
  if (!Number.isSafeInteger(activeGeneration) || activeGeneration < 1 ||
      generation !== activeGeneration || version === null || version < 0) return 0;
  return version;
}
