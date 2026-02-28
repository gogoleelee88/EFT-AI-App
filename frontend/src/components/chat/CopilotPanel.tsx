import { useEffect, useMemo, useState } from 'react';

import { analyzeCoach } from '@/api/coach';
import type { CoachAnalyzeResponse } from '@/types/coach';
import type { RoomDefaults, SendPolicy } from '@/types/chat';

interface CopilotPanelProps {
  roomId: string;
  defaults: RoomDefaults;
  draft: string;
  theirLastMessage: string | null;
  threadSummary: string | null;
  attachmentIds?: string[];
  onApplyReply: (text: string) => void;
}

const SEND_POLICY_LABEL: Record<SendPolicy, string> = {
  prefer_fast: '빠른 응답',
  prefer_calm: '신중한 응답',
  prefer_boundary: '경계 우선',
};

const ACTION_LABEL: Record<string, string> = {
  send_now: '즉시 전송',
  wait_and_send: '잠깐 후 전송',
  pause_thread: '잠시 대기',
  ask_clarifying: '추가 확인',
  switch_channel: '채널 전환',
};

const HYPOTHESIS_LABEL: Record<string, string> = {
  engagement_high: '강한 반응 가능',
  polite_distance: '공손한 거리 유지',
  testing_boundaries: '경계 반응 시험',
  comfort_building: '안정감 형성',
  low_investment: '관심 낮음 신호',
};

const buildFallbackCoachResponse = (
  draft: string,
  relationship: RoomDefaults['relationship'],
): CoachAnalyzeResponse => {
  const preview = draft.trim().slice(0, 80);
  const useFormalFallback = relationship === 'boss' || relationship === 'client' || relationship === 'stranger';
  const relationshipAwareReply = useFormalFallback
    ? '말씀 주신 내용 확인했습니다. 핵심 요청과 기한을 한 문장으로 정리해 전달하겠습니다.'
    : '메시지 확인했어. 핵심 요청과 기한을 한 문장으로 정리해 전달할게.';
  const fallback: CoachAnalyzeResponse = {
    action: {
      type: 'wait_and_send',
      recommended_time: 'in 5 minutes',
      rationale: ['현재 초안 안정성 확인을 위해 잠깐 정리한 추천입니다.'],
      execution_steps: ['요청 목적과 기한을 먼저 정리', '문장 단위를 짧게 정리', '감정적 표현은 최소화'],
      fallback_if_user_insists_send_now: {
        text: preview || '수정 후 바로 보내는 답변을 먼저 확인해보세요.',
        note: '급하면 먼저 초안 톤만 안전하게 정리해서 보내세요.',
      },
    },
    analysis: {
      politeness_score: 55,
      clarity_score: preview ? 55 : 40,
      boundary_strength: 50,
      risks: [],
      misread_points: ['요약 텍스트 기준으로 오해 가능성이 있을 수 있습니다.'],
    },
    simulations: [
      {
        reaction: 'ask_more',
        likelihood: 'med',
        why: '현재 문장이 다소 모호할 수 있어 확인 질문이 먼저 나올 수 있습니다.',
        confidence: 0.52,
      },
    ],
    replies: [
      {
        tone: 'neutral',
        text: preview || '내용을 먼저 요약해 간단히 확인 부탁드려도 될까요?',
        expected_outcome: '상대가 다음 응답으로 맥락을 이어가기 쉽습니다.',
        tradeoffs: ['속도는 다소 느릴 수 있습니다.', '상대가 즉시 반응하지 않을 수 있습니다.'],
        confidence: 0.5,
      },
    ],
    followups: [
      {
        if_reaction: 'ask_more',
        text: '기한, 범위, 우선순위 중 하나만 먼저 정확히 정리해보세요.',
      },
    ],
    romance_insights: {
      interest_hypotheses: [
        {
          label: 'comfort_building',
          likelihood: 'med',
          evidence_quotes: [preview || '메시지 본문 기반'],
          alternative_explanations: ['상대의 현재 컨텍스트 성향일 수 있음'],
          what_to_do: ['짧고 가벼운 확인 질문으로 이어가기'],
        },
      ],
      compatibility_notes: {
        my_strengths: ['요청을 구조화하려는 흐름이 좋습니다.'],
        my_risks: ['급하게 압박형 문장으로 읽힐 수 있습니다.'],
        watchouts: ['반응 속도 차이를 과도 해석하지 않기'],
      },
      safe_clarifying_questions: ['편한 템포로 진행해도 될까요?', '기한이 있는지 먼저 알려주실 수 있을까요?'],
    },
    evidence_items: [preview || '초안 기반 기본 추천'],
    confidence: 0.35,
  };
  if (fallback.replies.length > 0) {
    fallback.replies[0].text = relationshipAwareReply;
  }
  return fallback;
};

