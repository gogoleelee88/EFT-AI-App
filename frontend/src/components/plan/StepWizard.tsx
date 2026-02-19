// 스텝 프로그레스 바 컴포넌트
import React from "react";

export type WizardStep = 1 | 2 | 3 | 4 | 5;

interface StepInfo {
  number: WizardStep;
  label: string;
  icon: string;
}

interface StepWizardProps {
  currentStep: WizardStep;
  onStepClick?: (step: WizardStep) => void;
}

const STEPS: StepInfo[] = [
  { number: 1, label: "할 일", icon: "✏️" },
  { number: 2, label: "미세 행동", icon: "🎯" },
  { number: 3, label: "미션", icon: "🎮" },
  { number: 4, label: "알람", icon: "⏰" },
];

const StepWizard: React.FC<StepWizardProps> = ({ currentStep, onStepClick }) => {
  const isStepAccessible = (step: WizardStep): boolean => {
    // 현재 스텝과 이전 스텝만 클릭 가능
    return step <= currentStep;
  };

  const getStepStatus = (
    step: WizardStep
  ): "completed" | "current" | "upcoming" => {
    if (step < currentStep) return "completed";
    if (step === currentStep) return "current";
    return "upcoming";
  };

  return (
    <div className="w-full bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10 shadow-sm">
      <div className="max-w-2xl mx-auto">
        {/* 프로그레스 바 */}
        <div className="flex items-center justify-between relative">
          {/* 연결선 */}
          <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200 -z-10">
            <div
              className="h-full bg-indigo-600 transition-all duration-500"
              style={{
                width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%`,
              }}
            />
          </div>

          {/* 스텝 아이템 */}
          {STEPS.map((step) => {
            const status = getStepStatus(step.number);
            const isAccessible = isStepAccessible(step.number);

            return (
              <div
                key={step.number}
                className="flex flex-col items-center gap-2 relative"
              >
                {/* 스텝 원형 아이콘 */}
                <button
                  onClick={() =>
                    isAccessible && onStepClick && onStepClick(step.number)
                  }
                  disabled={!isAccessible}
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center
                    text-lg font-semibold transition-all duration-300
                    ${
                      status === "completed"
                        ? "bg-indigo-600 text-white shadow-md"
                        : status === "current"
                        ? "bg-indigo-500 text-white shadow-lg scale-110"
                        : "bg-gray-200 text-gray-400"
                    }
                    ${
                      isAccessible && onStepClick
                        ? "cursor-pointer hover:scale-105"
                        : "cursor-default"
                    }
                  `}
                >
                  {status === "completed" ? "✓" : step.icon}
                </button>

                {/* 스텝 라벨 */}
                <span
                  className={`
                    text-xs font-medium transition-colors duration-300
                    ${
                      status === "current"
                        ? "text-indigo-700 font-bold"
                        : status === "completed"
                        ? "text-indigo-600"
                        : "text-gray-400"
                    }
                  `}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* 현재 스텝 제목 */}
        <div className="text-center mt-4">
          <h2 className="text-lg font-bold text-gray-800">
            {currentStep === 5
              ? "✅ 완료"
              : `${currentStep}단계: ${STEPS[currentStep - 1]?.label}`}
          </h2>
        </div>
      </div>
    </div>
  );
};

export default StepWizard;
