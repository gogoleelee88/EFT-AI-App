export type PrivacyMode = "NORMAL" | "MASKED" | "APP_ONLY";

export const PRIVACY_MODE_LABELS: Record<PrivacyMode, string> = {
  NORMAL: "일반 동기화",
  MASKED: "마스킹 동기화",
  APP_ONLY: "앱 전용(외부 공유 없음)",
};

export const PRIVACY_MODE_DESCRIPTIONS: Record<PrivacyMode, string> = {
  NORMAL: "제목/설명/장소를 그대로 Google Calendar로 보냅니다.",
  MASKED: "Google Calendar에는 가명(별칭) 제목과 민감정보를 뺀 안전한 설명만 보냅니다.",
  APP_ONLY: "일정을 앱 안에만 저장하고 Google Calendar로는 보내지 않습니다.",
};
