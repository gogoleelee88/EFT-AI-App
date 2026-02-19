import type { PrivacyMode } from "@/types/privacy";

export type PrivacyMapping = {
  key: string;
  originalTitle: string;
  originalDescription?: string;
  maskedTitle: string;
  maskedDescription?: string;
  privacy_mode: "MASKED";
  updatedAt: string;
};

export type AppOnlyEvent = {
  id: string;
  title: string;
  description?: string;
  date: string;
  startIso: string;
  endIso: string;
  privacy_mode: "APP_ONLY";
  createdAt: string;
};

type EventLike = {
  title: string;
  start: string;
  end: string;
};

const PRIVACY_MAP_KEY = "eft.privacy_sync.map.v1";
const APP_ONLY_KEY = "eft.privacy_sync.app_only.v1";

const MASKED_PREFIX = "[MASKED]";
const DEFAULT_MASKED_TITLE = "Private schedule";
const DEFAULT_MASKED_DESCRIPTION = "Details hidden in EFT app.";

const loadJson = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const saveJson = (key: string, value: unknown) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures (private mode, quota, etc).
  }
};

const normalizeTimeLabel = (value: string): string => {
  const match = value.match(/(\d{2}):(\d{2})/);
  if (!match) return value;
  return `${match[1]}:${match[2]}`;
};

const stripMaskedPrefix = (title: string) => {
  if (!title.startsWith(MASKED_PREFIX)) return title;
  const stripped = title.replace(MASKED_PREFIX, "").trim();
  return stripped || DEFAULT_MASKED_TITLE;
};

export const isMaskedTitle = (title: string) => title.startsWith(MASKED_PREFIX);

export const buildMaskedTitle = () => `${MASKED_PREFIX} ${DEFAULT_MASKED_TITLE}`;

export const buildPrivacyKey = (maskedTitle: string, start: string, end: string) =>
  `${maskedTitle}|${normalizeTimeLabel(start)}|${normalizeTimeLabel(end)}`;

export const createMaskedPayload = (start: string, end: string) => {
  const maskedTitle = buildMaskedTitle();
  const maskedDescription = DEFAULT_MASKED_DESCRIPTION;
  const privacyKey = buildPrivacyKey(maskedTitle, start, end);
  return { maskedTitle, maskedDescription, privacyKey };
};

export const savePrivacyMapping = (entry: PrivacyMapping) => {
  const map = loadJson<Record<string, PrivacyMapping>>(PRIVACY_MAP_KEY, {});
  map[entry.key] = entry;
  saveJson(PRIVACY_MAP_KEY, map);
};

export const findPrivacyMapping = (
  maskedTitle: string,
  start: string,
  end: string
) => {
  const map = loadJson<Record<string, PrivacyMapping>>(PRIVACY_MAP_KEY, {});
  return map[buildPrivacyKey(maskedTitle, start, end)] ?? null;
};

export const updatePrivacyMappingKey = (prevKey: string, nextKey: string) => {
  if (prevKey === nextKey) return;
  const map = loadJson<Record<string, PrivacyMapping>>(PRIVACY_MAP_KEY, {});
  const current = map[prevKey];
  if (!current) return;
  delete map[prevKey];
  map[nextKey] = { ...current, key: nextKey, updatedAt: new Date().toISOString() };
  saveJson(PRIVACY_MAP_KEY, map);
};

export const resolvePrivacyEvent = <T extends EventLike>(
  event: T
): T & { privacy_mode: PrivacyMode; displayTitle: string; maskedTitle?: string } => {
  if (isMaskedTitle(event.title)) {
    const mapping = findPrivacyMapping(event.title, event.start, event.end);
    return {
      ...event,
      privacy_mode: "MASKED",
      displayTitle: mapping?.originalTitle ?? stripMaskedPrefix(event.title),
      maskedTitle: event.title,
    };
  }
  return {
    ...event,
    privacy_mode: "NORMAL",
    displayTitle: event.title,
  };
};

const ensureArray = (value: unknown): AppOnlyEvent[] =>
  Array.isArray(value) ? (value as AppOnlyEvent[]) : [];

export const loadAppOnlyEvents = (date?: string) => {
  const data = ensureArray(loadJson<unknown>(APP_ONLY_KEY, []));
  if (!date) return data;
  return data.filter((event) => event.date === date);
};

export const saveAppOnlyEvent = (event: AppOnlyEvent) => {
  const data = ensureArray(loadJson<unknown>(APP_ONLY_KEY, []));
  data.push(event);
  saveJson(APP_ONLY_KEY, data);
};

export const updateAppOnlyEvent = (
  eventId: string,
  updates: Partial<AppOnlyEvent>
) => {
  const data = ensureArray(loadJson<unknown>(APP_ONLY_KEY, []));
  const next = data.map((event) =>
    event.id === eventId ? { ...event, ...updates } : event
  );
  saveJson(APP_ONLY_KEY, next);
};

export const createAppOnlyEvent = (args: {
  title: string;
  description?: string;
  startIso: string;
  endIso: string;
}): AppOnlyEvent => {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `app-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const date = args.startIso.slice(0, 10);
  return {
    id,
    title: args.title,
    description: args.description,
    date,
    startIso: args.startIso,
    endIso: args.endIso,
    privacy_mode: "APP_ONLY",
    createdAt: new Date().toISOString(),
  };
};
