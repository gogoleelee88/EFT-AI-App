import React from "react";
import type { BehaviorLabel, ClarificationQuestionOut } from "../../types/behavior";

const LABELS: BehaviorLabel[] = ["work", "rest", "move", "exercise", "other"];

type Props = {
  question: ClarificationQuestionOut;
  onAnswer: (label: BehaviorLabel) => void;
  busy?: boolean;
};

const ClarificationCard: React.FC<Props> = ({ question, onAnswer, busy = false }) => {
  return (
    <section className="bg-gradient-to-br from-white to-purple-50 border border-purple-200 rounded-2xl p-5 space-y-4 shadow-sm">
      <div className="space-y-1">
        <p className="text-xs text-purple-700 font-semibold">잠깐, 마음 상태를 점검해요</p>
        <p className="text-gray-900 text-base leading-relaxed">
          {question.question_text}
        </p>
      </div>
      {question.trigger_reasons.length > 0 ? (
        <p className="text-xs text-purple-700/80 font-medium">
          힌트: {question.trigger_reasons.join(", ")}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {LABELS.map((label) => (
          <button
            key={label}
            type="button"
            disabled={busy}
            onClick={() => onAnswer(label)}
            className="px-3 py-2 text-sm rounded-full border border-purple-200 bg-purple-100/70 text-purple-900 hover:bg-purple-200/80 disabled:opacity-50 transition-colors"
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
};

export default ClarificationCard;
