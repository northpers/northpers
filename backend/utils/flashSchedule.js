function parseMinutes(value) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function addDateDays(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isFlashScheduleActive(cfg, now) {
  if (!cfg || cfg.flash_active !== "1" || !now || !isValidDate(now.date)) return false;
  const start = parseMinutes(cfg.flash_start || "17:45");
  const end = parseMinutes(cfg.flash_end || "00:00");
  if (start === null || end === null || !Number.isInteger(now.minutes) || now.minutes < 0 || now.minutes >= 1440) {
    return false;
  }

  const startDate = cfg.flash_start_date || cfg.flash_date || "";
  const endDate = cfg.flash_end_date || cfg.flash_date || startDate;
  if (!startDate && !endDate) {
    const effectiveEnd = end === 0 || end <= start ? 1440 : end;
    return now.minutes >= start && now.minutes < effectiveEnd;
  }
  if (!isValidDate(startDate) || !isValidDate(endDate) || endDate < startDate) return false;

  const effectiveEndDate = endDate === startDate && end <= start
    ? addDateDays(endDate, 1)
    : endDate;
  if (!isValidDate(effectiveEndDate)) return false;
  if (now.date < startDate || now.date > effectiveEndDate) return false;
  if (now.date === startDate && now.minutes < start) return false;
  if (now.date === effectiveEndDate && now.minutes >= end) return false;
  return true;
}

module.exports = { isFlashScheduleActive, isValidDate, parseMinutes };
