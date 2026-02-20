// 誘몄뀡 ?ㅼ젙 愿??API ?몄텧 ?쒕퉬??
import type {
  Place,
  PlaceSearchResult,
  PlaceCreateRequest,
  PlaceUpdateRequest,
  MicroAction,
  MicroActionCreateRequest,
  MicroActionSuggestion,
  MicroActionRecommendation,
  MicroActionSuggestRequest,
  MicroActionSuggestResponse,
  TaskClarifyRequest,
  TaskClarifyResponse,
  Mission,
  MissionRecommendResponse,
  TaskHistory,
  PlanWithMissionRequest,
  PlanWithMissionResponse,
} from "../types/mission";

const API_BASE = "/api/spec";

const FALLBACK_MICRO_ACTION_RECOMMENDATIONS: MicroActionRecommendation[] = [
  {
    name: "핵심 2분 정리",
    description: "작업 직후 2분 동안 핵심만 적어 목표를 고정합니다.",
    start_trigger: "작업 직후",
    est_minutes: 2,
  },
  {
    name: "우선순위 1개 선택",
    description: "당장 할 수 있는 첫 번째 동작 1개에 집중합니다.",
    start_trigger: "시작이 막힐 때",
    est_minutes: 3,
  },
  {
    name: "작은 마감 설정",
    description: "현재 블록을 벗어나기 위한 짧은 마감 시점을 잡습니다.",
    start_trigger: "10분 경과 후",
    est_minutes: 5,
  },
];

const FALLBACK_MICRO_ACTION_SUGGESTIONS: MicroActionSuggestion[] = [
  {
    title: "핵심 2분 정리",
    why: "작업 직후 2분 동안 핵심만 적어 목표를 고정합니다.",
    duration_min: 2,
    trigger: "작업 직후",
  },
  {
    title: "우선순위 1개 선택",
    why: "당장 할 수 있는 첫 번째 동작 1개에 집중합니다.",
    duration_min: 3,
    trigger: "시작이 막힐 때",
  },
  {
    title: "작은 마감 설정",
    why: "현재 블록을 벗어나기 위한 짧은 마감 시점을 잡습니다.",
    duration_min: 5,
    trigger: "10분 경과 후",
  },
];

const FALLBACK_MISSION_RECOMMENDATIONS = (
  taskTitle: string,
  microActionName: string
): MissionRecommendResponse => ({
  photo_options: [
    {
      label: "업무 전 정리 컷",
      description: `${taskTitle} 시작 전 환경을 정돈하세요.`,
      verification_description: `${microActionName} 전 정돈된 환경인지 확인합니다.`,
      config: {
        requirement: "정돈된 책상, 노트, 물병",
        description: "간단한 정비만으로도 시작 난이도를 낮춥니다.",
        objects_required: ["desk", "notebook", "pen"],
        verification_method: "시작 전 환경 체크",
      },
    },
  ],
  location_suggestion: {
    recommendation: `${taskTitle}를 위한 조용한 장소`,
  },
  time_suggestion: {
    recommended_time: "19:00",
    check_type: "screen_capture",
    reason: "짧은 루틴 수행에 적절한 시점입니다.",
  },
});

// === ?μ냼 (Place) API ===

/**
 * ?ъ슜???μ냼 紐⑸줉 議고쉶
 */
export async function getPlaces(userId?: string): Promise<Place[]> {
  const params = new URLSearchParams();
  if (userId) params.append("user_id", userId);

  const response = await fetch(`${API_BASE}/places?${params}`, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`?μ냼 紐⑸줉 議고쉶 ?ㅽ뙣: ${response.status}`);
  }

  return response.json();
}

/**
 * 二쇱냼/?곹샇 湲곕컲 ?μ냼 寃??
 */
export async function searchPlaceCandidates(
  query: string,
  size: number = 8
): Promise<PlaceSearchResult[]> {
  const keyword = query.trim();
  if (!keyword) return [];

  const params = new URLSearchParams();
  params.append("q", keyword);
  params.append("size", String(size));

  const response = await fetch(`${API_BASE}/places/search?${params}`, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    let message = `?μ냼 寃???ㅽ뙣: ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: unknown };
      if (typeof payload?.detail === "string" && payload.detail.trim()) {
        message = payload.detail;
      }
    } catch {
      // noop
    }
    throw new Error(message);
  }

  return response.json();
}

/**
 * Create or reuse a micro action.
 */
export async function createMicroAction(
  data: MicroActionCreateRequest,
  userId?: string
): Promise<MicroAction> {
  const params = new URLSearchParams();
  if (userId) params.append("user_id", userId);

  const response = await fetch(`${API_BASE}/micro-actions?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`誘몄꽭?됰룞 ?앹꽦 ?ㅽ뙣: ${response.status}`);
  }

  return response.json();
}

/**
 * Schedule-based micro action suggestions.
 */
