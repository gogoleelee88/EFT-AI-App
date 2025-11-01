/**
 * Session Summary Component
 * Display meditation session results with insights
 */

import React from "react";
import type { SessionSummary } from "../../services/meditation/sessionStore";

interface SessionSummaryProps {
  summary: SessionSummary;
  onClose?: () => void;
  onViewHistory?: () => void;
}

export const SessionSummaryCard: React.FC<SessionSummaryProps> = ({
  summary,
  onClose,
  onViewHistory,
}) => {
  const formatDuration = (sec: number): string => {
    const minutes = Math.floor(sec / 60);
    const seconds = sec % 60;
    return `${minutes}분 ${seconds}초`;
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString("ko-KR", {
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getQualityLabel = (score: number): string => {
    if (score >= 90) return "탁월";
    if (score >= 75) return "우수";
    if (score >= 60) return "좋음";
    if (score >= 40) return "보통";
    return "개선 필요";
  };

  const getQualityColor = (score: number): string => {
    if (score >= 90) return "text-green-500";
    if (score >= 75) return "text-blue-500";
    if (score >= 60) return "text-yellow-500";
    if (score >= 40) return "text-orange-500";
    return "text-red-500";
  };

  // Count coaching events by level
  const redEvents = summary.coachingEvents.filter((e) => e.level === "RED").length;
  const yellowEvents = summary.coachingEvents.filter((e) => e.level === "YELLOW").length;
  const greenEvents = summary.coachingEvents.filter((e) => e.level === "GREEN").length;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6 rounded-t-3xl">
          <div className="text-center">
            <div className="text-5xl mb-2">🧘</div>
            <h2 className="text-2xl font-bold">명상 세션 완료</h2>
            <p className="text-sm text-purple-100 mt-1">{formatDate(summary.startTime)}</p>
          </div>
        </div>

        {/* Quality Score */}
        <div className="p-6 text-center border-b border-gray-200">
          <div className="text-6xl font-bold mb-2">
            <span className={getQualityColor(summary.qualityScore)}>
              {summary.qualityScore}
            </span>
            <span className="text-2xl text-gray-400">/100</span>
          </div>
          <div className="text-xl font-semibold text-gray-700">
            {getQualityLabel(summary.qualityScore)}
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="p-6 grid grid-cols-2 gap-4">
          {/* Duration */}
          <div className="bg-white rounded-2xl p-4 shadow">
            <div className="text-sm text-gray-500 mb-1">세션 시간</div>
            <div className="text-2xl font-bold text-blue-600">
              {formatDuration(summary.durationSec)}
            </div>
          </div>

          {/* Breath Rate */}
          <div className="bg-white rounded-2xl p-4 shadow">
            <div className="text-sm text-gray-500 mb-1">평균 호흡</div>
            <div className="text-2xl font-bold text-green-600">
              {summary.avgBreathRate.toFixed(1)} /분
            </div>
          </div>

          {/* Tension */}
          <div className="bg-white rounded-2xl p-4 shadow">
            <div className="text-sm text-gray-500 mb-1">평균 긴장도</div>
            <div className="text-2xl font-bold text-orange-600">
              {Math.round(summary.avgTension * 100)}%
            </div>
          </div>

          {/* Heart Rate (if available) */}
          {summary.avgHeartRate && (
            <div className="bg-white rounded-2xl p-4 shadow">
              <div className="text-sm text-gray-500 mb-1">평균 심박수</div>
              <div className="text-2xl font-bold text-red-600">
                {Math.round(summary.avgHeartRate)} BPM
              </div>
            </div>
          )}
        </div>

        {/* Coaching Events */}
        {summary.coachingEvents.length > 0 && (
          <div className="p-6 border-t border-gray-200">
            <h3 className="text-lg font-bold text-gray-700 mb-3">코칭 피드백</h3>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-red-100 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-red-600">{redEvents}</div>
                <div className="text-xs text-red-700">긴급</div>
              </div>
              <div className="bg-yellow-100 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-yellow-600">{yellowEvents}</div>
                <div className="text-xs text-yellow-700">주의</div>
              </div>
              <div className="bg-green-100 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-green-600">{greenEvents}</div>
                <div className="text-xs text-green-700">양호</div>
              </div>
            </div>
          </div>
        )}

        {/* Insights */}
        <div className="p-6 border-t border-gray-200">
          <h3 className="text-lg font-bold text-gray-700 mb-3">💡 인사이트</h3>
          <div className="space-y-2 text-sm text-gray-600">
            {summary.qualityScore >= 80 && (
              <p>✨ 훌륭한 세션이었습니다! 집중력이 뛰어났어요.</p>
            )}
            {summary.avgTension < 0.3 && (
              <p>😌 긴장도가 낮아 깊은 이완 상태에 도달했습니다.</p>
            )}
            {summary.avgBreathRate >= 6 && summary.avgBreathRate <= 10 && (
              <p>🌬️ 이상적인 호흡 속도를 유지했습니다.</p>
            )}
            {summary.avgBreathRate < 6 && (
              <p>💨 호흡이 느렸습니다. 다음엔 조금 더 자연스럽게 호흡해보세요.</p>
            )}
            {summary.avgTension > 0.7 && (
              <p>😣 긴장도가 높았습니다. 시작 전 스트레칭을 해보세요.</p>
            )}
            {summary.durationSec < 300 && (
              <p>⏱️ 더 긴 세션을 시도해보세요. 5분 이상이 효과적입니다.</p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-6 border-t border-gray-200 flex gap-3">
          {onViewHistory && (
            <button
              onClick={onViewHistory}
              className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold transition"
            >
              📊 히스토리 보기
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-bold transition"
            >
              닫기
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SessionSummaryCard;
