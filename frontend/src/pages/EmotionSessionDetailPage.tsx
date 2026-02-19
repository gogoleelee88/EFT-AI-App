import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Card from '../components/ui/Card';
import type { EmotionSessionSummary } from './EmotionSessionsListPage';
import { useAuth } from '../hooks/useAuth';

const EmotionSessionDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [session, setSession] = useState<EmotionSessionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const params = new URLSearchParams();
        if (user?.uid) {
          params.set('user_id', user.uid);
        }
        const suffix = params.toString() ? `?${params.toString()}` : '';
        const res = await fetch(`/api/emotion/session/${id}${suffix}`, {
          credentials: 'include',
        });
        if (!res.ok) {
          if (res.status === 404) setError('세션을 찾을 수 없어요.');
          else setError('불러오기에 실패했어요.');
          return;
        }
        const data: EmotionSessionSummary = await res.json();
        setSession(data);
      } catch (e) {
        console.warn('세션 상세 로드 실패:', e);
        setError('불러오기에 실패했어요.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, user?.uid]);

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
          <h1 className="text-lg font-bold text-gray-800">세션 상세</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-4 space-y-4 pb-8">
        {loading ? (
          <Card>
            <div className="py-8 text-center text-gray-500">불러오는 중...</div>
          </Card>
        ) : error ? (
          <Card>
            <div className="py-6 text-center text-gray-500 space-y-2">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => navigate('/emotion-sessions')}
                className="text-indigo-600 font-medium text-sm"
              >
                목록으로
              </button>
            </div>
          </Card>
        ) : session ? (
          <div className="space-y-4">
            <Card className="p-4">
              <div className="text-xs text-gray-500 mb-3">기록 일시</div>
              <div className="text-sm font-medium text-gray-800">
                {formatDate(session.created_at)}
              </div>
            </Card>

            <Card className="p-4">
              <div className="text-xs text-gray-500 mb-1">핵심 감정</div>
              <div className="text-lg font-semibold text-gray-800">{session.core_emotion}</div>
              <div className="text-xs text-gray-500 mt-2">강도 (당시)</div>
              <div className="text-sm font-medium text-gray-800">{session.intensity} / 10</div>
            </Card>

            <Card className="p-4">
              <div className="text-xs text-gray-500 mb-2">상황 맥락</div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap">
                {session.situation_context || '—'}
              </div>
            </Card>

            <Card className="p-4">
              <div className="text-xs text-gray-500 mb-2">자동적 사고</div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap">
                {session.automatic_thought || '—'}
              </div>
            </Card>

            {session.physical_sensation != null && session.physical_sensation !== '' && (
              <Card className="p-4">
                <div className="text-xs text-gray-500 mb-2">신체 감각</div>
                <div className="text-sm text-gray-800 whitespace-pre-wrap">
                  {session.physical_sensation}
                </div>
              </Card>
            )}

            {session.coping_attempt != null && session.coping_attempt !== '' && (
              <Card className="p-4">
                <div className="text-xs text-gray-500 mb-2">대처 시도</div>
                <div className="text-sm text-gray-800 whitespace-pre-wrap">
                  {session.coping_attempt}
                </div>
              </Card>
            )}

            {session.immediate_goal != null && session.immediate_goal !== '' && (
              <Card className="p-4">
                <div className="text-xs text-gray-500 mb-2">당장의 목표</div>
                <div className="text-sm text-gray-800 whitespace-pre-wrap">
                  {session.immediate_goal}
                </div>
              </Card>
            )}

            <button
              type="button"
              onClick={() => navigate('/emotion-sessions')}
              className="w-full py-3 text-center text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100"
            >
              목록으로
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default EmotionSessionDetailPage;