export async function suggestMicroActions(
  data: MicroActionSuggestRequest
): Promise<MicroActionSuggestResponse> {
  const requestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  } as const;

  const normalizeRecommendPayload = (payload: unknown): MicroActionSuggestion[] => {
    if (!Array.isArray(payload)) return [];
    return payload
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const raw = item as Record<string, unknown>;
        const name = String(raw.name ?? "").trim();
        if (!name) return null;
        const title = String(raw.title ?? name).trim();
        const why = String(raw.description ?? raw.why ?? "").trim();
        const trigger = String(raw.start_trigger ?? raw.trigger ?? "").trim();
        const duration = Number(raw.est_minutes ?? raw.duration_min ?? 0);
        if (!title || !why || !trigger || Number.isNaN(duration)) {
          return null;
        }
        return {
          title: title.slice(0, 64),
          why: why.slice(0, 200),
          duration_min: Math.max(1, Math.min(15, Math.round(duration))),
          trigger: trigger.slice(0, 64),
        } satisfies MicroActionSuggestion;
      })
      .filter((item): item is MicroActionSuggestion => Boolean(item))
      .slice(0, 3);
  };

  const preferred = await fetch(`${API_BASE}/micro-actions/suggest`, requestInit);
  if (preferred.ok) {
    const payload = await preferred.json();
    const suggestions = normalizeRecommendPayload(payload?.suggestions ?? payload);
    if (suggestions.length > 0) {
      return { suggestions };
    }
  }

  const firstPlanItem = data.plan_items[0]?.title?.trim();
  if (firstPlanItem) {
    const legacyParams = new URLSearchParams();
    legacyParams.append("task_title", firstPlanItem.slice(0, 80));
    if (data.mission_type) legacyParams.append("mission_type", data.mission_type);

    const legacy = await fetch(
      `${API_BASE}/micro-actions/recommend?${legacyParams}`,
      {
        method: "POST",
        credentials: "include",
      }
    );
    if (legacy.ok) {
      const legacyPayload = await legacy.json();
      const legacySuggestions = normalizeRecommendPayload(legacyPayload);
      if (legacySuggestions.length > 0) {
        return { suggestions: legacySuggestions };
      }
    }
  }

  let message = `마이크로 액션 추천 실패: ${preferred.status}`;
  try {
    const payload = (await preferred.text()).trim();
    if (payload) {
      message = payload;
    }
  } catch {
    // no-op
  }
  return { suggestions: FALLBACK_MICRO_ACTION_SUGGESTIONS };
}
/**
 * Clarify ambiguous task titles.
 */
export async function clarifyTaskTitle(
  data: TaskClarifyRequest
): Promise<TaskClarifyResponse> {
  const response = await fetch(`${API_BASE}/tasks/clarify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    let message = `????援ъ껜???ㅽ뙣: ${response.status}`;
    const raw = await response.text();
    try {
      const payload = JSON.parse(raw) as {
        error_code?: string;
        message?: string;
        detail?: string;
      };
      if (payload?.message) {
        message = payload.error_code
          ? `[${payload.error_code}] ${payload.message}`
          : payload.message;
      } else if (payload?.detail) {
        message = String(payload.detail);
      }
    } catch {
      if (raw) message = raw;
    }
    throw new Error(message);
  }

  return response.json();
}

/**
 * ???μ냼 ?깅줉
 */
export async function createPlace(
  data: PlaceCreateRequest,
  userId?: string
): Promise<Place> {
  const params = new URLSearchParams();
  if (userId) params.append("user_id", userId);

  const response = await fetch(`${API_BASE}/places?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`?μ냼 ?깅줉 ?ㅽ뙣: ${response.status}`);
  }

  return response.json();
}

/**
 * ?μ냼 ?뺣낫 ?섏젙
 */
export async function updatePlace(
  placeId: number,
  data: PlaceUpdateRequest,
  userId?: string
): Promise<Place> {
  const params = new URLSearchParams();
  if (userId) params.append("user_id", userId);

  const response = await fetch(`${API_BASE}/places/${placeId}?${params}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`?μ냼 ?섏젙 ?ㅽ뙣: ${response.status}`);
  }

  return response.json();
}

/**
 * ?μ냼 ??젣
 */
export async function deletePlace(placeId: number, userId?: string): Promise<void> {
  const params = new URLSearchParams();
  if (userId) params.append("user_id", userId);

  const response = await fetch(`${API_BASE}/places/${placeId}?${params}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`?μ냼 ??젣 ?ㅽ뙣: ${response.status}`);
  }
}

// === 誘몄꽭?됰룞 (MicroAction) API ===

/**
 * ?뱀젙 Task??誘몄꽭?됰룞 ?대젰 議고쉶
 */
export async function getMicroActions(
  taskId: number,
  userId?: string,
  limit: number = 10,
  search?: string,
  includeUnused?: boolean
): Promise<MicroAction[]> {
  const params = new URLSearchParams();
  params.append("task_id", taskId.toString());
  if (userId) params.append("user_id", userId);
  params.append("limit", limit.toString());
  if (search) params.append("q", search);
  if (includeUnused) params.append("include_unused", "true");

  const response = await fetch(`${API_BASE}/micro-actions?${params}`, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`誘몄꽭?됰룞 議고쉶 ?ㅽ뙣: ${response.status}`);
  }

  return response.json();
}

