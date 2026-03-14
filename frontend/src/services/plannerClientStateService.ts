import type { PlannerClientStateSnapshot } from "../types/plannerClientState";

export const PLANNER_CLIENT_STATE_CHANGED_EVENT = "eft:planner-client-state:changed";

const DB_NAME = "eft-planner-cache";
const DB_VERSION = 1;
const STORE_NAME = "planner-client-state";

const memoryCache = new Map<string, PlannerClientStateSnapshot>();

type PlannerClientStateUpsertRequest = {
  expected_version?: number;
  deadline_goals: PlannerClientStateSnapshot["deadline_goals"];
  privacy_mappings: PlannerClientStateSnapshot["privacy_mappings"];
  app_only_events: PlannerClientStateSnapshot["app_only_events"];
  add_alarm_draft: PlannerClientStateSnapshot["add_alarm_draft"];
};

type PlannerClientStateChangedDetail = {
  userId: string;
  version: number;
};

const emptySnapshot = (userId: string): PlannerClientStateSnapshot => ({
  user_id: userId,
  version: 0,
  updated_at: null,
  deadline_goals: [],
  privacy_mappings: [],
  app_only_events: [],
  add_alarm_draft: null,
});

const cloneValue = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const emitChanged = (snapshot: PlannerClientStateSnapshot) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<PlannerClientStateChangedDetail>(PLANNER_CLIENT_STATE_CHANGED_EVENT, {
      detail: {
        userId: snapshot.user_id,
        version: snapshot.version,
      },
    })
  );
};

const normalizeSnapshot = (
  userId: string,
  value?: Partial<PlannerClientStateSnapshot> | null
): PlannerClientStateSnapshot => ({
  user_id: userId,
  version: Number(value?.version || 0),
  updated_at: typeof value?.updated_at === "string" ? value.updated_at : null,
  deadline_goals: Array.isArray(value?.deadline_goals)
    ? cloneValue(value.deadline_goals)
    : [],
  privacy_mappings: Array.isArray(value?.privacy_mappings)
    ? cloneValue(value.privacy_mappings)
    : [],
  app_only_events: Array.isArray(value?.app_only_events)
    ? cloneValue(value.app_only_events)
    : [],
  add_alarm_draft:
    value?.add_alarm_draft && typeof value.add_alarm_draft === "object"
      ? cloneValue(value.add_alarm_draft)
      : null,
});

const openPlannerDb = async (): Promise<IDBDatabase | null> => {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("planner_cache_open_failed"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "user_id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
};

const readCachedSnapshot = async (
  userId: string
): Promise<PlannerClientStateSnapshot | null> => {
  const inMemory = memoryCache.get(userId);
  if (inMemory) {
    return cloneValue(inMemory);
  }

  const db = await openPlannerDb().catch(() => null);
  if (!db) return null;

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(userId);
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const normalized = request.result
        ? normalizeSnapshot(userId, request.result as Partial<PlannerClientStateSnapshot>)
        : null;
      if (normalized) {
        memoryCache.set(userId, cloneValue(normalized));
      }
      resolve(normalized);
    };
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
    tx.onabort = () => db.close();
  });
};

const writeCachedSnapshot = async (
  snapshot: PlannerClientStateSnapshot
): Promise<PlannerClientStateSnapshot> => {
  const normalized = normalizeSnapshot(snapshot.user_id, snapshot);
  memoryCache.set(snapshot.user_id, cloneValue(normalized));

  const db = await openPlannerDb().catch(() => null);
  if (!db) {
    return normalized;
  }

  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(normalized);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
  db.close();

  return normalized;
};

const parseClientStateError = async (response: Response): Promise<Error> => {
  let message = `Planner client-state request failed: ${response.status}`;
  try {
    const payload = await response.json();
    if (payload?.detail?.error === "version_conflict") {
      const err = new Error("planner_client_state_version_conflict");
      (err as Error & { actualVersion?: number }).actualVersion = Number(
        payload.detail.actual ?? 0
      );
      return err;
    }
    if (typeof payload?.detail === "string" && payload.detail.trim()) {
      message = payload.detail;
    }
  } catch {
    // Keep default message.
  }
  return new Error(message);
};

