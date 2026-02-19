// 미션 설정 관련 API 호출 서비스
import type {
  Place,
  PlaceSearchResult,
  PlaceCreateRequest,
  PlaceUpdateRequest,
  MicroAction,
  MicroActionCreateRequest,
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

// === 장소 (Place) API ===

/**
 * 사용자 장소 목록 조회
 */
export async function getPlaces(userId?: string): Promise<Place[]> {
  const params = new URLSearchParams();
  if (userId) params.append("user_id", userId);

  const response = await fetch(`${API_BASE}/places?${params}`, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`장소 목록 조회 실패: ${response.status}`);
  }

  return response.json();
}

/**
 * 주소/상호 기반 장소 검색
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
    let message = `장소 검색 실패: ${response.status}`;
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
    throw new Error(`미세행동 생성 실패: ${response.status}`);
  }

  return response.json();
}

/**
 * Schedule-based micro action suggestions.
 */
export async function suggestMicroActions(
  data: MicroActionSuggestRequest
): Promise<MicroActionSuggestResponse> {
  const response = await fetch(`${API_BASE}/micro-actions/suggest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    let message = `미세행동 추천 실패: ${response.status}`;
    const raw = await response.text();
    try {
      const payload = JSON.parse(raw) as {
        error_code?: string;
        message?: string;
        detail?: string;
        detail_message?: string;
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
    let message = `할 일 구체화 실패: ${response.status}`;
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
 * 새 장소 등록
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
    throw new Error(`장소 등록 실패: ${response.status}`);
  }

  return response.json();
}

/**
 * 장소 정보 수정
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
    throw new Error(`장소 수정 실패: ${response.status}`);
  }

  return response.json();
}

/**
 * 장소 삭제
 */
export async function deletePlace(placeId: number, userId?: string): Promise<void> {
  const params = new URLSearchParams();
  if (userId) params.append("user_id", userId);

  const response = await fetch(`${API_BASE}/places/${placeId}?${params}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`장소 삭제 실패: ${response.status}`);
  }
}

// === 미세행동 (MicroAction) API ===

/**
 * 특정 Task의 미세행동 이력 조회
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
    throw new Error(`미세행동 조회 실패: ${response.status}`);
  }

  return response.json();
}

/**
 * AI 기반 미세행동 추천 (ChatGPT)
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
    throw new Error(`미세행동 추천 실패: ${response.status}`);
  }

  return response.json();
}

// === 미션 (Mission) API ===

/**
 * 특정 미세행동의 미션 프리셋 조회
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
    throw new Error(`미션 프리셋 조회 실패: ${response.status}`);
  }

  return response.json();
}

/**
 * AI 기반 미션 추천 (ChatGPT)
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
    throw new Error(`미션 추천 실패: ${response.status}`);
  }

  return response.json();
}

// === Task 최근 이력 API ===

/**
 * 최근 사용한 Task 목록 (성공률 포함)
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
    throw new Error(`Task 이력 조회 실패: ${response.status}`);
  }

  const data = await response.json();
  return data.tasks || data; // 백엔드 응답 구조에 따라 조정
}

// === 미션 포함 DayPlan 저장 ===

/**
 * 미션 포함 DayPlan 저장 (확장 엔드포인트)
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
    throw new Error(`미션 포함 계획 저장 실패: ${errorText || response.status}`);
  }

  return response.json();
}

// === 헬퍼 함수 ===

/**
 * 현재 GPS 위치 가져오기 (브라우저 Geolocation API)
 */
export async function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("브라우저가 위치 정보를 지원하지 않습니다."));
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
        reject(new Error(`위치 정보 가져오기 실패: ${error.message}`));
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
 * Wi-Fi SSID 감지 (Web API 제한으로 실제 구현 불가, 플레이스홀더)
 */
export async function detectWifiNetworks(): Promise<string[]> {
  // 브라우저에서는 보안상 Wi-Fi SSID를 직접 감지할 수 없음
  // 모바일 앱(React Native/Capacitor)에서만 가능
  console.warn("Wi-Fi 감지는 웹 브라우저에서 지원되지 않습니다.");
  return [];
}

/**
 * Bluetooth Beacon 검색 (Web Bluetooth API)
 */
export async function detectBluetoothBeacons(): Promise<string[]> {
  // Web Bluetooth API 사용 (Chrome/Edge만 지원)
  if (!("bluetooth" in navigator)) {
    console.warn("브라우저가 Bluetooth를 지원하지 않습니다.");
    return [];
  }

  try {
    const device = await (navigator as any).bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ["battery_service"],
    });
    return [device.id || device.name || "unknown"];
  } catch (error) {
    console.error("Bluetooth 검색 실패:", error);
    return [];
  }
}
