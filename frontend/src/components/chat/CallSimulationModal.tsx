import { useEffect, useMemo, useState } from 'react';

import { nextDecisionMirrorCallTurn } from '@/api/decisionMirror';
import type {
  DecisionMirrorCallReport,
  DecisionMirrorProfile,
  DecisionMirrorTranscriptTurn,
  Difficulty,
} from '@/types/decisionMirror';

interface CallSimulationModalProps {
  open: boolean;
  profile: DecisionMirrorProfile | null;
  callGoal: string;
  myKeyPoints: string;
  initialScore: number | null;
  onClose: () => void;
  onApplyRevisedMessage: (text: string) => void;
}

export default function CallSimulationModal({
  open,
  profile,
  callGoal,
  myKeyPoints,
  initialScore,
  onClose,
  onApplyRevisedMessage,
}: CallSimulationModalProps) {
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [transcript, setTranscript] = useState<DecisionMirrorTranscriptTurn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<DecisionMirrorCallReport | null>(null);
  const [animatedScore, setAnimatedScore] = useState<number>(initialScore ?? 0);

  const scoreBefore = useMemo(() => initialScore ?? Math.max((report?.revised_score ?? 60) - 8, 0), [initialScore, report]);

  useEffect(() => {
    if (!open || !profile) return;
    let cancelled = false;
    const start = async () => {
      setTranscript([]);
      setReport(null);
      setError(null);
      setInput('');
      setLoading(true);
      try {
        const response = await nextDecisionMirrorCallTurn({
          profile,
          call_goal: callGoal,
          my_key_points: myKeyPoints,
          difficulty,
          transcript: [],
        });
        if (cancelled) return;
        if (response.next_turn?.text) {
          setTranscript([{ speaker: 'them', text: response.next_turn.text }]);
        }
        if (response.done && response.report) {
          setReport(response.report);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '리허설 시작 실패');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    start();
    return () => {
      cancelled = true;
    };
  }, [open, profile, callGoal, myKeyPoints, difficulty]);

  useEffect(() => {
    if (!report) return;
    const target = report.revised_score;
    const from = scoreBefore;
    setAnimatedScore(from);
    const steps = 18;
    const delta = (target - from) / steps;
    let count = 0;
    const timer = window.setInterval(() => {
      count += 1;
      if (count >= steps) {
        setAnimatedScore(target);
        window.clearInterval(timer);
        return;
      }
      setAnimatedScore(Math.round(from + delta * count));
    }, 40);
    return () => window.clearInterval(timer);
  }, [report, scoreBefore]);

  const handleSend = async () => {
    if (!profile || !input.trim() || loading || report) return;
    const meTurn: DecisionMirrorTranscriptTurn = { speaker: 'me', text: input.trim() };
    const nextTranscript = [...transcript, meTurn];
    setTranscript(nextTranscript);
    setInput('');
    setLoading(true);
    setError(null);
    try {
      const response = await nextDecisionMirrorCallTurn({
        profile,
        call_goal: callGoal,
        my_key_points: myKeyPoints,
        difficulty,
        transcript: nextTranscript,
      });
      if (response.next_turn?.text) {
        setTranscript((prev) => [...prev, { speaker: 'them', text: response.next_turn!.text }]);
      }
      if (response.done && response.report) {
        setReport(response.report);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '리허설 진행 실패');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">전화 리허설 (Decision Mirror)</h3>
            <p className="text-[11px] text-gray-500">{callGoal}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600"
          >
            닫기
          </button>
        </div>

        <div className="border-b px-4 py-2">
          <div className="flex gap-2">
            {(['easy', 'normal', 'hard'] as Difficulty[]).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setDifficulty(level)}
                className={`rounded-full px-2 py-1 text-[11px] ${
                  difficulty === level ? 'bg-blue-600 text-white' : 'border border-gray-300 text-gray-700'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-3">
          <div className="space-y-2">
            {transcript.map((turn, idx) => (
              <div
                key={`${turn.speaker}-${idx}`}
                className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
                  turn.speaker === 'me'
                    ? 'ml-auto bg-blue-600 text-white'
                    : 'mr-auto border border-gray-200 bg-white text-gray-800'
                }`}
              >
                {turn.text}
              </div>
            ))}
          </div>

          {loading && <div className="mt-3 text-xs text-gray-500">시뮬레이터 응답 생성 중...</div>}
          {error && <div className="mt-3 text-xs text-red-600">{error}</div>}

          {report && (
            <div className="mt-4 space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs">
              <div className="font-semibold text-emerald-900">코칭 리포트</div>
              <div className="flex items-center gap-2">
                <div className="rounded bg-white px-2 py-1 text-gray-700">전 점수 {scoreBefore}</div>
                <div className="text-gray-500">→</div>
                <div className="rounded bg-emerald-600 px-2 py-1 font-semibold text-white transition-all duration-500">
                  후 점수 {animatedScore}
                </div>
              </div>
              <div>통화 성공 점수: {report.call_success_score}</div>
              <div>
                <div className="font-semibold text-gray-700">주요 리스크</div>
                <ul className="mt-1 list-disc pl-4">
                  {report.top_risks.map((item, idx) => (
                    <li key={`risk-${idx}`}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="font-semibold text-gray-700">파워 라인</div>
                <ul className="mt-1 list-disc pl-4">
                  {report.power_lines.map((item, idx) => (
                    <li key={`power-${idx}`}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="font-semibold text-gray-700">반드시 확인할 질문</div>
                <ul className="mt-1 list-disc pl-4">
                  {report.must_ask.map((item, idx) => (
                    <li key={`must-${idx}`}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded border bg-white p-2">
                <div className="mb-1 font-semibold text-gray-700">수정 메시지</div>
                <div className="whitespace-pre-wrap text-gray-800">{report.revised_message}</div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-700"
                    onClick={() => navigator.clipboard.writeText(report.revised_message)}
                  >
                    복사
                  </button>
                  <button
                    type="button"
                    className="rounded border border-blue-500 px-2 py-1 text-[11px] text-blue-700"
                    onClick={() => onApplyRevisedMessage(report.revised_message)}
                  >
                    초안에 적용
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {!report && (
          <div className="border-t px-4 py-3">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="내 답변 입력"
                className="flex-1 rounded border border-gray-300 px-3 py-2 text-xs"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!input.trim() || loading}
                className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:bg-gray-400"
              >
                전송
              </button>
            </div>
          </div>
        )}

        <div className="border-t bg-gray-100 px-4 py-2 text-[11px] text-gray-600">
          본 결과는 과거 커뮤니케이션 패턴 기반 점수이며 실제 의사결정과 다를 수 있습니다.
        </div>
      </div>
    </div>
  );
}