/**
 * AI 湲곕컲 誘몄꽭?됰룞 異붿쿇 (ChatGPT)
 */
export async function recommendMicroActions(
  taskTitle: string,
  taskId?: number
): Promise<MicroActionRecommendation[]> {
  const params = new URLSearchParams();
  params.append("task_title", taskTitle);
  if (taskId) params.append("task_id", taskId.toString());

  const response = await fetch(`${API_BASE}/micro-actions/recommend?${params}`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`誘몄꽭?됰룞 異붿쿇 ?ㅽ뙣: ${response.status}`);
  }

  return response.json();
}

// === 誘몄뀡 (Mission) API ===

/**
 * ?뱀젙 誘몄꽭?됰룞??誘몄뀡 ?꾨━??議고쉶
 */
export async function getMissionPresets(
  microActionId: number,
  userId?: string
): Promise<Mission[]> {
  const params = new URLSearchParams();
  params.append("micro_action_id", microActionId.toString());
  if (userId) params.append("user_id", userId);

  const response = await fetch(`${API_BASE}/missions/presets?${params}`, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`誘몄뀡 ?꾨━??議고쉶 ?ㅽ뙣: ${response.status}`);
  }

  return response.json();
}

/**
 * AI 湲곕컲 誘몄뀡 異붿쿇 (ChatGPT)
 */
export async function recommendMissions(
  taskTitle: string,
  microActionName: string,
  startTrigger?: string,
  userId?: string
): Promise<MissionRecommendResponse> {
  const params = new URLSearchParams();
  params.append("task_title", taskTitle);
  params.append("micro_action_name", microActionName);
  if (startTrigger) params.append("start_trigger", startTrigger);
  if (userId) params.append("user_id", userId);

  const response = await fetch(`${API_BASE}/missions/recommend?${params}`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    if (response.status === 404) {
      return FALLBACK_MISSION_RECOMMENDATIONS(taskTitle, microActionName);
    }
    throw new Error(`미션 추천 실패: ${response.status}`);
  }

  return response.json();
}
// === Task 理쒓렐 ?대젰 API ===

/**
 * 理쒓렐 ?ъ슜??Task 紐⑸줉 (?깃났瑜??ы븿)
 */
export async function getRecentTasks(
  userId?: string,
  limit: number = 10
): Promise<TaskHistory[]> {
  const params = new URLSearchParams();
  if (userId) params.append("user_id", userId);
  params.append("limit", limit.toString());

  const response = await fetch(`${API_BASE}/tasks/recent?${params}`, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Task ?대젰 議고쉶 ?ㅽ뙣: ${response.status}`);
  }

  const data = await response.json();
  return data.tasks || data; // 諛깆뿏???묐떟 援ъ“???곕씪 議곗젙
}

// === 誘몄뀡 ?ы븿 DayPlan ???===

/**
 * 誘몄뀡 ?ы븿 DayPlan ???(?뺤옣 ?붾뱶?ъ씤??
 */
export async function savePlanWithMission(
  request: PlanWithMissionRequest
): Promise<PlanWithMissionResponse> {
  const response = await fetch(`${API_BASE}/plan/day-with-mission`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`誘몄뀡 ?ы븿 怨꾪쉷 ????ㅽ뙣: ${errorText || response.status}`);
  }

  return response.json();
}

// === ?ы띁 ?⑥닔 ===

/**
 * ?꾩옱 GPS ?꾩튂 媛?몄삤湲?(釉뚮씪?곗? Geolocation API)
 */
export async function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("釉뚮씪?곗?媛 ?꾩튂 ?뺣낫瑜?吏?먰븯吏 ?딆뒿?덈떎."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        reject(new Error(`?꾩튂 ?뺣낫 媛?몄삤湲??ㅽ뙣: ${error.message}`));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  });
}

/**
 * Wi-Fi SSID 媛먯? (Web API ?쒗븳?쇰줈 ?ㅼ젣 援ы쁽 遺덇?, ?뚮젅?댁뒪???
 */
export async function detectWifiNetworks(): Promise<string[]> {
  // 釉뚮씪?곗??먯꽌??蹂댁븞??Wi-Fi SSID瑜?吏곸젒 媛먯??????놁쓬
  // 紐⑤컮????React Native/Capacitor)?먯꽌留?媛??
  console.warn("Wi-Fi 媛먯?????釉뚮씪?곗??먯꽌 吏?먮릺吏 ?딆뒿?덈떎.");
  return [];
}

/**
 * Bluetooth Beacon 寃??(Web Bluetooth API)
 */
export async function detectBluetoothBeacons(): Promise<string[]> {
  // Web Bluetooth API ?ъ슜 (Chrome/Edge留?吏??
  if (!("bluetooth" in navigator)) {
    console.warn("釉뚮씪?곗?媛 Bluetooth瑜?吏?먰븯吏 ?딆뒿?덈떎.");
    return [];
  }

  try {
    const device = await (navigator as any).bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ["battery_service"],
    });
    return [device.id || device.name || "unknown"];
  } catch (error) {
    console.error("Bluetooth 寃???ㅽ뙣:", error);
    return [];
  }
}

