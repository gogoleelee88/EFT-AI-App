import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useEFTScript } from "../contexts/EFTScriptContext";
import { SlideIntake } from "../components/eft/SlideIntake";
import type { StrictIntakeInput, ChatResponse } from "../types/serverAI";

type PostIntakeChoice = {
  strictIntake: StrictIntakeInput;
  chatResponse: ChatResponse;
};

const DEFAULT_TEST_INTAKE: StrictIntakeInput = {
  core_emotion: "불안",
  situation_context: "업무 스트레스로 인해 긴장감이 계속되고 있어요",
  automatic_thought: "나는 실수할까 봐 계속 불안해요",
  physical_sensation: "어깨와 목이 뭉치고 숨이 답답해요",
  behavioral_reaction: "말을 아끼고 회피적으로 반응하게 돼요",
  intensity: 6,
  available_time: 10,
  immediate_goal: "긴장 완화",
};

const parseNumber = (raw: string | null, fallback: number): number => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(10, Math.round(n)));
};

const parseText = (raw: string | null, fallback: string): string => {
  if (raw == null) return fallback;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const toIntensityLabel = (intensity: number): string => {
  if (intensity >= 8) return "강함";
  if (intensity >= 5) return "중간";
  return "약함";
};

const buildTestIntake = (sp: URLSearchParams): StrictIntakeInput => {
  const copingAttempt = parseText(
    sp.get("coping_attempt"),
    parseText(sp.get("behavioral_reaction"), DEFAULT_TEST_INTAKE.behavioral_reaction || "회피적으로 반응")
  );

  return {
    core_emotion: parseText(sp.get("core_emotion"), DEFAULT_TEST_INTAKE.core_emotion),
    situation_context: parseText(sp.get("situation_context"), DEFAULT_TEST_INTAKE.situation_context),
    automatic_thought: parseText(sp.get("automatic_thought"), DEFAULT_TEST_INTAKE.automatic_thought),
    physical_sensation: parseText(sp.get("physical_sensation"), DEFAULT_TEST_INTAKE.physical_sensation || ""),
    behavioral_reaction: parseText(sp.get("behavioral_reaction"), copingAttempt),
    intensity: parseNumber(sp.get("intensity"), DEFAULT_TEST_INTAKE.intensity),
    available_time: sp.get("available_time") ? parseNumber(sp.get("available_time"), DEFAULT_TEST_INTAKE.available_time || 10) : DEFAULT_TEST_INTAKE.available_time,
    immediate_goal: parseText(sp.get("immediate_goal"), DEFAULT_TEST_INTAKE.immediate_goal || ""),
    coping_attempt: copingAttempt,
  };
};

const buildMockChatResponse = (intake: StrictIntakeInput): ChatResponse => ({
  response: "임시 응답: EFT 스크립트 생성 완료",
  emotion_analysis: {
    primary_emotion: "anxiety",
    intensity: intake.intensity / 10,
    confidence: 0.9,
    triggers: ["product-test"],
  },
  eft_recommendations: [],
  suggested_actions: [],
  processing_time: 0,
  timestamp: new Date().toISOString(),
  requires_followup: false,
  emergency_detected: false,
  professional_referral: false,
  response_id: `mock-${Date.now()}`,
  eft_script: {
    setup_phrase: `지금 떠오르는 ${intake.core_emotion} 감정에 맞춰, 천천히 호흡하며 다음 문장을 반복해보세요.`,
    focus_words: ["지금", intake.core_emotion, "감정", "괜찮아요"],
    target_emotion: intake.core_emotion,
    intensity_label: toIntensityLabel(intake.intensity),
    round_phrases: ["지금 괜찮습니다.", "이 감정은 지나갈 거예요."],
    situation_summary: intake.situation_context,
    recommended_duration: 6,
  },
});

export const EFTStrictPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { setEftScript } = useEFTScript();
  const [strictIntakeData, setStrictIntakeData] = useState<StrictIntakeInput | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDummyModeReady, setIsDummyModeReady] = useState(false);
  const [postChoice, setPostChoice] = useState<PostIntakeChoice | null>(null);
  const planStartResistance = (location.state as { planStartResistance?: string } | undefined)?.planStartResistance;

  const handleSubmit = async (data: StrictIntakeInput) => {
    setLoading(true);
    setStrictIntakeData(data);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "EFT STRICT 입력",
          strict_intake: data,
        }),
      });

      const result: ChatResponse = await response.json();

      if (result.eft_script) {
        setPostChoice({ strictIntake: data, chatResponse: result });
      } else {
        alert("EFT 스크립트 생성에 실패했습니다.");
      }
    } catch (error) {
      console.error("API 오류:", error);
      alert("요청 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const applyDummyData = () => {
    const strictIntake = buildTestIntake(searchParams);
    setPostChoice({
      strictIntake,
      chatResponse: buildMockChatResponse(strictIntake),
    });
  };

  useEffect(() => {
    const autoQuery = searchParams.get("demo") === "1" || searchParams.get("quick") === "1";
    if (!autoQuery || postChoice) return;

    const strictIntake = buildTestIntake(searchParams);
    setPostChoice({
      strictIntake,
      chatResponse: buildMockChatResponse(strictIntake),
    });
    setIsDummyModeReady(true);
  }, [searchParams, postChoice]);

  const goToEFTAR = () => {
    if (!postChoice) return;
    const { strictIntake, chatResponse } = postChoice;
    setEftScript({
      setup_phrase: chatResponse.eft_script!.setup_phrase,
      focus_words: chatResponse.eft_script!.focus_words,
      target_emotion: chatResponse.eft_script!.target_emotion,
      intensity_label: chatResponse.eft_script!.intensity_label,
      round_phrases: chatResponse.eft_script!.round_phrases,
    });
    navigate("/ar-holistic", {
      state: {
        strictIntake,
        intensity_before: strictIntake.intensity,
        planStartResistance,
      },
    });
  };

  const goToMeditation = () => {
    if (!postChoice) return;
    navigate("/meditation/theme", {
      state: {
        strictIntake: postChoice.strictIntake,
        chatResponse: postChoice.chatResponse,
        planStartResistance,
      },
    });
  };

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          fontSize: "20px",
          color: "#fd6f22",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        <div
          style={{
            width: "50px",
            height: "50px",
            border: "4px solid #fd6f2220",
            borderTop: "4px solid #fd6f22",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        />
        EFT 스크립트 생성 중입니다...
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (postChoice) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg">
          <h2 className="text-center text-lg font-bold text-gray-800">입력 완료</h2>
          <p className="mt-2 text-center text-sm text-gray-500">
            감정 입력이 완료되면 바로 다음 단계로 이동해 주세요.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={goToEFTAR}
              className="w-full rounded-xl bg-amber-500 py-4 text-center font-medium text-white transition hover:bg-amber-600"
            >
              EFT AR (즉시 시작)
            </button>
            <button
              type="button"
              onClick={goToMeditation}
              className="w-full rounded-xl border-2 border-indigo-200 bg-indigo-50 py-4 text-center font-medium text-indigo-700 transition hover:bg-indigo-100"
            >
              유튜브 명상 (바로 이동)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full items-start justify-center bg-gray-50 p-4">
      <div className="flex w-full max-w-md flex-col md:max-w-2xl lg:max-w-4xl">
        <SlideIntake onComplete={handleSubmit} />
        {!isDummyModeReady && (
          <button
            type="button"
            onClick={applyDummyData}
            className="mt-6 w-full rounded-xl bg-emerald-500 py-3 text-center font-medium text-white transition hover:bg-emerald-600"
          >
            샘플 데이터로 바로 시작
          </button>
        )}
      </div>
    </div>
  );
};

