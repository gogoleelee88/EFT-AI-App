import React from 'react';
import type { EFTScript } from '../types/serverAI';

interface EFTScriptDisplayProps {
  script: EFTScript;
  onClose?: () => void;
  onStartSession?: () => void;
}

/**
 * EFT 스크립트 표시 컴포넌트
 *
 * 생성된 EFT 스크립트를 사용자에게 보기 좋게 표시합니다.
 */
export const EFTScriptDisplay: React.FC<EFTScriptDisplayProps> = ({
  script,
  onClose,
  onStartSession
}) => {
  // 강도에 따른 색상
  const getIntensityColor = (label: string): string => {
    switch (label) {
      case '약함': return '#4caf50'; // 녹색
      case '중간': return '#ff9800'; // 주황색
      case '강함': return '#f44336'; // 빨강색
      default: return '#757575';     // 회색
    }
  };

  return (
    <div className="eft-script-display">
      {/* 헤더 */}
      <div className="script-header">
        <h2>EFT 스크립트가 생성되었습니다</h2>
        {onClose && (
          <button onClick={onClose} className="close-btn" aria-label="닫기">
            ✕
          </button>
        )}
      </div>

      {/* 감정 상태 요약 */}
      <div className="script-summary">
        <h3>현재 감정 상태</h3>
        <div className="summary-badge">
          <span className="emotion-badge">{script.target_emotion}</span>
          <span
            className="intensity-badge"
            style={{ backgroundColor: getIntensityColor(script.intensity_label) }}
          >
            {script.intensity_label}
          </span>
        </div>
        <pre className="summary-text">{script.situation_summary}</pre>
      </div>

      {/* 권장 시간 */}
      <div className="script-duration">
        <span className="duration-icon">⏱️</span>
        <span className="duration-text">
          권장 시간: <strong>{script.recommended_duration}분</strong>
        </span>
      </div>

      {/* 셋업 구문 */}
      <div className="script-section setup-section">
        <h3>1️⃣ 셋업 구문 (Setup Phrase)</h3>
        <p className="instruction">
          옆구리(karate chop point)를 두드리며 다음 문장을 3번 반복하세요:
        </p>
        <div className="setup-phrase">
          <p>"{script.setup_phrase}"</p>
        </div>
      </div>

      {/* 포커스 단어 */}
      <div className="script-section focus-section">
        <h3>2️⃣ 포커스 단어 (Focus Words)</h3>
        <p className="instruction">
          EFT 탭핑 포인트를 두드리며 다음 단어들을 반복하세요:
        </p>
        <div className="focus-words">
          {script.focus_words.map((word, index) => (
            <span key={index} className="focus-word">
              {word}
            </span>
          ))}
        </div>
        <p className="focus-tip">
          💡 각 포인트에서 한 단어씩 두드리며 말합니다.
        </p>
      </div>

      {/* 액션 버튼 */}
      <div className="script-actions">
        {onStartSession && (
          <button onClick={onStartSession} className="btn-start-session">
            🎯 EFT 세션 시작하기
          </button>
        )}
        <button
          onClick={() => {
            const text = `
=== EFT 스크립트 ===

감정: ${script.target_emotion} (${script.intensity_label})
권장 시간: ${script.recommended_duration}분

[셋업 구문]
${script.setup_phrase}

[포커스 단어]
${script.focus_words.join(', ')}

[감정 상태 요약]
${script.situation_summary}
            `.trim();

            navigator.clipboard.writeText(text).then(() => {
              alert('스크립트가 클립보드에 복사되었습니다!');
            });
          }}
          className="btn-copy"
        >
          📋 복사하기
        </button>
      </div>
    </div>
  );
};
