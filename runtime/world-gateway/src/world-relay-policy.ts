export const WORLD_SNAPSHOT_RELAY_INTERVAL_MS = 200;
export const WORLD_RELAY_POLL_INTERVAL_MS = 100;
export const WORLD_RELAY_BATCH_SIZE = 250;
export function shouldPublishWorldSnapshot(lastPublishedAt: number, now: number): boolean {
 return Number.isFinite(now) && Number.isFinite(lastPublishedAt) && now >= lastPublishedAt && now - lastPublishedAt >= WORLD_SNAPSHOT_RELAY_INTERVAL_MS;
}
export function nextRelayCursor(current: number, received: unknown): number {
 if (!Number.isSafeInteger(current) || current < 0 || typeof received !== 'number' || !Number.isSafeInteger(received) || received < current) return current;
 return received;
}
