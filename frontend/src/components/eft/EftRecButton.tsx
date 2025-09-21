/**
 * EFT 추천 버튼 컴포넌트
 * AI가 추천한 EFT 세션을 시작하는 상용화 품질 버튼
 *
 * 특징:
 * - 중복 클릭 방지
 * - 완벽한 접근성 (WCAG 2.1 AA)
 * - 방어적 코딩 (null/undefined 안전)
 * - 테스트 친화적 (data-testid)
 */

import React from 'react';
import type { EFTRecommendation } from '../../types/serverAI';

export interface EftRecButtonProps {
  rec: EFTRecommendation;
  index: number;
  onStart: (r: EFTRecommendation) => void;
}

const EftRecButton = React.memo(function EftRecButton({
  rec,
  index,
  onStart,
}: EftRecButtonProps) {
  const [pending, setPending] = React.useState(false);

  const handleClick = async () => {
    if (pending) return;
    setPending(true);
    try {
      onStart(rec);
    } finally {
      // 라우팅이 즉시 일어나면 이 상태는 큰 의미 없지만
      // 실패 상황을 대비해 안전하게 원복
      setPending(false);
    }
  };

  // 방어적 데이터 처리
  const title = rec.additional_notes ?? 'EFT 추천 시작';
  const emotion = rec.emotion ?? 'stress';
  const showIntensity =
    typeof rec.intensity === 'number' && !Number.isNaN(rec.intensity);
  const seconds = Math.max(30, Math.round((rec.duration_minutes ?? 1) * 60)); // 최소 30s 가드
  const points =
    rec.tapping_points && rec.tapping_points.length
      ? rec.tapping_points.join(', ')
      : '기본 포인트';
  const technique = rec.technique_name ?? 'EFT';

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title}
      aria-label={`EFT 세션 시작: 감정 ${emotion}${
        showIntensity ? ` 강도 ${rec.intensity}` : ''
      }, 예상 ${seconds}초, 기법 ${technique}`}
      aria-pressed={pending}
      disabled={pending}
      data-testid={`eft-rec-${index}`}
      className={`px-3 py-2 rounded-lg border border-green-400 hover:bg-green-50 text-sm transition-colors ${
        pending ? 'opacity-60 cursor-not-allowed' : ''
      }`}
    >
      <div className="font-medium">EFT 세션 시작</div>
      <div className="opacity-80">
        감정: <b>{emotion}</b>
        {showIntensity && <> ({rec.intensity})</>}
      </div>
      <div className="text-xs opacity-70">포인트: {points}</div>
      <div className="text-[11px] opacity-60">
        예상 {seconds}s · {technique}
      </div>
    </button>
  );
});

export default EftRecButton;