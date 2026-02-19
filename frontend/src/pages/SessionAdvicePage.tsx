import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { StrictIntakeInput } from '../types/serverAI';

type SessionType = 'eftar' | 'meditation';

interface AdviceRequest {
  session_type: SessionType;
  strict_intake: StrictIntakeInput;
  intensity_before: number;
  intensity_after: number;
  selected_theme_id?: string;
  selected_video_title?: string;
}

interface AdviceResponse {
  advice: string;
  delta: number;
  source: string;
  model: string;
}

interface AdviceLocationState {
  sessionType?: SessionType;
  strictIntake?: StrictIntakeInput;
  intensityBefore?: number;
  intensityAfter?: number;
  selectedThemeId?: string;
  selectedVideoTitle?: string;
}

const FALLBACK_ADVICE =
  '지금은 강도를 안정적으로 낮추는 것이 우선입니다. 2분 동안 천천히 호흡한 뒤, 오늘 도움 된 포인트를 한 문장으로 적어 두세요.';

export default function SessionAdvicePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as AdviceLocationState | undefined) ?? {};

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AdviceResponse | null>(null);

  const sessionType: SessionType = state.sessionType ?? 'eftar';
  const strictIntake = state.strictIntake;
  const intensityBefore =
    typeof state.intensityBefore === 'number' ? Math.max(0, Math.min(10, state.intensityBefore)) : null;
  const intensityAfter =
    typeof state.intensityAfter === 'number' ? Math.max(0, Math.min(10, state.intensityAfter)) : null;

  useEffect(() => {
    const run = async () => {
      if (!strictIntake || intensityBefore == null || intensityAfter == null) {
        setError('세션 정보가 없어 AI 조언을 불러올 수 없습니다.');
        setLoading(false);
        return;
      }

      const payload: AdviceRequest = {
        session_type: sessionType,
        strict_intake: strictIntake,
        intensity_before: intensityBefore,
        intensity_after: intensityAfter,
        selected_theme_id: state.selectedThemeId,
        selected_video_title: state.selectedVideoTitle,
      };

      try {
        const res = await fetch('/api/emotion/session-advice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json || typeof json.advice !== 'string') {
          throw new Error(`session advice failed: ${res.status}`);
        }
        setResult({
          advice: json.advice,
          delta: typeof json.delta === 'number' ? json.delta : intensityBefore - intensityAfter,
          source: typeof json.source === 'string' ? json.source : 'unknown',
          model: typeof json.model === 'string' ? json.model : 'unknown',
        });
      } catch {
        setResult({
          advice: FALLBACK_ADVICE,
          delta: intensityBefore - intensityAfter,
          source: 'fallback',
          model: 'rule_based',
        });
        setError('AI 응답을 불러오지 못해 기본 조언을 표시합니다.');
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [intensityAfter, intensityBefore, sessionType, state.selectedThemeId, state.selectedVideoTitle, strictIntake]);

  const deltaLabel = useMemo(() => {
    if (intensityBefore == null || intensityAfter == null) return '-';
    const delta = intensityBefore - intensityAfter;
    if (delta > 0) return `-${delta}`;
    if (delta < 0) return `+${Math.abs(delta)}`;
    return '0';
  }, [intensityAfter, intensityBefore]);

  const modeLabel = sessionType === 'eftar' ? 'EFT' : '명상';

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">세션 결과 & AI 조언</h1>
        <p className="mt-2 text-sm text-slate-600">{modeLabel} 세션이 종료되었습니다.</p>

        <div className="mt-5 grid grid-cols-3 gap-3 text-center text-sm">
          <div className="rounded-xl bg-slate-100 p-3">
            <div className="text-xs text-slate-500">Before</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">{intensityBefore ?? '-'}</div>
          </div>
          <div className="rounded-xl bg-slate-100 p-3">
            <div className="text-xs text-slate-500">After</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">{intensityAfter ?? '-'}</div>
          </div>
          <div className="rounded-xl bg-slate-100 p-3">
            <div className="text-xs text-slate-500">Delta</div>
            <div className="mt-1 text-xl font-semibold text-indigo-700">{deltaLabel}</div>
          </div>
        </div>

        {loading && (
          <div className="mt-6 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-700">
            AI 조언을 생성하는 중입니다...
          </div>
        )}

        {!loading && (
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-800">
              {result?.advice ?? FALLBACK_ADVICE}
            </p>
            <p className="mt-3 text-xs text-slate-500">
              source: {result?.source ?? 'unknown'} | model: {result?.model ?? 'unknown'}
            </p>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => navigate('/dashboard', { replace: true })}
            className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            대시보드로 이동
          </button>
          <button
            type="button"
            onClick={() => navigate('/eft-strict')}
            className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            새 세션 시작
          </button>
        </div>
      </div>
    </div>
  );
}
