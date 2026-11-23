/**
 * Time-zone-aware mission windows.
 *
 * Windows are derived from local calendar boundaries, not fixed 24-hour
 * durations, so daylight-saving transitions do not shift daily resets.
 */
export type MissionCadence = "daily" | "weekly";
export interface MissionWindow {
  cadence: MissionCadence;
  timeZone: string;
  periodKey: string;
  startsAt: number;
  endsAt: number;
}

const DATE_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit"
});
function dateKey(date: Date): string {
  const parts = Object.fromEntries(DATE_PARTS.formatToParts(date).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function partsInZone(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(timestamp));
  return Object.fromEntries(parts.map(p => [p.type, Number(p.value)]));
}
function zonedMidnightUtc(year: number, month: number, day: number, timeZone: string): number {
  const target = Date.UTC(year, month - 1, day, 0, 0, 0);
  let guess = target;
  // Iteratively correct the UTC guess against the requested zone's wall clock.
  for (let i = 0; i < 4; i++) {
    const p = partsInZone(guess, timeZone);
    const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const correction = target - represented;
    if (correction === 0) return guess;
    guess += correction;
  }
  const p = partsInZone(guess, timeZone);
  if (p.year !== year || p.month !== month || p.day !== day || p.hour !== 0 || p.minute !== 0)
    throw new RangeError("Local midnight could not be resolved for time zone");
  return guess;
}
function addCalendarDays(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  return dateKey(new Date(Date.UTC(year, month - 1, day + days)));
}
export function missionWindowForInstant(
  instant: number, timeZone: string, cadence: MissionCadence = "daily"
): MissionWindow {
  if (!Number.isFinite(instant)) throw new RangeError("Invalid mission schedule instant");
  if (cadence !== "daily" && cadence !== "weekly") throw new RangeError("Invalid mission cadence");
  // Validate the IANA zone even in edge cases where no formatting would otherwise occur.
  new Intl.DateTimeFormat("en", { timeZone }).format(new Date(instant));
  const local = partsInZone(instant, timeZone);
  let periodStart = `${String(local.year).padStart(4, "0")}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`;
  if (cadence === "weekly") {
    const weekday = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();
    const daysSinceMonday = (weekday + 6) % 7;
    periodStart = addCalendarDays(periodStart, -daysSinceMonday);
  }
  const periodEnd = addCalendarDays(periodStart, cadence === "daily" ? 1 : 7);
  const [sy, sm, sd] = periodStart.split("-").map(Number);
  const [ey, em, ed] = periodEnd.split("-").map(Number);
  const startsAt = zonedMidnightUtc(sy, sm, sd, timeZone);
  const endsAt = zonedMidnightUtc(ey, em, ed, timeZone);
  if (!(startsAt <= instant && instant < endsAt))
    throw new RangeError("Resolved mission window does not contain the supplied instant");
  return { cadence, timeZone, periodKey: periodStart, startsAt, endsAt };
}
