import { useState } from 'react';
import type { EFTPoint, Side } from '../types';

interface GuideBoxProps {
  currentPoint: EFTPoint | null;
  currentSide: Side | null;
  tip: string | null;
  stepNumber: number;
  totalSteps: number;
  timeLeft: number;
  isVisible?: boolean;
  onClose?: () => void;
}

// EFT 포인트별 가이드 텍스트
const POINT_GUIDES: Record<EFTPoint, { 
  title: string; 
  description: string; 
  instruction: string;
  icon: string;
}> = {
  brow: {
    title: '눈썹 시작점',
    description: '눈썹 안쪽 끝 부분을 부드럽게 터치합니다',
    instruction: '검지나 중지로 가볍게 두드리거나 원을 그리며 마사지하세요',
    icon: '👁️'
  },
  side_eye: {
    title: '눈 옆 (관자놀이)',
    description: '눈 바깥쪽 끝에서 귀 방향으로 약간 이동한 지점입니다',
    instruction: '양손으로 동시에 부드럽게 원을 그리며 마사지하세요',
    icon: '👀'
  },
  under_eye: {
    title: '눈 밑',
    description: '눈 바로 아래 뼈가 시작되는 부분을 터치합니다',
    instruction: '너무 강하지 않게 가볍게 두드려주세요',
    icon: '👁️'
  },
  under_nose: {
    title: '코 밑 (인중)',
    description: '코와 입술 사이의 움푹한 부분을 터치합니다',
    instruction: '검지로 상하로 부드럽게 문지르거나 가볍게 누르세요',
    icon: '👃'
  },
  chin: {
    title: '턱 (아래턱)',
    description: '아래턱 중앙 부분, 턱 끝 바로 아래를 터치합니다',
    instruction: '엄지나 검지로 원을 그리며 부드럽게 마사지하세요',
    icon: '🎯'
  },
  clavicle: {
    title: '쇄골 중앙',
    description: '목 아래 쇄골뼈 중앙 부분을 터치합니다',
    instruction: '검지와 중지로 좌우로 부드럽게 문지르세요',
    icon: '💎'
  },
  under_arm: {
    title: '겨드랑이 아래',
    description: '팔을 살짝 들고 겨드랑이 아래 갈비뼈 부분을 터치합니다',
    instruction: '반대편 손으로 가볍게 두드리거나 원을 그려주세요',
    icon: '🤲'
  },
  top_head: {
    title: '정수리',
    description: '머리 꼭대기 중앙 부분을 터치합니다',
    instruction: '손바닥이나 손가락으로 부드럽게 원을 그리며 마사지하세요',
    icon: '👆'
  }
};

export default function GuideBox({ 
  currentPoint, 
  currentSide, 
  tip, 
  stepNumber, 
  totalSteps, 
  timeLeft,
  isVisible = true,
  onClose 
}: GuideBoxProps) {
  const [isMinimized, setIsMinimized] = useState(false);

  if (!isVisible || !currentPoint) return null;

  const guide = POINT_GUIDES[currentPoint];
  const sideText = currentSide === 'center' ? '중앙' : 
                   currentSide === 'left' ? '왼쪽' : '오른쪽';

  if (isMinimized) {
    return (
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={() => setIsMinimized(false)}
          className="bg-blue-600 text-white p-3 rounded-full shadow-lg hover:bg-blue-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed top-4 right-4 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{guide.icon}</span>
            <div>
              <h3 className="font-semibold text-lg">{guide.title}</h3>
              <p className="text-blue-100 text-sm">{sideText} • {stepNumber}/{totalSteps}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1 hover:bg-white/20 rounded transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1 hover:bg-white/20 rounded transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 타이머 바 */}
      <div className="bg-gray-100 h-2">
        <div 
          className="bg-blue-500 h-full transition-all duration-1000 ease-linear"
          style={{ width: `${Math.max(0, (timeLeft / 10) * 100)}%` }}
        />
      </div>

      {/* 콘텐츠 */}
      <div className="p-4 space-y-4">
        {/* 카운트다운 */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-gray-100 px-4 py-2 rounded-full">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-mono text-lg font-bold text-gray-700">
              {timeLeft}초 남음
            </span>
          </div>
        </div>

        {/* 위치 설명 */}
        <div className="bg-blue-50 p-3 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-1">위치 찾기</h4>
          <p className="text-blue-700 text-sm">{guide.description}</p>
        </div>

        {/* 실행 방법 */}
        <div className="bg-green-50 p-3 rounded-lg">
          <h4 className="font-medium text-green-900 mb-1">실행 방법</h4>
          <p className="text-green-700 text-sm">{guide.instruction}</p>
        </div>

        {/* 개인화된 팁 */}
        {tip && (
          <div className="bg-purple-50 p-3 rounded-lg">
            <h4 className="font-medium text-purple-900 mb-1">🧘‍♀️ 마음챙김 팁</h4>
            <p className="text-purple-700 text-sm italic">"{tip}"</p>
          </div>
        )}

        {/* 호흡 가이드 */}
        <div className="bg-gray-50 p-3 rounded-lg">
          <h4 className="font-medium text-gray-900 mb-2">호흡과 함께 🫁</h4>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="flex-1">
              <div className="flex items-center gap-1 mb-1">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                <span>깊게 들이마시기</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" style={{animationDelay: '2s'}}></div>
                <span>천천히 내쉬기</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 하단 상태바 */}
      <div className="bg-gray-100 px-4 py-2 flex items-center justify-between text-xs text-gray-500">
        <span>EFT 자가 치료 세션</span>
        <span className="flex items-center gap-1">
          <div className="w-2 h-2 bg-green-400 rounded-full"></div>
          진행 중
        </span>
      </div>
    </div>
  );
}