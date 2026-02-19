import React, { useMemo, useState } from "react";
import { Button } from "../ui/Button";

export type ConfidenceLevel = "low" | "med" | "high";

export type DriverSummary = {
  driver: string;
  score: number;
  confidence: ConfidenceLevel;
  evidence?: string[];
};

export type PatchSuggestion = {
  patch_type: "BUFFER_BLOCK" | "SPLIT_DEEP_WORK" | "DECISION_DELAY";
  reason: string;
  allowed: boolean;
  blocked_reason?: string | null;
  preview?: Record<string, unknown>;
};

export interface TodayConditionBannerProps {
  summary: {
    confidence: ConfidenceLevel;
    evidence_snapshot: string[];
    drivers_top2: DriverSummary[];
    drivers?: DriverSummary[];
    data_quality?: string;
  } | null;
  recommendedPatch?: PatchSuggestion | null;
  patchLoading?: boolean;
  patchError?: string | null;
  patchResultMessage?: string | null;
  medicalAttentionNotice?: string | null;
  fallbackConfidence?: ConfidenceLevel | null;
  onApplyPatch?: () => void;
  onEditInputs?: () => void;
}

const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  low: "낮음",
  med: "중간",
  high: "높음",
};

const DRIVER_LABEL: Record<string, string> = {
  MENSTRUAL_SYMPTOM_LOAD: "생리 관련 증상 부담",
  SLEEP_DEBT_LOAD: "수면 부족 신호",
  STRESS_LOAD: "스트레스 부담",
  POST_MEAL_DIP: "식후 에너지 저하",
};

function toDriverLabel(driver: string): string {
  return DRIVER_LABEL[driver] || driver;
}

function toDataQualityLabel(dataQuality?: string): string {
  if (!dataQuality) return "낮음";
  if (dataQuality === "self_report_med") return "자기보고(중간)";
  if (dataQuality === "self_report_low") return "자기보고(낮음)";
  return dataQuality;
}

const TodayConditionBanner: React.FC<TodayConditionBannerProps> = ({
  summary,
  recommendedPatch,
  patchLoading = false,
  patchError = null,
  patchResultMessage = null,
  medicalAttentionNotice = null,
  fallbackConfidence = null,
  onApplyPatch,
  onEditInputs,
}) => {
  const [whyOpen, setWhyOpen] = useState(false);

  const allDrivers = useMemo(() => {
    if (!summary) return [];
    return summary.drivers && summary.drivers.length > 0
      ? summary.drivers
      : summary.drivers_top2 || [];
  }, [summary]);

  const confidence = summary?.confidence ?? fallbackConfidence ?? "low";
  const evidence = (summary?.evidence_snapshot || []).slice(0, 2);

  if (!summary && !recommendedPatch && !medicalAttentionNotice) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold text-gray-800">오늘 컨디션 요약</div>
          <div className="text-xs text-gray-600 mt-1">
            주요 원인 Top-2 / 신뢰도:{" "}
            <span className="font-medium">{CONFIDENCE_LABEL[confidence]}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setWhyOpen((v) => !v)}
          className="text-xs px-2.5 py-1 rounded-md border border-gray-300 hover:bg-gray-50"
        >
          왜 이렇게 분석됐나요?
        </button>
      </div>

      {(summary?.drivers_top2 || []).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          {summary?.drivers_top2.map((d, idx) => (
            <div key={`${d.driver}-${idx}`} className="rounded-md border border-gray-200 bg-white px-3 py-2">
              <div className="font-semibold text-gray-800">{toDriverLabel(d.driver)}</div>
              <div className="text-gray-600">
                점수 {d.score}/100 · 신뢰도 {CONFIDENCE_LABEL[d.confidence]}
              </div>
            </div>
          ))}
        </div>
      )}

      {evidence.length > 0 && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 space-y-1">
          <div className="font-medium">근거 요약 (2줄)</div>
          {evidence.map((line, idx) => (
            <div key={idx}>- {line}</div>
          ))}
        </div>
      )}

      {recommendedPatch && (
        <div className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs space-y-2">
          <div className="font-semibold text-indigo-900">
            추천 일정 패치: {recommendedPatch.patch_type}
          </div>
          <div className="text-indigo-800">{recommendedPatch.reason}</div>
          {recommendedPatch.blocked_reason && (
            <div className="text-red-600">{recommendedPatch.blocked_reason}</div>
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onApplyPatch}
              disabled={patchLoading || !recommendedPatch.allowed || !onApplyPatch}
            >
              {patchLoading ? "적용 중..." : "패치 적용"}
            </Button>
            {patchResultMessage && <span className="text-emerald-700">{patchResultMessage}</span>}
            {patchError && <span className="text-red-600">{patchError}</span>}
          </div>
        </div>
      )}

      {medicalAttentionNotice && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 font-medium">
          {medicalAttentionNotice}
        </div>
      )}

      {whyOpen && (
        <div className="rounded-md border border-gray-200 bg-white px-3 py-3 space-y-2 text-xs">
          <div className="font-semibold text-gray-800">왜 이렇게 분석됐나요?</div>
          <div className="text-gray-600">
            데이터 품질: {toDataQualityLabel(summary?.data_quality)} · 신뢰도:{" "}
            {CONFIDENCE_LABEL[confidence]}
          </div>
          {allDrivers.map((d, idx) => (
            <div key={`${d.driver}-${idx}`} className="rounded border border-gray-100 px-2 py-1.5">
              <div className="font-medium text-gray-800">{toDriverLabel(d.driver)}</div>
              <div className="text-gray-600">
                점수 {d.score}/100 · 신뢰도 {CONFIDENCE_LABEL[d.confidence]}
              </div>
              {d.evidence && d.evidence.length > 0 && (
                <div className="text-gray-500">근거: {d.evidence.join(" | ")}</div>
              )}
            </div>
          ))}
          {onEditInputs && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onEditInputs}>
                입력 수정하기
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TodayConditionBanner;
