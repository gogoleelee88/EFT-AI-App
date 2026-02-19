// 미션 설정 관련 타입 정의

import type { PrivacyMode } from "./privacy";

// === 미세 행동 (Micro Action) ===

export interface MicroAction {
  micro_action_id: number;
  task_id: number;
  name: string; // "한 문제만 풀기"
  description?: string; // "1번 문제 풀이 시작"
  start_trigger?: string; // "문제에 동그라미 치기"
  source: "user_history" | "ai_recommendation" | "user_custom";
  success_count: number;
  total_count: number;
  success_rate: number; // 0.0 ~ 1.0
  last_used_at?: string; // ISO8601
  created_at: string;
}

export interface MicroActionCreateRequest {
  task_id?: number;
  task_title?: string;
  task_est_minutes?: number;
  name: string;
  description?: string;
  start_trigger?: string;
  source: "user_history" | "ai_recommendation" | "user_custom";
  est_minutes?: number;
}

export interface PlanItemInput {
  title: string;
  start?: string;
  end?: string;
}

export interface MicroActionSuggestion {
  title: string;
  why: string;
  duration_min: number;
  trigger: string;
}

export interface MicroActionSuggestRequest {
  plan_items: PlanItemInput[];
  mission_type?: string;
  recent_micro_actions?: string[];
}

export interface MicroActionSuggestResponse {
  suggestions: MicroActionSuggestion[];
}

// === 미션 (Mission) ===
export type MissionType = "photo" | "location" | "time_check";

export interface Mission {
  mission_template_id?: number;
  mission_id?: string; // "mission_1" (선택적 ID)
  type: MissionType;
  enabled: boolean;
  config: PhotoMissionConfig | LocationMissionConfig | TimeMissionConfig;
  last_used_at?: string;
  last_result?: "success" | "fail";
}

// === 사진 미션 설정 ===
export interface PhotoMissionConfig {
  requirement: string; // "동그라미 + 펜 + 문제집"
  description?: string; // "공식이 선명하게 보이는 사진"
  ocr_keywords?: string[]; // OCR 검출 키워드
  objects_required?: string[]; // 객체 검출 목록
  verification_method?: string; // "검증: OCR(공식 텍스트) + 펜 검출"
  example_image_url?: string; // 예시 사진 URL
}

// === 사진 AI 추천 옵션 ===
export interface PhotoRecommendation {
  label: string; // "손글씨 + 펜"
  description: string; // "공식이 적힌 노트 + 펜"
  verification_description: string; // "검증: OCR(공식 텍스트) + 펜 검출"
  config: PhotoMissionConfig;
}

// === 장소 미션 설정 ===
export interface LocationMissionConfig {
  place_id: number;
  place_name: string;
  address?: string; // "서울시 강남구..."
  gps?: { lat: number; lng: number; radius: number };
  wifi_ssid?: string;
  bluetooth_beacon_id?: string;
  verification_method: ("gps" | "wifi" | "bluetooth")[];
}

// === 시간 확인 미션 설정 ===
export interface TimeMissionConfig {
  time: string; // "HH:mm"
  check_type: ("screen_capture" | "photo")[]; // 복수 선택 가능
  screen_requirements?: {
    check_app_running?: boolean; // 특정 앱 실행 중
    app_name?: string; // "Adobe Acrobat"
    check_file_open?: boolean; // 특정 파일 열림
    file_pattern?: string; // "수학*.pdf"
    check_file_modified?: boolean; // 파일 수정 시간 확인
    modified_within_minutes?: number; // 최근 N분 내 수정
  };
  notification_mode: "silent" | "push";
}

// === 장소 (Place) ===
export interface Place {
  place_id: number;
  name: string;
  address?: string;
  gps_lat?: number;
  gps_lng?: number;
  gps_radius: number;
  wifi_ssid?: string;
  bluetooth_beacon_id?: string;
  verification_method?: string[];
  success_count: number;
  total_count: number;
  success_rate: number;
  last_used_at?: string;
  created_at: string;
}

export interface PlaceSearchResult {
  provider: string;
  provider_id?: string;
  place_name: string;
  address?: string;
  road_address?: string;
  category_name?: string;
  lat: number;
  lng: number;
}

