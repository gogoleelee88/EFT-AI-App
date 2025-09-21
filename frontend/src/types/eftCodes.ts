/**
 * EFT 탭핑 포인트 표준 코드 정의
 * - 배열 상수에서 유니온 타입을 자동 유도하여 "타입/데이터 단일 소스" 유지
 * - 좌/우 분리 포인트는 필요 시 단계적으로 확장
 */

// 1) 표준 코드 마스터 (ARHolisticTest.tsx 실제 구현 기준)
export const EFT_CODES = [
  'TH',      // Top of Head (정수리)
  'EB',      // Eyebrow (눈썹)
  'SE',      // Side of Eye (눈 옆) - 입력용만, 실제로는 SE-L/SE-R로 분리
  'SE-L',    // Side of Eye Left (왼쪽 눈 옆)
  'SE-R',    // Side of Eye Right (오른쪽 눈 옆)
  'UE',      // Under Eye (눈 아래)
  'UN',      // Under Nose (코 아래)
  'CH',      // Chin (턱)
  'CB',      // Collarbone (쇄골)
  // 'UA',   // Under Arm (겨드랑이) - ARHolisticTest에서 미지원으로 제거
  // 'WR',   // Wrist (손목) ← 필요하면 활성화
] as const;

export type EFTCode = typeof EFT_CODES[number];

// 2) 라벨 매핑 (ko / en) - UA 제거
export const EFT_LABELS_KO: Record<EFTCode, string> = {
  TH: '정수리',
  EB: '눈썹',
  SE: '눈 옆',
  'SE-L': '눈 옆 (좌)',
  'SE-R': '눈 옆 (우)',
  UE: '눈 밑',
  UN: '코 밑',
  CH: '턱',
  CB: '쇄골',
};

export const EFT_LABELS_EN: Record<EFTCode, string> = {
  TH: 'Top of Head',
  EB: 'Eyebrow',
  SE: 'Side of Eye',
  'SE-L': 'Side of Eye (Left)',
  'SE-R': 'Side of Eye (Right)',
  UE: 'Under Eye',
  UN: 'Under Nose',
  CH: 'Chin',
  CB: 'Collarbone',
};

// 3) 공용 헬퍼
export function isEFTCode(v: unknown): v is EFTCode {
  return typeof v === 'string' && (EFT_CODES as readonly string[]).includes(v);
}

export type EFTLabelLang = 'ko' | 'en';
export function getEFTLabel(code: EFTCode, lang: EFTLabelLang = 'ko'): string {
  return lang === 'en' ? EFT_LABELS_EN[code] : EFT_LABELS_KO[code];
}

// 4) 추천/가이드에서 자주 쓰는 기본 시퀀스 (ARHolisticTest.tsx 호환)
export const EFT_SEQUENCE_DEFAULT: EFTCode[] = ['TH', 'EB', 'SE-L', 'SE-R', 'UE', 'UN', 'CH', 'CB'];

// 5) AR 시스템 지원 포인트 및 폴백 매핑
export const AR_SUPPORTED_POINTS = ['TH', 'EB', 'SE-L', 'SE-R', 'UE', 'UN', 'CH', 'CB'] as const;

// 지원되지 않는 포인트만 매핑 (Partial로 불필요한 재매핑 제거)
export const AR_FALLBACK_MAP: Partial<Record<EFTCode, EFTCode>> = {
  SE: 'SE-L',     // SE → SE-L로 폴백
  // UA: 'CB',    // UA는 완전 제거되어 폴백 불필요
} as const;

// 6) 유틸리티 함수들
/**
 * 좌우 분리 코드를 통합 코드로 압축 (리포트/집계 시 유용)
 * @param code EFTCode
 * @returns 통합된 EFTCode
 */
export function collapseLR(code: EFTCode): EFTCode {
  return code === 'SE-L' || code === 'SE-R' ? 'SE' : code;
}

/**
 * AR 시스템에서 지원하지 않는 포인트를 지원 가능한 포인트로 변환
 * @param code 원본 EFTCode
 * @returns AR 지원 가능한 EFTCode (지원되는 건 그대로 통과)
 */
export function toARCompatible(code: EFTCode): EFTCode {
  return (AR_FALLBACK_MAP[code] ?? code) as EFTCode; // 지원되는 건 그대로 통과
}

// 7) 향후 확장 자리
// TODO: 손목(WR), 발목, 기타 추가 포인트 고려
// TODO: 감정별 추천 시퀀스 매핑 (anxiety: ['EB', 'UE', 'CH'], stress: ['TH', 'CB', 'UA'])