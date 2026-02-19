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
    <section className="bg-white border rounded-lg p-4 space-y-3">
      <div className="text-sm text-gray-500">확인 필요</div>
      <p className="text-gray-900">{question.question_text}</p>
      <div className="flex flex-wrap gap-2">
        {LABELS.map((label) => (
          <button
            key={label}
            type="button"
            disabled={busy}
            onClick={() => onAnswer(label)}
            className="px-3 py-1.5 text-sm rounded border bg-gray-50 hover:bg-gray-100 disabled:opacity-50"
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
};

export default ClarificationCard;

