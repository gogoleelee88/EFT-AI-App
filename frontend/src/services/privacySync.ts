import type { PrivacyMode } from "@/types/privacy";

import {
  loadPlannerClientState,
  updatePlannerClientState,
} from "./plannerClientStateService";
import type {
  AppOnlyEvent,
  PlannerClientStateSnapshot,
  PrivacyMapping,
} from "../types/plannerClientState";

type EventLike = {
  title: string;
  start: string;
  end: string;
};

const MASKED_PREFIX = "[MASKED]";
const DEFAULT_MASKED_TITLE = "Private schedule";
const DEFAULT_MASKED_DESCRIPTION = "Details hidden in EFT app.";

const privacyMappingCache = new Map<string, Map<string, PrivacyMapping>>();
let activePrivacyUserId: string | null = null;

const normalizeTimeLabel = (value: string): string => {
  const match = value.match(/(\d{2}):(\d{2})/);
  if (!match) return value;
  return `${match[1]}:${match[2]}`;
};

const syncPrivacyCache = (
  userId: string,
  snapshot: PlannerClientStateSnapshot
) => {
  activePrivacyUserId = userId;
  const map = new Map<string, PrivacyMapping>();
  snapshot.privacy_mappings.forEach((entry) => {
    map.set(entry.key, entry);
  });
  privacyMappingCache.set(userId, map);
};

const getUserPrivacyMap = (userId?: string) => {
  const resolvedUserId = userId || activePrivacyUserId || "";
  if (!resolvedUserId) {
    return null;
  }
  return privacyMappingCache.get(resolvedUserId) ?? null;
};

export type { PrivacyMapping, AppOnlyEvent };

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

const stripMaskedPrefix = (title: string) => {
  if (!title.startsWith(MASKED_PREFIX)) return title;
  const stripped = title.replace(MASKED_PREFIX, "").trim();
  return stripped || DEFAULT_MASKED_TITLE;
};

export const primePrivacySyncState = async (userId: string) => {
  if (!userId) return;
  const snapshot = await loadPlannerClientState(userId);
  syncPrivacyCache(userId, snapshot);
};

export const savePrivacyMapping = async (userId: string, entry: PrivacyMapping) => {
  const snapshot = await updatePlannerClientState(userId, (current) => {
    const map = new Map<string, PrivacyMapping>();
    current.privacy_mappings.forEach((item) => map.set(item.key, item));
    map.set(entry.key, entry);
    return {
      ...current,
      privacy_mappings: Array.from(map.values()),
    };
  });
  syncPrivacyCache(userId, snapshot);
};

export const findPrivacyMapping = (
  maskedTitle: string,
  start: string,
  end: string,
  userId?: string
) => {
  const map = getUserPrivacyMap(userId);
  return map?.get(buildPrivacyKey(maskedTitle, start, end)) ?? null;
};

export const updatePrivacyMappingKey = async (
  userId: string,
  prevKey: string,
  nextKey: string
) => {
  if (!userId || prevKey === nextKey) return;
  const snapshot = await updatePlannerClientState(userId, (current) => {
    const nextMappings = current.privacy_mappings.map((item) =>
      item.key === prevKey
        ? { ...item, key: nextKey, updatedAt: new Date().toISOString() }
        : item
    );
    return {
      ...current,
      privacy_mappings: nextMappings,
    };
  });
  syncPrivacyCache(userId, snapshot);
};

export const resolvePrivacyEvent = <T extends EventLike>(
  event: T,
  userId?: string
): T & { privacy_mode: PrivacyMode; displayTitle: string; maskedTitle?: string } => {
  if (isMaskedTitle(event.title)) {
    const mapping = findPrivacyMapping(event.title, event.start, event.end, userId);
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

export const loadAppOnlyEvents = async (userId: string, date?: string) => {
  if (!userId) return [];
  const snapshot = await loadPlannerClientState(userId);
  syncPrivacyCache(userId, snapshot);
  const data = ensureArray(snapshot.app_only_events);
  if (!date) return data;
  return data.filter((event) => event.date === date);
};

export const saveAppOnlyEvent = async (userId: string, event: AppOnlyEvent) => {
  if (!userId) return;
  const snapshot = await updatePlannerClientState(userId, (current) => ({
    ...current,
    app_only_events: [...ensureArray(current.app_only_events), event],
  }));
  syncPrivacyCache(userId, snapshot);
};

export const updateAppOnlyEvent = async (
  userId: string,
  eventId: string,
  updates: Partial<AppOnlyEvent>
) => {
  if (!userId) return;
  const snapshot = await updatePlannerClientState(userId, (current) => ({
    ...current,
    app_only_events: ensureArray(current.app_only_events).map((event) =>
      event.id === eventId ? { ...event, ...updates } : event
    ),
  }));
  syncPrivacyCache(userId, snapshot);
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
