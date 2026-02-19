import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { StrictIntakeInput } from '../types/serverAI';
import {
  THEME_LIBRARY,
  getRecommendedThemeId,
  type ThemeRecommendation,
  type SelectedTheme,
} from '../types/meditation';
import { recommendThemes } from '../services/guidanceService';

const BADGE_COLORS: Record<ThemeRecommendation['effect_badge'], string> = {
  안정: 'bg-emerald-100 text-emerald-700',
  거리두기: 'bg-sky-100 text-sky-700',
  에너지: 'bg-amber-100 text-amber-700',
  집중: 'bg-violet-100 text-violet-700',
  재진입: 'bg-indigo-100 text-indigo-700',
};

/** API 추천 순서 + 로컬 effect_badge 매핑 */
function mergeWithLocalLibrary(
  fromApi: { theme_id: string; title: string; estimated_min: number; summary: string }[]
): ThemeRecommendation[] {
  const byId = Object.fromEntries(THEME_LIBRARY.map((t) => [t.theme_id, t]));
  return fromApi.map((t) => {
    const local = byId[t.theme_id];
    return {
      ...t,
      effect_badge: local?.effect_badge ?? '안정',
    };
  });
}

/** 명상 테마 선택 페이지 (MoodTalk v2.0 - 1단계). 옵션 B: 추천 순서로 3종 노출. */
export default function MeditationThemePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as {
    strictIntake?: StrictIntakeInput;
    chatResponse?: unknown;
    planStartResistance?: string;
  } | undefined;

  const strictIntake = state?.strictIntake;
  const [recommendations, setRecommendations] = useState<ThemeRecommendation[] | null>(null);
  const [defaultThemeId, setDefaultThemeId] = useState<string>(() =>
    strictIntake
      ? getRecommendedThemeId(strictIntake.core_emotion, strictIntake.intensity)
      : THEME_LIBRARY[0].theme_id
  );
  const [loading, setLoading] = useState(!!strictIntake);

  useEffect(() => {
    if (!strictIntake) return;
    recommendThemes({ intake: strictIntake })
      .then((res) => {
        setRecommendations(mergeWithLocalLibrary(res.recommendations));
        setDefaultThemeId(res.default_theme_id);
      })
      .catch(() => {
        setRecommendations(null);
        setDefaultThemeId(
          getRecommendedThemeId(strictIntake.core_emotion, strictIntake.intensity)
        );
      })
      .finally(() => setLoading(false));
  }, [strictIntake]);

  const listToShow = useMemo(
    () => recommendations ?? THEME_LIBRARY,
    [recommendations]
  );

  const [selectedThemeId, setSelectedThemeId] = useState<string>(defaultThemeId);
  useEffect(() => {
    setSelectedThemeId(defaultThemeId);
  }, [defaultThemeId]);

  const selectedTheme = listToShow.find((t) => t.theme_id === selectedThemeId) ?? listToShow[0];

  const handleNext = () => {
    const selected: SelectedTheme = {
      selected_theme_id: selectedThemeId,
      selected_estimated_min: selectedTheme.estimated_min,
    };
    navigate('/meditation/session', {
      state: {
        strictIntake: state?.strictIntake,
        chatResponse: state?.chatResponse,
        planStartResistance: state?.planStartResistance,
        ...selected,
      },
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-8">
      <div className="mx-auto max-w-md">
        <h1 className="text-center text-xl font-bold text-gray-800">
          명상 테마 선택
        </h1>
        <p className="mt-2 text-center text-sm text-gray-500">
          상황에 맞는 테마를 골라주세요. 추천 테마가 먼저 선택되어 있어요.
        </p>
        {strictIntake && (
          <p className="mt-2 text-center text-xs text-gray-400">
            감정: {strictIntake.core_emotion} · 강도 {strictIntake.intensity}/10
          </p>
        )}

        {loading && (
          <p className="mt-2 text-center text-sm text-gray-500">
            당신에게 맞는 순서로 불러오는 중…
          </p>
        )}

        <div className="mt-6 space-y-3">
          {listToShow.map((theme, index) => {
            const isSelected = selectedThemeId === theme.theme_id;
            const isInRecommendedOrder = recommendations !== null && index < 3;
            return (
              <button
                key={theme.theme_id}
                type="button"
                onClick={() => setSelectedThemeId(theme.theme_id)}
                className={`w-full rounded-xl border-2 p-4 text-left transition ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-800">
                        {theme.title}
                      </span>
                      {isInRecommendedOrder && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                          추천
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      {theme.summary}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_COLORS[theme.effect_badge]}`}
                      >
                        {theme.effect_badge}
                      </span>
                      <span className="text-xs text-gray-400">
                        약 {theme.estimated_min}분
                      </span>
                    </div>
                  </div>
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-500 text-white'
                        : 'border-gray-300'
                    }`}
                  >
                    {isSelected ? '✓' : ''}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleNext}
            className="w-full rounded-xl bg-indigo-600 py-4 text-center font-medium text-white transition hover:bg-indigo-700"
          >
            다음 (약 {selectedTheme.estimated_min}분 명상)
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-full rounded-xl border border-gray-200 py-3 text-center text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            뒤로
          </button>
        </div>
      </div>
    </div>
  );
}
