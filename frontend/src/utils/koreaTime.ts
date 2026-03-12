const HHMM_RX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ISO_DATE_RX = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_LOCAL_NO_TZ_RX =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?(?:\.\d+)?$/;

const KOREA_UTC_OFFSET_MINUTES = 9 * 60;
const KOREA_UTC_OFFSET_SUFFIX = "+09:00";
const MS_PER_MINUTE = 60_000;
const KOREA_OFFSET_MS = KOREA_UTC_OFFSET_MINUTES * MS_PER_MINUTE;

const pad2 = (value: number) => String(value).padStart(2, "0");

type KoreaDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function toKoreaDateParts(value: Date): KoreaDateParts {
  const shifted = new Date(value.getTime() + KOREA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

export function todayInKoreaIso(now: Date = new Date()): string {
  const parts = toKoreaDateParts(now);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function toKoreaOffsetDateTime(value: Date): string {
  const parts = toKoreaDateParts(value);
  return (
    `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}` +
    `T${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}` +
    KOREA_UTC_OFFSET_SUFFIX
  );
}

export function buildKoreaOffsetDateTime(
  dateIso: string,
  timeLabel: string
): string | null {
  const dateMatch = dateIso.match(ISO_DATE_RX);
  const timeMatch = timeLabel.match(HHMM_RX);
  if (!dateMatch || !timeMatch) return null;
  return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T${timeMatch[1]}:${timeMatch[2]}:00${KOREA_UTC_OFFSET_SUFFIX}`;
}

export function addMinutesToKoreaOffsetDateTime(
  value: string,
  minutes: number
): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return toKoreaOffsetDateTime(
    new Date(parsed.getTime() + Math.round(minutes) * MS_PER_MINUTE)
  );
}

export function getKoreaTimeLabel(value: string): string | null {
  const raw = value.trim();
  const plainMatch = raw.match(HHMM_RX);
  if (plainMatch) {
    return `${plainMatch[1]}:${plainMatch[2]}`;
  }

  // Treat timezone-free local schedule strings as Korea wall-clock values.
  const localIsoMatch = raw.match(ISO_LOCAL_NO_TZ_RX);
  if (localIsoMatch) {
    return `${localIsoMatch[4]}:${localIsoMatch[5]}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const parts = toKoreaDateParts(parsed);
    return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
  }

  const looseMatch = raw.match(/([01]\d|2[0-3]):([0-5]\d)/);
  if (looseMatch) {
    return `${looseMatch[1]}:${looseMatch[2]}`;
  }

  return null;
}

export function parseKoreaTimeValue(value: string): number {
  const label = getKoreaTimeLabel(value);
  if (!label) return 0;
  const [hour, minute] = label.split(":").map(Number);
  return hour + minute / 60;
}
