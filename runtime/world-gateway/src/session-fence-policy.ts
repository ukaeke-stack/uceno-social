export function checkpointVersionForSession(
  storedGeneration: unknown,
  storedVersion: unknown,
  activeGeneration: number
): number {
  if (!Number.isSafeInteger(activeGeneration) || activeGeneration < 1) return 0;
  if (typeof storedGeneration !== "number" || !Number.isSafeInteger(storedGeneration) ||
      storedGeneration !== activeGeneration) return 0;
  if (typeof storedVersion !== "number" || !Number.isSafeInteger(storedVersion) || storedVersion < 0) return 0;
  return storedVersion;
}
