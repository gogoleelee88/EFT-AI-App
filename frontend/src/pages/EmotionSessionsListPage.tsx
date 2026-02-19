import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/ui/Card';
import { useAuth } from '../hooks/useAuth';

export interface EmotionSessionSummary {
  id: number;
  created_at: string;
  core_emotion: string;
  situation_context: string;
  automatic_thought: string;
  physical_sensation?: string | null;
  coping_attempt?: string | null;
  immediate_goal?: string | null;
  intensity: number;
}

interface EmotionStats {
  total_records: number;
  emotion_distribution: Record<string, number>;
  average_intensity: number;
}

const EmotionSessionsListPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sessions, setSessions] = useState<EmotionSessionSummary[]>([]);
  const [stats, setStats] = useState<EmotionStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const recentParams = new URLSearchParams({ limit: '20' });
        const statsParams = new URLSearchParams();
        if (user?.uid) {
          recentParams.set('user_id', user.uid);
          statsParams.set('user_id', user.uid);
        }
        const [resRecent, resStats] = await Promise.all([
          fetch(`/api/emotion/recent?${recentParams.toString()}`, { credentials: 'include' }),
          fetch(`/api/emotion/stats?${statsParams.toString()}`, { credentials: 'include' }),
        ]);
        if (resRecent.ok) {
          const data: EmotionSessionSummary[] = await resRecent.json();
          setSessions(data);
        }
        if (resStats.ok) {
          const data: EmotionStats = await resStats.json();
          setStats(data);
        }
      } catch (e) {
        console.warn('감정 세션 목록 로드 실패:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.uid]);

  const formatDate = (raw: string) => {
    try {
      const d = new Date(raw);
      return d.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return raw;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50">
      {/* 헤더 */}
      <div className="bg-white shadow-sm border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-600"
            aria-label="뒤로가기"
          >
            ←
          </button>
          <h1 className="text-lg font-bold text-gray-800">감정 세션 기록</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-4 space-y-4 pb-8">
        {stats && stats.total_records > 0 && (
          <p className="text-sm text-gray-600">
            총 <span className="font-semibold">{stats.total_records}</span>건
            {typeof stats.average_intensity === 'number' && (
              <> · 평균 강도 <span className="font-semibold">{stats.average_intensity}</span>/10</>
            )}
          </p>
        )}

        {loading ? (
          <Card>
            <div className="py-8 text-center text-gray-500">불러오는 중...</div>
          </Card>
        ) : sessions.length === 0 ? (
          <Card>
            <div className="py-6 text-center text-gray-500 space-y-2">
              <p>아직 저장된 감정 세션이 없어요.</p>
              <p className="text-sm">감정 구조화를 시작해 보세요.</p>
              <button
                type="button"
                onClick={() => navigate('/eft-strict')}
                className="mt-3 text-indigo-600 font-medium text-sm"
              >
                감정 구조화 시작하기 →
              </button>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => navigate(`/emotion-sessions/${s.id}`)}
                className="w-full text-left"
              >
                <Card className="p-4 hover:bg-gray-50 transition-colors border border-gray-100">
                  <div className="text-xs text-gray-500 mb-1">
                    {formatDate(s.created_at)}
                  </div>
                  <div className="text-sm font-medium text-gray-800 mb-1">
                    {s.core_emotion} · 강도 {s.intensity}/10
                  </div>
                  <div className="text-sm text-gray-600 line-clamp-2">
                    {s.situation_context || '—'}
                  </div>
                </Card>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmotionSessionsListPage;
