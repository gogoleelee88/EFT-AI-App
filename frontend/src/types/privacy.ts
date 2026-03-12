export type PrivacyMode = "NORMAL" | "MASKED" | "APP_ONLY";

export const PRIVACY_MODE_LABELS: Record<PrivacyMode, string> = {
  NORMAL: "일반 동기화",
  MASKED: "마스킹 동기화",
  APP_ONLY: "앱 전용 저장",
};

export const PRIVACY_MODE_DESCRIPTIONS: Record<PrivacyMode, string> = {
  NORMAL: "일정 제목과 설명을 그대로 Google Calendar로 보냅니다.",
  MASKED: "Google Calendar에는 가명 제목과 최소 설명만 보내고 실제 정보는 앱에 보관합니다.",
  APP_ONLY: "일정을 앱 안에만 저장하고 외부 캘린더로는 보내지 않습니다.",
};
