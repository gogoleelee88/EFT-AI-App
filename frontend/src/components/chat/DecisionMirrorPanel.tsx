import { ChangeEvent, useEffect, useMemo, useState } from 'react';

import {
  createDecisionMirrorMessages,
  createDecisionMirrorProfile,
  scoreDecisionMirrorMessage,
} from '@/api/decisionMirror';
import CallSimulationModal from '@/components/chat/CallSimulationModal';
import type {
  DecisionMirrorContext,
  DecisionMirrorMessagesResponse,
  DecisionMirrorProfileResponse,
  DecisionMirrorScoreResponse,
} from '@/types/decisionMirror';

interface QuestionAttachment {
  name: string;
  text: string;
}

interface DecisionMirrorPanelProps {
  roomId: string;
  initialContext: DecisionMirrorContext;
  cloneName?: string;
  onApplyMessage: (text: string) => void;
}

function ProfileMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-gray-700">
        <span>{label}</span>
        <span>{value}/10</span>
      </div>
      <div className="mt-1 h-1.5 rounded bg-gray-200">
        <div className="h-1.5 rounded bg-sky-500" style={{ width: `${Math.max(0, Math.min(100, value * 10))}%` }} />
      </div>
    </div>
  );
}

export default function DecisionMirrorPanel({ roomId, initialContext, cloneName = '클론', onApplyMessage }: DecisionMirrorPanelProps) {
  const [context, setContext] = useState<DecisionMirrorContext>(initialContext);
  const [questionAttachmentsText, setQuestionAttachmentsText] = useState('');
  const [questionAttachments, setQuestionAttachments] = useState<QuestionAttachment[]>([]);
  const [goal, setGoal] = useState('상대가 검토 후 오늘 안에 다음 액션을 확정하도록 유도');
  const [constraints, setConstraints] = useState('');
  const [profileRes, setProfileRes] = useState<DecisionMirrorProfileResponse | null>(null);
  const [messagesRes, setMessagesRes] = useState<DecisionMirrorMessagesResponse | null>(null);
  const [scoresById, setScoresById] = useState<Record<string, DecisionMirrorScoreResponse>>({});
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingScoreId, setLoadingScoreId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [callTarget, setCallTarget] = useState<{ message: string; score: number | null } | null>(null);

  const contextKey = useMemo(
    () => `${roomId}:${initialContext.email_thread_text.length}:${initialContext.chat_log_text.length}:${initialContext.attachments_text?.length ?? 0}`,
    [roomId, initialContext],
  );

  useEffect(() => {
    setContext(initialContext);
    setProfileRes(null);
    setMessagesRes(null);
    setScoresById({});
    setError(null);
    setQuestionAttachmentsText('');
    setQuestionAttachments([]);
  }, [contextKey, initialContext]);

  const readTextFile = async (file: File): Promise<string> =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : '';
        resolve((text || '').slice(0, 12_000).trim());
      };
      reader.onerror = () => resolve('');
      reader.readAsText(file);
    });

  const handleQuestionAttachmentsChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const selectedFiles = Array.from(input.files || []);
    if (!selectedFiles.length) return;

    try {
      const uploaded = await Promise.all(
        selectedFiles.map(async (file): Promise<QuestionAttachment | null> => {
          const text = (await readTextFile(file)).trim();
          if (!text) return null;
          return {
            name: file.name,
            text: `[시뮬레이터 질문 첨부자료] ${file.name}\n${text}`,
          };
        }),
      );
      const next = uploaded.filter((item): item is QuestionAttachment => Boolean(item));
      if (next.length === 0) {
        setError('선택한 파일에서 텍스트를 추출하지 못했습니다. 텍스트 형식 파일을 업로드해 주세요.');
        return;
      }

      setQuestionAttachments((prev) => [...prev, ...next]);
      setQuestionAttachmentsText((prev) =>
        [prev.trim(), ...next.map((item) => item.text.trim())].filter(Boolean).join('\n\n'),
      );
      setError(null);
    } finally {
      input.value = '';
    }
  };

  const removeQuestionAttachment = (index: number) => {
    setQuestionAttachments((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      setQuestionAttachmentsText(next.map((item) => item.text.trim()).join('\n\n'));
      return next;
    });
  };

  const ensureProfile = async (): Promise<DecisionMirrorProfileResponse | null> => {
    if (profileRes) return profileRes;
    setLoadingProfile(true);
    setError(null);
    try {
      const response = await createDecisionMirrorProfile(context);
      setProfileRes(response);
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : '프로파일 생성 실패');
      return null;
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleCreateProfile = async () => {
    await ensureProfile();
  };

  const handleCreateMessages = async () => {
    if (!goal.trim()) {
      setError('목표를 입력해 주세요.');
      return;
    }
    setLoadingMessages(true);
    setError(null);
    try {
      const response = await createDecisionMirrorMessages({
        context,
        goal: goal.trim(),
        constraints: constraints.trim() || undefined,
        question_attachments_text: questionAttachmentsText.trim() || undefined,
      });
      setMessagesRes(response);
      setScoresById({});
      if (!profileRes) {
        await ensureProfile();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '메시지 생성 실패');
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleScore = async (id: string, message: string) => {
    const profile = await ensureProfile();
    if (!profile) return;
    setLoadingScoreId(id);
    setError(null);
    try {
      const score = await scoreDecisionMirrorMessage({
        profile: profile.profile,
        message,
        goal: goal.trim() || '의사결정 유도',
        constraints: constraints.trim() || undefined,
      });
      setScoresById((prev) => ({ ...prev, [id]: score }));
    } catch (err) {
      setError(err instanceof Error ? err.message : '점수 계산 실패');
    } finally {
      setLoadingScoreId(null);
    }
  };

  return (
    <section className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-cyan-900">
            {cloneName}
          </h2>
          <p className="text-[11px] text-cyan-800">채팅/이메일/첨부 맥락 기반으로 메시지 설득력을 점검합니다.</p>
        </div>
      </div>

      <div className="grid gap-2 lg:grid-cols-3">
        <div>
          <label className="text-[11px] text-gray-700">이메일 맥락</label>
          <textarea
            rows={5}
            value={context.email_thread_text}
            onChange={(event) => setContext((prev) => ({ ...prev, email_thread_text: event.target.value }))}
            className="mt-1 w-full rounded border border-gray-300 p-2 text-xs"
          />
        </div>
        <div>
          <label className="text-[11px] text-gray-700">채팅 맥락</label>
          <textarea
            rows={5}
            value={context.chat_log_text}
            onChange={(event) => setContext((prev) => ({ ...prev, chat_log_text: event.target.value }))}
            className="mt-1 w-full rounded border border-gray-300 p-2 text-xs"
          />
        </div>
        <div>
          <label className="text-[11px] text-gray-700">첨부 맥락(옵션)</label>
          <textarea
            rows={5}
            value={context.attachments_text || ''}
            onChange={(event) => setContext((prev) => ({ ...prev, attachments_text: event.target.value }))}
            className="mt-1 w-full rounded border border-gray-300 p-2 text-xs"
          />
        </div>
      </div>

      <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2">
        <label className="text-[11px] font-semibold text-gray-700">시뮬레이터 질문용 첨부 파일 (클론에게 물어볼 자료)</label>
        <input
          type="file"
          multiple
          onChange={(event) => void handleQuestionAttachmentsChange(event)}
          className="mt-1 block w-full text-xs"
        />
        {questionAttachments.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {questionAttachments.map((file, idx) => (
              <button
                type="button"
                key={`${file.name}-${idx}`}
                onClick={() => removeQuestionAttachment(idx)}
                title={`${file.name} 제거`}
                className="rounded-full bg-white px-2 py-1 text-[10px] text-gray-700 border border-amber-300"
              >
                {file.name} (클릭 삭제)
              </button>
            ))}
          </div>
        )}
        <textarea
          rows={5}
          value={questionAttachmentsText}
          onChange={(event) => setQuestionAttachmentsText(event.target.value)}
          className="mt-2 w-full rounded border border-amber-300 bg-white p-2 text-xs"
          placeholder="첨부 파일 본문 요약/복붙 텍스트를 직접 넣어도 됩니다."
        />
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-[1fr,1fr,auto,auto]">
        <input
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder="목표 입력"
          className="rounded border border-gray-300 px-3 py-2 text-xs"
        />
        <input
          value={constraints}
          onChange={(event) => setConstraints(event.target.value)}
          placeholder="제약사항(옵션)"
          className="rounded border border-gray-300 px-3 py-2 text-xs"
        />
        <button
          type="button"
          onClick={() => void handleCreateProfile()}
          disabled={loadingProfile}
          className="rounded border border-cyan-600 px-3 py-2 text-xs font-semibold text-cyan-700 disabled:border-gray-300 disabled:text-gray-400"
        >
          {loadingProfile ? '생성 중...' : '상대 프로파일 만들기'}
        </button>
        <button
          type="button"
          onClick={() => void handleCreateMessages()}
          disabled={loadingMessages}
          className="rounded bg-cyan-700 px-3 py-2 text-xs font-semibold text-white disabled:bg-gray-400"
        >
          {loadingMessages ? '생성 중...' : '메시지 3개 생성'}
        </button>
      </div>

      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}

      {profileRes && (
        <div className="mt-3 rounded-lg border border-cyan-300 bg-white p-3">
          <div className="text-xs font-semibold text-gray-900">의사결정 프로파일</div>
          <div className="mt-1 text-xs text-gray-700">
            스타일: {profileRes.profile.decision_style} / 톤: {profileRes.profile.tone_style}
          </div>
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            <ProfileMetric label="리스크 회피" value={profileRes.profile.risk_aversion} />
            <ProfileMetric label="승인 속도" value={profileRes.profile.approval_speed} />
            <ProfileMetric label="가격 민감도" value={profileRes.profile.price_sensitivity} />
            <ProfileMetric label="반박 강도" value={profileRes.profile.pushback_intensity} />
          </div>
          <div className="mt-2 grid gap-2 lg:grid-cols-3">
            <div>
              <div className="text-[11px] font-semibold text-gray-700">자주 나오는 이견</div>
              <ul className="mt-1 list-disc pl-4 text-[11px] text-gray-700">
                {profileRes.profile.common_objections.map((item, idx) => (
                  <li key={`obj-${idx}`}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-gray-700">승인 트리거</div>
              <ul className="mt-1 list-disc pl-4 text-[11px] text-gray-700">
                {profileRes.profile.approval_triggers.map((item, idx) => (
                  <li key={`tri-${idx}`}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-gray-700">거절 패턴</div>
              <ul className="mt-1 list-disc pl-4 text-[11px] text-gray-700">
                {profileRes.profile.rejection_patterns.map((item, idx) => (
                  <li key={`rej-${idx}`}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          {profileRes.evidence.quotes.length > 0 && (
            <div className="mt-2">
              <div className="text-[11px] font-semibold text-gray-700">근거 발췌</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {profileRes.evidence.quotes.map((q, idx) => (
                  <span key={`q-${idx}`} className="rounded-full bg-cyan-100 px-2 py-1 text-[11px] text-cyan-900">
                    {q}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {messagesRes && (
        <div className="mt-3 grid gap-2 lg:grid-cols-3">
          {messagesRes.suggestions.map((item) => {
            const score = scoresById[item.id];
            return (
              <article key={item.id} className="rounded-lg border bg-white p-3">
                <div className="mb-1 text-xs font-semibold text-gray-900">
                  {item.id}. {item.title}
                </div>
                <div className="max-h-48 overflow-y-auto whitespace-pre-wrap text-xs text-gray-800">{item.message}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => onApplyMessage(item.message)}
                    className="rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-700"
                  >
                    초안 적용
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleScore(item.id, item.message)}
                    disabled={loadingScoreId === item.id}
                    className="rounded border border-cyan-500 px-2 py-1 text-[11px] text-cyan-700"
                  >
                    {loadingScoreId === item.id ? '계산 중...' : '점수 보기'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCallTarget({ message: item.message, score: score?.score ?? null })}
                    disabled={!profileRes}
                    className="rounded border border-blue-500 px-2 py-1 text-[11px] text-blue-700 disabled:border-gray-300 disabled:text-gray-400"
                  >
                    전화로 연습하기
                  </button>
                </div>

                {score && (
                  <div className="mt-2 rounded border border-cyan-200 bg-cyan-50 p-2 text-[11px]">
                    <div className="font-semibold text-cyan-900">컴펌 가능성 점수: {score.score}/100</div>
                    <div className="mt-1 text-gray-700">
                      <div className="font-semibold">점수 이유</div>
                      <ul className="list-disc pl-4">
                        {score.reasons.map((v, idx) => (
                          <li key={`reason-${item.id}-${idx}`}>{v}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="mt-1 text-gray-700">
                      <div className="font-semibold">리스크 포인트</div>
                      <ul className="list-disc pl-4">
                        {score.risk_points.map((v, idx) => (
                          <li key={`risk-${item.id}-${idx}`}>{v}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="mt-1 text-gray-700">
                      <div className="font-semibold">개선 지시</div>
                      <ul className="list-disc pl-4">
                        {score.improve_edits.map((v, idx) => (
                          <li key={`edit-${item.id}-${idx}`}>{v}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <div className="mt-3 rounded border border-cyan-200 bg-white px-3 py-2 text-[11px] text-gray-600">
        본 결과는 과거 커뮤니케이션 패턴 기반 점수이며 실제 의사결정과 다를 수 있습니다.
      </div>

      <CallSimulationModal
        open={!!callTarget && !!profileRes}
        profile={profileRes?.profile ?? null}
        callGoal={goal}
        myKeyPoints={callTarget?.message || goal}
        initialScore={callTarget?.score ?? null}
        onClose={() => setCallTarget(null)}
        onApplyRevisedMessage={(text) => {
          onApplyMessage(text);
          setCallTarget(null);
        }}
      />
    </section>
  );
}
