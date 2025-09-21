/**
 * EFT 포인트 표준화 매핑 시스템
 * 자유 표기 → 표준 EFTCode 정규화
 */

import type { EFTCode } from '@/types/eftCodes';

/**
 * 모든 EFT 포인트 표기를 표준 코드로 변환하는 매핑 테이블
 */
const POINT_MAPPING: Record<string, EFTCode> = {
  // 정수리 (Top of Head)
  'crown': 'TH',
  '정수리': 'TH',
  'top_head': 'TH',
  'topofhead': 'TH',
  'TH': 'TH',

  // 눈썹 (Eyebrow)
  'eyebrow': 'EB',
  '눈썹': 'EB',
  '눈썹 앞': 'EB',
  'EB': 'EB',

  // 눈 옆 (Side of Eye)
  'side_of_eye': 'SE',
  'sideofeye': 'SE',
  '눈 옆': 'SE',
  '눈가': 'SE',
  'SE': 'SE',
  'SE-L': 'SE-L',
  'SE-R': 'SE-R',

  // 눈 아래 (Under Eye)
  'under_eye': 'UE',
  'undereye': 'UE',
  '눈 아래': 'UE',
  '눈 밑': 'UE',
  'UE': 'UE',

  // 코 아래 (Under Nose)
  'under_nose': 'UN',
  'undernose': 'UN',
  '코 아래': 'UN',
  '코 밑': 'UN',
  'UN': 'UN',

  // 턱 (Chin)
  'chin': 'CH',
  '턱': 'CH',
  '입술 아래': 'CH',
  'CH': 'CH',

  // 쇄골 (Collarbone)
  'collarbone': 'CB',
  '쇄골': 'CB',
  'CB': 'CB',

  // 겨드랑이 (Under Arm) - ARHolisticTest 미지원으로 제거
  // 'under_arm': 'UA',
  // 'underarm': 'UA',
  // '겨드랑이': 'UA',
  // 'wrist': 'UA',     // 손목을 UA로 매핑 (기존 호환성) - 제거
  // '손목': 'UA',
  // 'UA': 'UA',
};

/**
 * 단일 포인트 표기를 표준 EFTCode로 정규화
 * @param input 다양한 형태의 포인트 표기
 * @returns 표준 EFTCode (인식 불가 시 'EB' 기본값)
 */
export function normalizePoint(input: string | unknown): EFTCode {
  const key = String(input ?? '').trim();

  // 정확한 매핑 시도
  if (POINT_MAPPING[key]) {
    return POINT_MAPPING[key];
  }

  // 대소문자 무관 매핑 시도
  const lowerKey = key.toLowerCase();
  for (const [mapKey, code] of Object.entries(POINT_MAPPING)) {
    if (mapKey.toLowerCase() === lowerKey) {
      return code;
    }
  }

  // 기본값 방어 (가장 무난한 눈썹)
  console.warn(`Unknown EFT point: "${input}", defaulting to EB`);
  return 'EB';
}

/**
 * 포인트 배열을 표준 EFTCode 배열로 정규화 (중복 제거 포함)
 * @param inputs 다양한 형태의 포인트 표기 배열
 * @returns 중복 제거된 표준 EFTCode 배열
 */
export function normalizePoints(inputs: (string | unknown)[]): EFTCode[] {
  const codeSet = new Set<EFTCode>();

  for (const input of inputs) {
    const code = normalizePoint(input);
    codeSet.add(code);
  }

  return Array.from(codeSet);
}