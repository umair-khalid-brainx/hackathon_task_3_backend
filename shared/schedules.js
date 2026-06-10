export const SCHEDULES_KEY = 'scheduleRanges';
export const SCHEDULER_SESSION_KEY = 'schedulerSession';
export const SCHEDULE_ALARM_NAME = 'focus-mode-schedule-check';
export const SCHEDULE_LAST_FIRED_KEY = 'scheduleLastFired';
export const MAX_SCHEDULE_RANGES = 3;

export function defaultScheduleRanges() {
  return [
    { enabled: false, start: '09:00', end: '17:00' },
    { enabled: false, start: '12:00', end: '13:00' },
    { enabled: false, start: '18:00', end: '21:00' },
  ];
}

export function parseTimeToMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function validateScheduleRange(range) {
  if (!range.enabled) {
    return { valid: true };
  }

  if (!range.start || !range.end) {
    return { valid: false, error: 'Start and end times are required for enabled schedules.' };
  }

  const start = parseTimeToMinutes(range.start);
  const end = parseTimeToMinutes(range.end);

  if (Number.isNaN(start) || Number.isNaN(end)) {
    return { valid: false, error: 'Enter valid times in HH:MM format.' };
  }

  if (start >= end) {
    return { valid: false, error: 'Start time must be before end time.' };
  }

  return { valid: true };
}

export function validateScheduleRanges(ranges) {
  for (let index = 0; index < ranges.length; index += 1) {
    const result = validateScheduleRange(ranges[index]);

    if (!result.valid) {
      return { valid: false, error: `Schedule ${index + 1}: ${result.error}` };
    }
  }

  return { valid: true };
}

export function normalizeScheduleRanges(ranges) {
  const defaults = defaultScheduleRanges();

  return defaults.map((fallback, index) => {
    const range = ranges[index] || {};

    return {
      enabled: Boolean(range.enabled),
      start: range.start || fallback.start,
      end: range.end || fallback.end,
    };
  });
}

export function getTodayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function getCurrentMinutes(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

export function pruneScheduleLastFired(lastFired, todayKey) {
  return Object.fromEntries(
    Object.entries(lastFired).filter(([key]) => key.startsWith(todayKey))
  );
}

export function buildScheduleEventKey(todayKey, rangeIndex, eventType) {
  return `${todayKey}-${rangeIndex}-${eventType}`;
}