const fetchRemoteSnapshot = async (
  userId: string
): Promise<PlannerClientStateSnapshot> => {
  const response = await fetch("/api/spec/plan/client-state", {
    credentials: "include",
  });
  if (!response.ok) {
    throw await parseClientStateError(response);
  }

  const payload = (await response.json()) as Partial<PlannerClientStateSnapshot>;
  const normalized = normalizeSnapshot(userId, payload);
  await writeCachedSnapshot(normalized);
  return normalized;
};

const putRemoteSnapshot = async (
  userId: string,
  snapshot: PlannerClientStateSnapshot,
  expectedVersion: number
): Promise<PlannerClientStateSnapshot> => {
  const body: PlannerClientStateUpsertRequest = {
    expected_version: expectedVersion,
    deadline_goals: snapshot.deadline_goals,
    privacy_mappings: snapshot.privacy_mappings,
    app_only_events: snapshot.app_only_events,
    add_alarm_draft: snapshot.add_alarm_draft,
  };

  const response = await fetch("/api/spec/plan/client-state", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await parseClientStateError(response);
  }

  const payload = (await response.json()) as Partial<PlannerClientStateSnapshot>;
  const normalized = normalizeSnapshot(userId, payload);
  await writeCachedSnapshot(normalized);
  emitChanged(normalized);
  return normalized;
};

export async function getCachedPlannerClientState(
  userId: string
): Promise<PlannerClientStateSnapshot> {
  return (await readCachedSnapshot(userId)) ?? emptySnapshot(userId);
}

export async function loadPlannerClientState(
  userId: string,
  options?: { preferCache?: boolean; skipRemote?: boolean }
): Promise<PlannerClientStateSnapshot> {
  if (!userId) {
    return emptySnapshot("");
  }

  const preferCache = Boolean(options?.preferCache);
  if (preferCache) {
    const cached = await readCachedSnapshot(userId);
    if (cached) {
      return cached;
    }
  }

  if (!options?.skipRemote) {
    try {
      return await fetchRemoteSnapshot(userId);
    } catch (error) {
      const cached = await readCachedSnapshot(userId);
      if (cached) {
        return cached;
      }
      throw error;
    }
  }

  return (await readCachedSnapshot(userId)) ?? emptySnapshot(userId);
}

export async function updatePlannerClientState(
  userId: string,
  updater: (current: PlannerClientStateSnapshot) => PlannerClientStateSnapshot
): Promise<PlannerClientStateSnapshot> {
  if (!userId) {
    throw new Error("planner_client_state_requires_user");
  }

  let base = await loadPlannerClientState(userId);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const next = normalizeSnapshot(userId, updater(cloneValue(base)));
    try {
      return await putRemoteSnapshot(userId, next, base.version);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "planner_client_state_version_conflict"
      ) {
        base = await fetchRemoteSnapshot(userId);
        continue;
      }
      throw error;
    }
  }

  throw new Error("planner_client_state_conflict_retry_exhausted");
}

export async function loadAddAlarmDraft<T extends object>(
  userId: string
): Promise<T | null> {
  const snapshot = await loadPlannerClientState(userId);
  return snapshot.add_alarm_draft ? (cloneValue(snapshot.add_alarm_draft) as T) : null;
}

export async function saveAddAlarmDraft<T extends object>(
  userId: string,
  draft: T
): Promise<void> {
  await updatePlannerClientState(userId, (current) => ({
    ...current,
    add_alarm_draft: cloneValue(draft) as PlannerClientStateSnapshot["add_alarm_draft"],
  }));
}

export async function clearAddAlarmDraft(userId: string): Promise<void> {
  await updatePlannerClientState(userId, (current) => ({
    ...current,
    add_alarm_draft: null,
  }));
}