// === 장소 등록 요청 ===
export interface PlaceCreateRequest {
  name: string;
  address?: string;
  gps_lat?: number;
  gps_lng?: number;
  gps_radius?: number;
  wifi_ssid?: string;
  bluetooth_beacon_id?: string;
  verification_method: ("gps" | "wifi" | "bluetooth")[];
}

// === 장소 수정 요청 ===
export interface PlaceUpdateRequest {
  name?: string;
  address?: string;
  gps_lat?: number;
  gps_lng?: number;
  gps_radius?: number;
  wifi_ssid?: string;
  bluetooth_beacon_id?: string;
  verification_method?: ("gps" | "wifi" | "bluetooth")[];
}

// === 알람 설정 ===
export interface AlarmConfig {
  time: string; // "HH:mm"
  repeat: "daily" | "weekdays" | "weekends" | "custom";
  custom_days?: number[]; // 0(일)~6(토)
}

// === 미션 조합 모드 ===
export type MissionCombinationMode = "strict" | "basic" | "flexible";
// strict: 활성화된 미션 전부 통과해야 알람 해제
// basic: 사진 미션만 통과하면 알람 해제
// flexible: 아무 미션 1개만 통과하면 알람 해제

// === AI 추천 응답 ===
export interface MicroActionRecommendation {
  name: string;
  description: string;
  start_trigger?: string;
  est_minutes: number;
}

export interface MissionRecommendResponse {
  photo_options?: PhotoRecommendation[];
  location_suggestion?: {
    recommendation: string;
  };
  time_suggestion?: {
    recommended_time: string;
    check_type: string;
    reason: string;
  };
}

// === Task 최근 이력 ===
export interface TaskHistory {
  task_id: number;
  title: string;
  est_minutes: number;
  success_count: number;
  total_count: number;
  success_rate: number;
  last_used_at?: string;
}

export interface TaskClarifySuggestion {
  title: string;
  reason: string;
}

export interface TaskClarifyRequest {
  title: string;
  mission_type?: string;
  recent_tasks?: string[];
  recent_micro_actions?: string[];
}

export interface TaskClarifyResponse {
  is_ambiguous: boolean;
  issues: string[];
  rewrite_suggestions: TaskClarifySuggestion[];
}

// === 위저드 스텝별 상태 ===
export interface SelectedTask {
  source: "new" | "existing";
  task_id?: number; // 기존 Task 선택 시
  task_title: string;
  est_minutes?: number;
  success_rate?: number;
  resistance_level?: number; // 0~10
}

export interface SelectedMicroAction {
  source: "history" | "ai_recommendation" | "user_custom";
  micro_action_id?: number; // 기존 미세행동 재사용 시
  name: string;
  description?: string;
  start_trigger?: string;
  est_minutes?: number;
  previousMissions?: Mission[]; // "다시 하기" 시 이전 미션 정보
}

export interface MissionConfig {
  type: MissionType;
  enabled: boolean;
  config: PhotoMissionConfig | LocationMissionConfig | TimeMissionConfig;
}

// === 전체 저장 요청 (API 전송용) ===
export interface PlanWithMissionRequest {
  date: string; // "YYYY-MM-DD"
  mode: number; // 100 | 70 | 40
  items: {
    task_id?: number; // 기존 Task
    task_title?: string; // 신규 Task
    est_minutes?: number;
    priority?: number;
    resistance_level?: number; // 0~10
    planned_block_minutes: number;
    micro_steps?: string[];
    micro_action?: {
      micro_action_id?: number;
      name: string;
      description?: string;
      start_trigger?: string;
      source: "user_history" | "ai_recommendation" | "user_custom";
    };
    missions?: {
      mission_id?: string;
      type: MissionType;
      enabled: boolean;
      config: PhotoMissionConfig | LocationMissionConfig | TimeMissionConfig;
    }[];
    missions_combination_mode?: MissionCombinationMode;
    alarm?: AlarmConfig;
    privacy_mode?: PrivacyMode;
  }[];
  user_id?: string;
}

// === 저장 응답 ===
export interface PlanWithMissionResponse {
  day_id: number;
  date: string;
  mode: number;
  items: any[];
}
