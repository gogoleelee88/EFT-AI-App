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
  prefer_calm: '차분한 응답',
  prefer_boundary: '경계 설정',
};

const ACTION_LABEL: Record<string, string> = {
  send_now: '즉시 전송',
  wait_and_send: '정리 후 전송',
  pause_thread: '잠시 멈춤',
  ask_clarifying: '추가 확인',
  switch_channel: '채널 전환',
};

const buildFallbackCoachResponse = (
  draft: string,
  relationship: RoomDefaults['relationship'],
): CoachAnalyzeResponse => {
  const preview = draft.trim().slice(0, 80);
  const useFormalFallback = relationship === 'boss' || relationship === 'client' || relationship === 'stranger';
  const msg = useFormalFallback
    ? '메시지 확인했습니다. 전달할 내용을 기준으로 한 문장으로 정리해 다시 공유드리겠습니다.'
    : '메시지 확인했어. 전달할 내용을 짧게 정리해서 다시 공유할게.';

  return {
    messages: [{ label: '기본(재작성)', text: msg }],
    action: {
      type: 'wait_and_send',
      recommended_time: 'in 5 minutes',
      rationale: ['초안이 모호할 때는 짧게 정리한 뒤 보내는 편이 안전합니다.'],
      execution_steps: ['핵심 목적을 1문장으로 정리', '요청/기한을 분리', '중립 톤으로 전송'],
      fallback_if_user_insists_send_now: {
        text: preview || msg,
        note: '즉시 전송이 필요하면 중립 표현을 사용하고 단정적인 표현은 제거하세요.',
      },
    },
    analysis: {
      politeness_score: 55,
      clarity_score: preview ? 55 : 40,
      boundary_strength: 50,
      risks: [],
      misread_points: ['핵심 목적과 기한을 분리해 쓰면 오해 가능성을 줄일 수 있습니다.'],
    },
    simulations: [
      {
        reaction: 'ask_more',
        likelihood: 'med',
        why: '세부 범위/기한 확인 질문이 먼저 나올 수 있습니다.',
        confidence: 0.52,
      },
    ],
    replies: [
      {
        tone: 'neutral',
        text: msg,
        expected_outcome: '무난하게 대화가 이어질 가능성이 높습니다.',
        tradeoffs: ['감정 공감은 다소 약할 수 있습니다.'],
        confidence: 0.5,
      },
    ],
    followups: [
      {
        if_reaction: 'ask_more',
        text: '기한/범위/우선순위 중 어느 항목이 가장 중요한지 먼저 확인해볼까요?',
      },
    ],
    romance_insights: null,
    evidence_items: [preview || '초안 기반 기본 응답'],
    confidence: 0.35,
    internal: { notes: [], banned_sections_detected: [], rewrite_applied: true },
    policy: { rewrite_applied: true, banned_patterns_detected: [] },
  };
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
  const [showStrategy, setShowStrategy] = useState(false);

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
          기본값
        </button>

        <button
          type="button"
          onClick={() => setShowStrategy((v) => !v)}
          className="ml-auto rounded-full border border-gray-300 px-2 py-1 text-[11px] text-gray-700"
        >
          {showStrategy ? '전략 숨기기' : '전략 보기'}
        </button>
      </div>

      {loading && <div className="text-sm text-gray-500">추천 생성 중...</div>}
      {!loading && error && (
        <div className="text-xs text-amber-700">AI 연결 실패로 임시 추천을 표시 중입니다: {error}</div>
      )}
      {!loading && !error && !data && <div className="text-sm text-gray-500">입력 중인 메시지로 추천을 만듭니다.</div>}

      {!loading && data && (
        <div className="space-y-3">
          <div className="rounded-md border border-gray-200 bg-gray-50 p-2">
            <div className="mb-2 text-xs font-semibold text-gray-700">바로 보내기 추천</div>
            <ul className="space-y-2">
              {(data.messages || []).slice(0, 3).map((message, index) => (
                <li key={`msg-${index}`} className="rounded border bg-white p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700">{message.label}</span>
                    <button
                      type="button"
                      onClick={() => onApplyReply(message.text)}
                      className="rounded border border-blue-500 px-2 py-1 text-[11px] text-blue-600"
                    >
                      적용
                    </button>
                  </div>
                  <div className="whitespace-pre-wrap text-sm">{message.text}</div>
                </li>
              ))}
            </ul>
            {data.policy?.rewrite_applied && (
              <div className="mt-2 text-[11px] text-gray-500">
                메타/리포트 표현을 정리해 발송 가능한 문장만 남겼습니다.
              </div>
            )}
          </div>

          {showStrategy && (
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

              {data.evidence_items?.length > 0 && (
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
                <div className="rounded border p-2">공손성: {data.analysis.politeness_score}</div>
                <div className="rounded border p-2">명료성: {data.analysis.clarity_score}</div>
                <div className="rounded border p-2">경계 강도: {data.analysis.boundary_strength}</div>
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold text-gray-700">리스크</div>
                {data.analysis.risks.length === 0 ? (
                  <div className="text-xs text-gray-500">현재 고위험 리스크는 보이지 않습니다.</div>
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
                <div className="mb-1 text-xs font-semibold text-gray-700">원문 기반 리플라이(참고)</div>
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

              {data.romance_insights && (
                <div className="rounded border p-2 text-xs">
                  <div className="font-semibold text-gray-700">Romance Insights (옵션)</div>
                  <div className="mt-1 text-gray-600">
                    (관계가 romance_interest일 때만 생성됩니다)
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
