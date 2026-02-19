import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { StrictIntakeInput } from '../types/serverAI';
import {
  getSessionPlanForTheme,
  SESSION_BLOCK_LABELS,
  THEME_LIBRARY,
  type SessionBlock,
  type SessionPlan,
} from '../types/meditation';
import { recommendYouTubeMeditations, type DurationBucket } from '../services/recommendService';
import { VoiceCloningRecorder } from '../components/settings/VoiceCloningRecorder';

/** 음성 프로필 옵션 (명세서 3절) */
const VOICE_OPTIONS = [
  { id: 'qwen3_female_calm', label: 'Calm Female (기본)', emoji: '🌸' },
  { id: 'qwen3_male_warm', label: 'Warm Male', emoji: '🌿' },
  { id: 'qwen3_neutral', label: 'Neutral AI', emoji: '🔊' },
] as const;

function formatDuration(seconds: number): string {
  if (seconds >= 60) return `${Math.round(seconds / 60)}분`;
  return `${seconds}초`;
}

function toDurationBucket(minutes: number): DurationBucket {
  if (minutes <= 5) return 5;
  if (minutes <= 10) return 10;
  if (minutes <= 20) return 20;
  return 30;
}

/** 명상 세션 페이지 (MoodTalk v2.0 - 2단계: 세션 설계 + 음성 선택 + 명상 시작) */
export default function MeditationSessionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as {
    strictIntake?: StrictIntakeInput;
    chatResponse?: unknown;
    selected_theme_id?: string;
    selected_estimated_min?: number;
    planStartResistance?: string;
  } | undefined;

  const themeId = state?.selected_theme_id ?? 'thought_labeling';
  const estimatedMin = state?.selected_estimated_min ?? 6;

  const basePlan = useMemo<SessionPlan>(
    () => getSessionPlanForTheme(themeId, estimatedMin),
    [themeId, estimatedMin]
  );

  const [sessionPlan, setSessionPlan] = useState<SessionPlan>(() => basePlan);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  const preferredBucket = useMemo<DurationBucket>(
    () => toDurationBucket(estimatedMin),
    [estimatedMin]
  );

  useEffect(() => {
    setSessionPlan({
      ...basePlan,
      recommended_videos: [],
      selected_video_id: undefined,
    });
  }, [basePlan]);

  useEffect(() => {
    const intake = state?.strictIntake;
    if (!intake) {
      setSessionPlan((prev) => ({ ...prev, recommended_videos: [] }));
      return;
    }
    let cancelled = false;
    setVideoLoading(true);
    setVideoError(null);
    recommendYouTubeMeditations({
      intake,
      selected_theme_id: themeId,
      preferred_duration_bucket: preferredBucket,
    })
      .then((res) => {
        if (cancelled) return;
        setSessionPlan((prev) => ({
          ...prev,
          recommended_videos: res.candidates ?? [],
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setVideoError('Failed to load recommendations');
        setSessionPlan((prev) => ({ ...prev, recommended_videos: [] }));
      })
      .finally(() => {
        if (!cancelled) setVideoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state?.strictIntake, themeId, preferredBucket]);

  const [voicePreference, setVoicePreference] = useState<string>(
    VOICE_OPTIONS[0].id
  );

  const themeTitle =
    THEME_LIBRARY.find((t) => t.theme_id === themeId)?.title ?? themeId;

  const toggleVideoSelection = (videoId: string) => {
    setSessionPlan((prev) => ({
      ...prev,
      selected_video_id: prev.selected_video_id === videoId ? undefined : videoId,
    }));
  };

  const handleStartMeditation = () => {
    const customVoiceId = typeof window !== 'undefined'
      ? window.localStorage.getItem('custom_voice_id')
      : null;
    navigate('/meditation/run', {
      state: {
        strictIntake: state?.strictIntake,
        chatResponse: state?.chatResponse,
        planStartResistance: state?.planStartResistance,
        selected_theme_id: themeId,
        selected_estimated_min: estimatedMin,
        session_plan: sessionPlan,
        voice_preference: voicePreference,
        voice_id: customVoiceId,
      },
    });
  };

  const totalMin = Math.round(sessionPlan.total_s / 60);

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-8">
      <div className="mx-auto max-w-md">
        <h1 className="text-center text-xl font-bold text-gray-800">
          명상 세션 설계
        </h1>
        <p className="mt-2 text-center text-sm text-gray-500">
          테마에 맞춘 블록 구성이에요. 음성을 고른 뒤 명상을 시작할 수 있어요.
        </p>
        {state?.strictIntake && (
          <p className="mt-2 text-center text-xs text-gray-400">
            감정: {state.strictIntake.core_emotion} · 강도 {state.strictIntake.intensity}/10
          </p>
        )}

        {/* 세션 플랜 표시 */}
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            <span className="font-medium text-gray-700">{themeTitle}</span>
            <span className="text-sm font-semibold text-indigo-600">
              총 약 {totalMin}분
            </span>
          </div>
          <ul className="mt-3 space-y-2">
            {sessionPlan.blocks.map((block: SessionBlock, i: number) => (
              <li
                key={`${block.type}-${i}`}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-gray-700">
                  {SESSION_BLOCK_LABELS[block.type]}
                </span>
                <span className="text-gray-500">
                  {formatDuration(block.duration_s)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* 음성 선택 */}
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">
            🎙️ 명상 가이드 목소리
          </h2>
          <div className="flex flex-col gap-2">
            {VOICE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setVoicePreference(opt.id)}
                className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition ${
                  voicePreference === opt.id
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 bg-white hover:border-indigo-200'
                }`}
              >
                <span className="text-lg">{opt.emoji}</span>
                <span className="font-medium text-gray-800">{opt.label}</span>
                {voicePreference === opt.id && (
                  <span className="ml-auto text-indigo-600">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 나만의 목소리 만들기 (보이스 클로닝 업로드) */}
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">추천 영상 선택</h2>
          <p className="text-xs text-gray-500">선택하지 않으면 기존 Qwen3 가이드만 실행됩니다.</p>
          {videoLoading && (
            <p className="mt-2 text-xs text-gray-400">추천 영상을 불러오는 중...</p>
          )}
          {videoError && (
            <p className="mt-2 text-xs text-red-500">{videoError}</p>
          )}
          {!videoLoading && !videoError && sessionPlan.recommended_videos.length === 0 && (
            <p className="mt-2 text-xs text-gray-400">추천 영상이 없습니다.</p>
          )}
          <div className="mt-3 flex flex-col gap-2">
            {sessionPlan.recommended_videos.map((video) => {
              const isSelected = sessionPlan.selected_video_id === video.video_id;
              return (
                <button
                  key={video.video_id}
                  type="button"
                  onClick={() => toggleVideoSelection(video.video_id)}
                  className={`flex w-full items-start gap-3 rounded-xl border-2 p-3 text-left transition ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 bg-white hover:border-indigo-200'
                  }`}
                >
                  <img
                    src={video.thumbnail_url}
                    alt=""
                    className="h-12 w-20 rounded object-cover"
                    loading="lazy"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-800">
                      {video.title}
                    </div>
                    <div className="text-xs text-gray-500">
                      {video.channel_title} · {Math.max(1, Math.round(video.duration_sec / 60))}분
                    </div>
                  </div>
                  <span
                    className={`ml-auto flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                      isSelected ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-gray-300'
                    }`}
                  >
                    {isSelected ? '✓' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6">
          <VoiceCloningRecorder />
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleStartMeditation}
            className="w-full rounded-xl bg-indigo-600 py-4 text-center font-medium text-white transition hover:bg-indigo-700"
          >
            명상 시작 (약 {totalMin}분)
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-full rounded-xl border border-gray-200 py-3 text-center text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            뒤로 (테마 다시 선택)
          </button>
        </div>
      </div>
    </div>
  );
}
