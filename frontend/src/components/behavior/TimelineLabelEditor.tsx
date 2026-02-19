import React from "react";
import type { BehaviorLabel, TimelineSegmentOut } from "../../types/behavior";

const LABELS: BehaviorLabel[] = ["work", "rest", "move", "exercise", "other"];

type Props = {
  segment: TimelineSegmentOut;
  onPatch: (segmentId: number, label: BehaviorLabel) => void;
  busy?: boolean;
};

const TimelineLabelEditor: React.FC<Props> = ({ segment, onPatch, busy = false }) => {
  return (
    <li className="border rounded p-3 space-y-2">
      <div className="text-xs text-gray-500">
        {new Date(segment.ts_start).toLocaleString()} - {new Date(segment.ts_end).toLocaleTimeString()}
      </div>
      <div className="text-sm text-gray-700">
        inferred: {segment.inferred_label || "-"} / final: {segment.final_label || "-"}
      </div>
      <div className="flex flex-wrap gap-2">
        {LABELS.map((label) => (
          <button
            key={label}
            type="button"
            disabled={busy}
            onClick={() => onPatch(segment.segment_id, label)}
            className="px-2.5 py-1 text-xs rounded border bg-gray-50 hover:bg-gray-100 disabled:opacity-50"
          >
            set {label}
          </button>
        ))}
      </div>
    </li>
  );
};

export default TimelineLabelEditor;