export default function CopilotPanel({
  roomId,
  defaults,
  draft,
  theirLastMessage,
  threadSummary,
  attachmentIds = [],
  onApplyReply,
}: CopilotPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CoachAnalyzeResponse | null>(null);
  const [policyOverride, setPolicyOverride] = useState<SendPolicy | null>(null);

  const activePolicy = policyOverride ?? defaults.default_send_policy;
  const defaultsKey = useMemo(
    () =>
      JSON.stringify({
        relationship: defaults.relationship,
        goal: defaults.goal,
        image_goal: defaults.image_goal,
        banned_tones: defaults.banned_tones,
        language: defaults.language,
        activePolicy,
      }),
    [defaults, activePolicy],
  );
  const attachmentsKey = useMemo(() => attachmentIds.join(','), [attachmentIds]);

  useEffect(() => {
    const trimmed = draft.trim();
    if (!roomId || !trimmed) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await analyzeCoach({
          room_id: roomId,
          context: {
            relationship: defaults.relationship,
            goal: defaults.goal,
            image_goal: defaults.image_goal,
            banned_tones: defaults.banned_tones,
            language: defaults.language,
            default_send_policy: activePolicy,
          },
          message: {
            their_last_message: theirLastMessage,
            my_draft: trimmed,
            thread_summary: threadSummary,
            attachment_ids: attachmentIds.length > 0 ? attachmentIds : undefined,
          },
        });
        if (!cancelled) {
          setData(response);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '코치 분석 요청에 실패했습니다.');
          setData(buildFallbackCoachResponse(trimmed, defaults.relationship));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [roomId, draft, theirLastMessage, threadSummary, defaultsKey, activePolicy, attachmentsKey, attachmentIds]);

  return (
    <section className="rounded-lg border bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-700">Social Copilot</div>
        <div className="text-[11px] text-gray-500">실시간 메시지 추천</div>
      </div>

      {attachmentIds.length > 0 && (
        <div className="mb-2 text-[11px] text-emerald-700">첨부 파일 반영: {attachmentIds.length}개</div>
      )}

      <div className="mb-3 flex flex-wrap gap-1">
        {(Object.keys(SEND_POLICY_LABEL) as SendPolicy[]).map((policy) => {
          const active = activePolicy === policy;
          return (
            <button
              key={policy}
              type="button"
              onClick={() => setPolicyOverride(policy)}
              className={`rounded-full px-2 py-1 text-[11px] ${
                active ? 'bg-blue-600 text-white' : 'border border-gray-300 text-gray-700'
              }`}
            >
              {SEND_POLICY_LABEL[policy]}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setPolicyOverride(null)}
          className="rounded-full border border-gray-300 px-2 py-1 text-[11px] text-gray-600"
        >
          기본값 사용
        </button>
      </div>

      {loading && <div className="text-sm text-gray-500">추천 생성 중...</div>}
      {!loading && error && (
        <div className="text-xs text-amber-700">AI 연결 실패로 임시 추천을 표시 중입니다: {error}</div>
      )}
      {!loading && !error && !data && (
        <div className="text-sm text-gray-500">입력 중인 메시지로 추천을 만들어요.</div>
      )}

      {!loading && data && (
        <div className="space-y-3">
          <div className="rounded-md border border-blue-200 bg-blue-50 p-2">
            <div className="text-xs font-semibold text-blue-800">
              추천 액션: {ACTION_LABEL[data.action.type] || data.action.type}
            </div>
            <div className="mt-1 text-xs text-blue-900">권장 시점: {data.action.recommended_time ?? '즉시'}</div>
            <ul className="mt-1 list-disc pl-4 text-xs text-blue-900">
              {data.action.rationale.map((item, index) => (
                <li key={`action-rationale-${index}`}>{item}</li>
              ))}
            </ul>
          </div>

          {data.evidence_items.length > 0 && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2">
              <div className="mb-1 text-xs font-semibold text-emerald-900">증거 근거 (최대 3)</div>
              <ul className="list-disc pl-4 text-xs text-emerald-900">
                {data.evidence_items.slice(0, 3).map((item, index) => (
                  <li key={`evidence-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-3 gap-1 text-xs">
            <div className="rounded border p-2">경쾌도 {data.analysis.politeness_score}</div>
            <div className="rounded border p-2">명료도 {data.analysis.clarity_score}</div>
            <div className="rounded border p-2">경계감 {data.analysis.boundary_strength}</div>
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold text-gray-700">리스크</div>
            {data.analysis.risks.length === 0 ? (
              <div className="text-xs text-gray-500">현재 특이한 고위험 리스크는 보이지 않습니다.</div>
            ) : (
              <ul className="space-y-1 text-xs">
                {data.analysis.risks.map((risk, index) => (
                  <li key={`risk-${index}`} className="rounded border p-2">
                    <span className="font-semibold">
                      {risk.type} ({risk.severity})
                    </span>{' '}
                    - {risk.note}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold text-gray-700">예상 반응</div>
            <ul className="space-y-1 text-xs">
              {data.simulations.map((item, index) => (
                <li key={`sim-${index}`} className="rounded border p-2">
                  <div className="font-semibold">
                    {item.reaction} ({item.likelihood}) / confidence {item.confidence}
                  </div>
                  <div className="mt-1 text-gray-700">{item.why}</div>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold text-gray-700">추천 답장</div>
            <ul className="space-y-1 text-xs">
              {data.replies.map((reply, index) => (
                <li key={`reply-${index}`} className="rounded border p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-semibold">{reply.tone}</span>
                    <button
                      type="button"
                      onClick={() => onApplyReply(reply.text)}
                      className="rounded border border-blue-500 px-2 py-1 text-[11px] text-blue-600"
                    >
                      적용
                    </button>
                  </div>
                  <div className="whitespace-pre-wrap">{reply.text}</div>
                  <div className="mt-1 text-gray-700">예상 효과: {reply.expected_outcome}</div>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold text-gray-700">추가 액션</div>
            <ul className="space-y-1 text-xs">
              {data.followups.map((followup, index) => (
                <li key={`followup-${index}`} className="rounded border p-2">
                  <span className="font-semibold">{followup.if_reaction}</span> - {followup.text}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold text-gray-700">Romance Signal Hypotheses</div>
            <ul className="space-y-1 text-xs">
              {data.romance_insights.interest_hypotheses.map((hypothesis, index) => (
                <li key={`hypothesis-${index}`} className="rounded border p-2">
                  <div className="font-semibold">
                    {HYPOTHESIS_LABEL[hypothesis.label] || hypothesis.label} ({hypothesis.likelihood})
                  </div>
                  <div className="mt-1 text-gray-700">근거: {hypothesis.evidence_quotes.join(' / ')}</div>
                  <div className="mt-1 text-gray-600">
                    대안해석: {hypothesis.alternative_explanations.join(' / ')}
                  </div>
                  <div className="mt-1 text-gray-600">
                    다음 행동: {hypothesis.what_to_do.join(' / ')}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded border p-2 text-xs">
            <div className="font-semibold text-gray-700">호환성 메모</div>
            <div className="mt-1">강점: {data.romance_insights.compatibility_notes.my_strengths.join(' / ')}</div>
            <div className="mt-1">
              리스크: {data.romance_insights.compatibility_notes.my_risks.join(' / ')}
            </div>
            <div className="mt-1">주의점: {data.romance_insights.compatibility_notes.watchouts.join(' / ')}</div>
          </div>

          <div className="rounded border p-2 text-xs">
            <div className="font-semibold text-gray-700">안전한 확인 질문</div>
            <ul className="mt-1 list-disc pl-4">
              {data.romance_insights.safe_clarifying_questions.map((question, index) => (
                <li key={`safe-question-${index}`}>{question}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
