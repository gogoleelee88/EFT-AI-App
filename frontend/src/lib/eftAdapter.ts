/**
 * EFT 추천 → AR 파라미터 변환 어댑터
 * 자유표기 → 표준코드 정규화 → AR 호환성 처리
 */

import type { EFTRecommendation } from '@/types/serverAI';
import { normalizePoints } from '@/lib/eftPointMap';
import { AR_SUPPORTED_POINTS, AR_FALLBACK_MAP, type EFTCode } from '@/types/eftCodes';

/**
 * EFTCode 배열을 AR 시스템 호환 코드로 조정
 * @param codes 표준 EFTCode 배열
 * @returns AR에서 지원하는 EFTCode 배열
 */
function reconcileForAR(codes: EFTCode[]): EFTCode[] {
  const supported = new Set(AR_SUPPORTED_POINTS as readonly EFTCode[]);
  const out: EFTCode[] = [];

  for (const c of codes) {
    if (supported.has(c)) {
      // 지원되는 포인트는 그대로 추가
      out.push(c);
    } else {
      // 지원되지 않는 포인트는 폴백 시도
      const fallback = AR_FALLBACK_MAP[c];
      if (fallback && supported.has(fallback)) {
        out.push(fallback);
      }
      // 폴백도 없으면 무시 (빈 배열 방어는 아래에서 처리)
    }
  }

  // 중복 제거 후 반환
  return [...new Set(out)];
}

/**
 * EFT 추천 데이터를 AR 파라미터로 변환
 * @param rec EFT 추천 객체
 * @param extra 추가 파라미터
 * @returns AR URL 쿼리 파라미터
 */
export function recToARParams(rec: EFTRecommendation, extra?: Record<string, string>): URLSearchParams {
  // 1) 자유 표기 → 표준 코드 정규화
  const rawCodes = normalizePoints(rec.tapping_points as unknown as string[]);

  // 2) AR 호환성 처리 (UA → CB 폴백 등)
  const arCodes = reconcileForAR(rawCodes);

  // 3) 기본값 방어 (빈 배열 시 기본 시퀀스) - UA 제거
  const finalCodes = arCodes.length > 0 ? arCodes : ['TH', 'EB', 'SE-L', 'SE-R', 'UE', 'UN', 'CH', 'CB'] as EFTCode[];

  // 4) 분 → 초 변환 (최소 30초)
  const seconds = Math.max(30, Math.round(rec.duration_minutes * 60));

  // 5) URL 파라미터 생성
  const params = new URLSearchParams({
    emotion: rec.emotion ?? 'stress',
    int: String(Math.max(0, Math.min(100, rec.intensity ?? 60))),
    points: finalCodes.join(','),
    dur: String(seconds),
    note: rec.additional_notes ?? '',
    tech: rec.technique_name,
    from: 'chat',
    ...(extra ?? {}),
  });

  return params;
}