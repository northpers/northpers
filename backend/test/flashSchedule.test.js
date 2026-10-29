const test = require("node:test");
const assert = require("node:assert/strict");
const { isFlashScheduleActive } = require("../utils/flashSchedule");

const config = {
  flash_active: "1",
  flash_start_date: "2026-10-28",
  flash_end_date: "2026-11-02",
  flash_start: "09:30",
  flash_end: "18:00",
};

test("activates within a date range that crosses days and months", () => {
  assert.equal(isFlashScheduleActive(config, { date: "2026-10-28", minutes: 570 }), true);
  assert.equal(isFlashScheduleActive(config, { date: "2026-10-31", minutes: 720 }), true);
  assert.equal(isFlashScheduleActive(config, { date: "2026-11-02", minutes: 1079 }), true);
});

test("respects the start and end times on the boundary dates", () => {
  assert.equal(isFlashScheduleActive(config, { date: "2026-10-28", minutes: 569 }), false);
  assert.equal(isFlashScheduleActive(config, { date: "2026-11-02", minutes: 1080 }), false);
});

test("treats a same-day end time earlier than the start as an overnight schedule", () => {
  const overnight = {
    flash_active: "1",
    flash_start_date: "2026-10-28",
    flash_end_date: "2026-10-28",
    flash_start: "22:00",
    flash_end: "02:00",
  };
  assert.equal(isFlashScheduleActive(overnight, { date: "2026-10-28", minutes: 23 * 60 }), true);
  assert.equal(isFlashScheduleActive(overnight, { date: "2026-10-29", minutes: 60 }), true);
  assert.equal(isFlashScheduleActive(overnight, { date: "2026-10-29", minutes: 120 }), false);
});

test("preserves legacy single-date and time-only schedules", () => {
  const legacyDate = {
    flash_active: "1",
    flash_date: "2026-10-28",
    flash_start: "17:45",
    flash_end: "00:00",
  };
  assert.equal(isFlashScheduleActive(legacyDate, { date: "2026-10-28", minutes: 18 * 60 }), true);
  assert.equal(isFlashScheduleActive(legacyDate, { date: "2026-10-29", minutes: 30 }), false);
  assert.equal(isFlashScheduleActive(legacyDate, { date: "2026-10-30", minutes: 30 }), false);

  const timeOnly = { flash_active: "1", flash_start: "09:00", flash_end: "17:00" };
  assert.equal(isFlashScheduleActive(timeOnly, { date: "2026-10-28", minutes: 10 * 60 }), true);
  assert.equal(isFlashScheduleActive(timeOnly, { date: "2026-10-28", minutes: 17 * 60 }), false);
});

test("rejects malformed dates and times", () => {
  assert.equal(isFlashScheduleActive({ ...config, flash_start_date: "2026-02-30" }, { date: "2026-10-28", minutes: 600 }), false);
  assert.equal(isFlashScheduleActive({ ...config, flash_start: "25:00" }, { date: "2026-10-28", minutes: 600 }), false);
});
