import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import Card from '../components/ui/Card';
import { useAuth } from '../hooks/useAuth';
import { COMMON_INSIGHTS, PERSONAL_INSIGHTS } from '../data/insights';

// API에서 올 프로파일 타입 (백엔드 연동 시 사용)
interface UserProfileSummary {
  user_id: string;
  dominant_moods?: string[];
  preferred_tone?: string;
  top_concerns?: string[];
  blockers?: string[];
  updated_at?: string;
}

interface DailyProfileSummary {
  date: string;
  focus_minutes?: number;
  idle_minutes?: number;
  stuck_minutes?: number;
  mood_avg?: number;
  activities?: string[];
}

interface EmotionPatternCard {
  title: string;
  detail: string;
  confidence: number;
}

interface EmotionInsightsPayload {
  total_records: number;
  dominant_emotions: string[];
  average_intensity: number;
  trend: 'improving' | 'stable' | 'worsening' | 'mixed' | string;
  insight_summary: string;
  pattern_cards: EmotionPatternCard[];
  recommended_actions: string[];
  generated_at: string;
  source: string;
  model: string;
}

const InsightsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.uid ?? '';

  const [profile, setProfile] = useState<UserProfileSummary | null>(null);
  const [dailyProfile, setDailyProfile] = useState<DailyProfileSummary | null>(null);
  const [emotionInsights, setEmotionInsights] = useState<EmotionInsightsPayload | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [dailyLoading, setDailyLoading] = useState(true);
  const [insightLoading, setInsightLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setProfileLoading(false);
      setDailyLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/profile/me', { credentials: 'include' });
        if (res.ok) {
          const data: UserProfileSummary = await res.json();
          setProfile(data);
        }
      } catch {
        // 비로그인 또는 백엔드 미응답 시 무시
      } finally {
        setProfileLoading(false);
      }
    })();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const today = new Date().toISOString().slice(0, 10);
    (async () => {
      try {
        const res = await fetch(`/api/profile/me/daily?date=${today}`, { credentials: 'include' });
        if (res.ok) {
          const data: DailyProfileSummary = await res.json();
          setDailyProfile(data);
        }
      } catch {
        // 비로그인 또는 백엔드 미응답 시 무시
      } finally {
        setDailyLoading(false);
      }
    })();
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setInsightLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/emotion/insights?limit=40', { credentials: 'include' });
        if (res.ok) {
          const data: EmotionInsightsPayload = await res.json();
          setEmotionInsights(data);
        }
      } catch {
        // fallback UI
      } finally {
        setInsightLoading(false);
      }
    })();
  }, [userId]);

  const handleViewInsight = (id: string | number) => {
    navigate(`/insights/${encodeURIComponent(String(id))}`);
  };

  const completedCommon = COMMON_INSIGHTS.filter((i) => i.progress === 100);
  const inProgressCommon = COMMON_INSIGHTS.filter((i) => i.progress > 0 && i.progress < 100);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50">
      {/* 헤더 */}
      <div className="bg-white shadow border-b border-indigo-100 sticky top-0 z-40">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            aria-label="대시보드로"
          >
            ←
          </button>
          <h1 className="text-lg font-bold text-gray-800">🔮 나의 통찰</h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-4 space-y-4 pb-8">
        {/* 나의 프로파일 (API 연동) */}
        <Card>
          <div className="space-y-2">
            <div className="font-bold text-gray-800">👤 나의 프로파일</div>
            {profileLoading ? (
              <div className="text-sm text-gray-500">불러오는 중…</div>
            ) : profile && (profile.dominant_moods?.length || profile.top_concerns?.length || profile.preferred_tone) ? (
              <div className="text-sm text-gray-700 space-y-1">
                {profile.dominant_moods?.length ? (
                  <div>주요 감정: {profile.dominant_moods.slice(0, 5).join(', ')}</div>
                ) : null}
                {profile.preferred_tone && <div>선호 톤: {profile.preferred_tone}</div>}
                {profile.top_concerns?.length ? (
                  <div>자주 등장한 고민: {profile.top_concerns.slice(0, 3).join(', ')}</div>
                ) : null}
                {profile.blockers?.length ? (
                  <div className="text-amber-700">방해 요소: {profile.blockers.slice(0, 3).join(', ')}</div>
                ) : null}
              </div>
            ) : (
              <div className="text-sm text-gray-500">
                AI 대화와 감정 기록을 더 쌓으면 나만의 프로파일이 채워져요.
              </div>
            )}
          </div>
        </Card>

        {/* 오늘의 요약 (API 연동) */}
        <Card>
          <div className="space-y-2">
            <div className="font-bold text-gray-800">📅 오늘의 요약</div>
            {dailyLoading ? (
              <div className="text-sm text-gray-500">불러오는 중…</div>
            ) : dailyProfile && (dailyProfile.focus_minutes != null || dailyProfile.activities?.length) ? (
              <div className="text-sm text-gray-700 space-y-1">
                {dailyProfile.focus_minutes != null && (
                  <div>집중 시간: 약 {dailyProfile.focus_minutes}분</div>
                )}
                {dailyProfile.activities?.length ? (
                  <div>인식된 활동: {dailyProfile.activities.slice(0, 5).join(', ')}</div>
                ) : null}
              </div>
            ) : (
              <div className="text-sm text-gray-500">
                오늘의 활동 요약은 데스크톱 연동 시 표시됩니다.
              </div>
            )}
          </div>
        </Card>

        {/* 공통 통찰 해제 현황 */}
        <Card>
          <div className="space-y-4">
            <div className="font-bold text-gray-800">🔮 통찰 해제 현황 ({completedCommon.length}/32)</div>
            <div>
              <div className="text-sm font-medium text-gray-600 mb-2">해제완료</div>
              <div className="grid gap-2">
                {completedCommon.map((insight) => (
                  <div
                    key={insight.id}
                    role="button"
                    tabIndex={0}
                    className="flex items-center gap-2 p-2 bg-green-50 rounded-lg cursor-pointer hover:bg-green-100 transition-colors"
                    onClick={() => handleViewInsight(insight.id)}
                    onKeyDown={(e) => e.key === 'Enter' && handleViewInsight(insight.id)}
                  >
                    <span className="text-green-600">✨</span>
                    <span className="text-sm text-green-800 flex-1">{insight.title}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-600 mb-2">진행중</div>
              <div className="grid gap-2">
                {inProgressCommon.map((insight) => (
                  <div
                    key={insight.id}
                    role="button"
                    tabIndex={0}
                    className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => handleViewInsight(insight.id)}
                    onKeyDown={(e) => e.key === 'Enter' && handleViewInsight(insight.id)}
                  >
                    <span className="text-gray-400">🔒</span>
                    <div className="flex-1">
                      <div className="text-sm text-gray-700">{insight.title}</div>
                      <div className="text-xs text-gray-500">{insight.progress}% 완료</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* 개인 맞춤 통찰 */}
        <Card className="bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200">
          <div className="space-y-3">
            <div className="font-bold text-gray-800">
              🌟 개인 맞춤 통찰 ({emotionInsights?.pattern_cards?.length ?? PERSONAL_INSIGHTS.length}개)
            </div>

            {insightLoading ? (
              <div className="text-sm text-gray-500">불러오는 중...</div>
            ) : emotionInsights ? (
              <>
                <div className="text-xs text-purple-700 bg-white/80 border border-purple-100 rounded-lg px-3 py-2">
                  {emotionInsights.insight_summary}
                </div>

                <div className="space-y-2">
                  {emotionInsights.pattern_cards.map((insight, idx) => (
                    <div
                      key={`${insight.title}-${idx}`}
                      className="flex items-start gap-2 p-3 bg-white rounded-lg border border-purple-100"
                    >
                      <span className="text-purple-600">💎</span>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-800">{insight.title}</div>
                        <div className="text-xs text-gray-600 mt-1">{insight.detail}</div>
                        <div className="text-xs text-purple-600 mt-1">
                          신뢰도 {Math.round((insight.confidence || 0) * 100)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {emotionInsights.recommended_actions?.length ? (
                  <div className="rounded-lg border border-indigo-100 bg-white p-3">
                    <div className="text-xs font-semibold text-indigo-700 mb-2">실행 제안</div>
                    <div className="space-y-1.5">
                      {emotionInsights.recommended_actions.slice(0, 3).map((action, idx) => (
                        <div key={`${action}-${idx}`} className="text-xs text-gray-700">
                          {idx + 1}. {action}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="space-y-2">
                {PERSONAL_INSIGHTS.map((insight) => (
                  <div
                    key={insight.id}
                    role="button"
                    tabIndex={0}
                    className="flex items-center gap-2 p-3 bg-white rounded-lg cursor-pointer hover:shadow-md transition-all border border-purple-100"
                    onClick={() => handleViewInsight(insight.id)}
                    onKeyDown={(e) => e.key === 'Enter' && handleViewInsight(insight.id)}
                  >
                    <span className="text-purple-600">💎</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-800">{insight.title}</div>
                      <div className="text-xs text-purple-600">신뢰도 {insight.confidence}%</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Button variant="outline" fullWidth onClick={() => navigate('/dashboard')}>
          대시보드로 돌아가기
        </Button>
      </div>
    </div>
  );
};

export default InsightsPage;
