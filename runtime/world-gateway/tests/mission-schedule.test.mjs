import test from "node:test";
import assert from "node:assert/strict";
import { missionWindowForInstant } from "../dist/mission-schedule.js";

const utc = (value) => Date.parse(value);

test("daily schedule follows local midnight across a daylight-saving spring transition", () => {
  const before = missionWindowForInstant(utc("2026-03-08T12:00:00Z"), "America/New_York");
  assert.equal(new Date(before.startsAt).toISOString(), "2026-03-08T05:00:00.000Z");
  assert.equal(new Date(before.endsAt).toISOString(), "2026-03-09T04:00:00.000Z");
  assert.equal(before.endsAt - before.startsAt, 23 * 60 * 60 * 1000);
});

test("daily schedule follows local midnight across a daylight-saving autumn transition", () => {
  const window = missionWindowForInstant(utc("2026-11-01T12:00:00Z"), "America/New_York");
  assert.equal(new Date(window.startsAt).toISOString(), "2026-11-01T04:00:00.000Z");
  assert.equal(new Date(window.endsAt).toISOString(), "2026-11-02T05:00:00.000Z");
  assert.equal(window.endsAt - window.startsAt, 25 * 60 * 60 * 1000);
});

test("weekly schedule starts Monday in the player's local calendar", () => {
  const window = missionWindowForInstant(utc("2026-11-19T12:00:00Z"), "Africa/Lagos", "weekly");
  assert.equal(window.periodKey, "2026-11-16");
  assert.equal(new Date(window.startsAt).toISOString(), "2026-11-15T23:00:00.000Z");
  assert.equal(new Date(window.endsAt).toISOString(), "2026-11-22T23:00:00.000Z");
});

test("invalid instants, cadence and time zones fail closed", () => {
  assert.throws(() => missionWindowForInstant(NaN, "UTC"), RangeError);
  assert.throws(() => missionWindowForInstant(Date.now(), "UTC", "monthly"), RangeError);
  assert.throws(() => missionWindowForInstant(Date.now(), "Not/A_Zone"), RangeError);
});
