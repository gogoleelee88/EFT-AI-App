import type React from "react"
import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, ArrowRight, Check, ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react"
import { Button } from "../ui/Button"
import { ThemeToggle } from "../ui/ThemeToggle"
import { cn } from "../../lib/utils"
import type { StrictIntakeInput } from "../../types/serverAI"

interface SlideIntakeProps {
  onComplete: (data: StrictIntakeInput) => void
}

interface QuestionStep {
  id: keyof StrictIntakeInput | "intensity"
  question: string
  subtext: string
  placeholder: string
  chips: string[]
}

const QUESTION_FLOW: QuestionStep[] = [
  {
    id: "core_emotion",
    question: "지금 가장 힘든 감정은 무엇인가요?",
    subtext: "떠오르는 감정을 선택하거나 직접 입력해주세요",
    placeholder: "예: 불안, 분노, 슬픔...",
    chips: ["불안", "스트레스", "분노", "슬픔", "걱정", "두려움", "외로움", "답답함"],
  },
  {
    id: "situation_context",
    question: "상황을 CCTV로 본다면 타인은 어떻게 볼까요?",
    subtext: "육하원칙으로 정리해주세요",
    placeholder: "예: 오늘 오후 | 회의실 | 팀장이 | 내 제안을 | 공개적으로 비판했다 | 데이터가 부족하다며",
    chips: [], // 육하원칙 전용 UI로 변경
  },
  {
    id: "automatic_thought",
    question: "그 감정과 함께 어떤 생각이 드나요?",
    subtext: "머릿속에 맴도는 생각을 알려주세요",
    placeholder: "예: 내가 부족해서 그래...",
    chips: ["내가 부족해", "다 잘못될 거야", "아무도 날 이해 못해", "통제할 수 없어", "너무 지쳤어"],
  },
  {
    id: "physical_sensation",
    question: "몸에서 어떤 반응이 느껴지세요?",
    subtext: "신체적으로 느껴지는 증상을 선택해주세요",
    placeholder: "예: 두통, 어깨 결림...",
    chips: ["두통", "가슴 답답함", "어깨 긴장", "복통", "심장 두근거림", "숨이 막힘", "피로감"],
  },
  {
    id: "intensity",
    question: "불편함의 강도는 어느 정도인가요?",
    subtext: "1(가장 약함)부터 10(가장 강함)까지 선택해주세요",
    placeholder: "숫자를 선택해주세요",
    chips: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
  },
  {
    id: "coping_attempt",
    question: "평소에 이런 감정을 어떻게 다루시나요?",
    subtext: "지금까지 해온 방식을 알려주세요",
    placeholder: "예: 혼자 참음, 운동...",
    chips: ["혼자 참음", "운동", "음악 듣기", "친구와 대화", "명상", "잠자기", "아무것도 안 함"],
  },
  {
    id: "immediate_goal",
    question: "우리가 함께 만들 미래의 모습이에요",
    subtext: "빈칸을 채워 문장을 완성하면 심상화 효과가 더 커져요",
    placeholder: "",
    chips: [], 
  },
]

const EMPATHY_RESPONSES = [
  "그렇군요, 알 것 같아요.",
  "알겠어요, 말씀해주셔서 고마워요.",
  "네, 그런 마음이 드셨군요.",
  "좋아요, 잘 받았습니다.",
  "공감이 돼요. 다음으로 넘어갈게요.",
]

const MAX_ITEMS = 7
const BRAND_COLOR = "#fd6f22"

// 육하원칙 칩 데이터
const SIX_W_CHIPS = {
  when: ["오늘 오전", "오늘 오후", "어제", "방금 전", "일주일 전", "한 달 전"],
  where: ["회의실", "사무실", "집", "카페", "길", "온라인", "공공장소"],
  who: ["팀장이", "동료가", "가족이", "친구가", "상사가", "나 혼자", "낯선 사람이"],
  what: ["내 의견을", "내 제안을", "나를", "내 실수를", "내 성과를", "내 감정을"],
  how: ["무시했다", "비판했다", "화를 냈다", "거부했다", "비난했다", "무관심했다"],
  why: ["이유 없이", "데이터가 부족하다며", "시간이 없다며", "중요하지 않다며", "내 탓이라며"],
}

export function SlideIntake({ onComplete }: SlideIntakeProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [inputValue, setInputValue] = useState("")
  // 7번째 단계(대화형 템플릿) 전용 상태 데이터
  const [targetTemplate, setTargetTemplate] = useState({
    emotion: "",
    sensory: "",
    action: ""
  });
  const [collectedData, setCollectedData] = useState<Partial<StrictIntakeInput>>({})
  const [showEmpathy, setShowEmpathy] = useState(false)
  const [empathyText, setEmpathyText] = useState("")
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [slideDirection, setSlideDirection] = useState<"left" | "right">("left")
  const [isFocused, setIsFocused] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // 육하원칙 입력값
  const [sixW, setSixW] = useState({
    when: "",
    where: "",
    who: "",
    what: "",
    how: "",
    why: "",
  })

  // 육하원칙 각 입력창의 포커스 상태
  const [sixWFocused, setSixWFocused] = useState<string | null>(null)

  // 3번째 카드 - 여러 생각 선택
  const [selectedThoughts, setSelectedThoughts] = useState<string[]>([])

  const inputRef = useRef<HTMLInputElement>(null)

  const isComplete = currentStep >= MAX_ITEMS
  const currentQuestion = QUESTION_FLOW[currentStep]

  useEffect(() => {
    if (!isComplete && !isTransitioning && inputRef.current) {
      const timer = setTimeout(() => {
        inputRef.current?.focus()
      }, 600)
      return () => clearTimeout(timer)
    }
  }, [currentStep, isComplete, isTransitioning])

  // 육하원칙 입력값이 변경되면 메인 입력창에 자동으로 합쳐서 반영
  useEffect(() => {
    if (currentStep === 1) {
      const combined = [
        sixW.when,
        sixW.where,
        sixW.who,
        sixW.what,
        sixW.how,
        sixW.why,
      ].filter(Boolean).join(" ")
      setInputValue(combined)
    }
  }, [sixW, currentStep])

  // 3번째 카드 - 선택된 생각들을 메인 입력창에 반영
  useEffect(() => {
    if (currentStep === 2) {
      setInputValue(selectedThoughts.join(", "))
    }
  }, [selectedThoughts, currentStep])

  const handleAnswer = (answer: string) => {
    if (!answer.trim() || isTransitioning) return

    setIsTransitioning(true)
    setSlideDirection("left")

    if (currentQuestion.id === "intensity") {
      const numMatch = answer.match(/\d+/)
      const intensity = numMatch ? Number.parseInt(numMatch[0], 10) : 5
      setCollectedData((prev) => ({ ...prev, intensity: Math.min(10, Math.max(1, intensity)) }))
    } else {
      setCollectedData((prev) => ({ ...prev, [currentQuestion.id]: answer }))
    }

     // 🔥 7번째 질문(마지막) 완료 시 특별 처리
    if (currentStep === 6) {
      // 최종 데이터 구성
      const finalData: StrictIntakeInput = {
        core_emotion: collectedData.core_emotion || "",
        situation_context: collectedData.situation_context || "",
        automatic_thought: collectedData.automatic_thought || "",
        physical_sensation: collectedData.physical_sensation || "",
        intensity: collectedData.intensity || 5,
        coping_attempt: collectedData.coping_attempt || "",
        immediate_goal: answer, // 마지막 입력값
      }

      // 짧은 공감 메시지 표시
      const randomEmpathy = "완벽해요! 이제 시작해볼까요?"
      setEmpathyText(randomEmpathy)
      setShowEmpathy(true)

      setTimeout(() => {
        setShowEmpathy(false)
        setTimeout(() => {
          // 부모 콜백 호출 (EFTStrictPage가 API 호출 후 EFT AR/명상 선택 화면 표시)
          onComplete(finalData)
          // navigate 제거: EFTStrictPage가 handleSubmit으로 흐름 제어
        }, 300)
      }, 1200)

      return // 더 이상 진행하지 않음
    }

    // 기존 로직 (1~6번째 질문)
    const randomEmpathy = EMPATHY_RESPONSES[Math.floor(Math.random() * EMPATHY_RESPONSES.length)]
    setEmpathyText(randomEmpathy)
    setShowEmpathy(true)
    setInputValue("")

    setTimeout(() => {
      setShowEmpathy(false)
      setTimeout(() => {
        setCurrentStep((prev) => prev + 1)
        setIsTransitioning(false)
      }, 300)
    }, 1200)
  }

  const handlePrevious = () => {
    if (currentStep > 0 && !isTransitioning) {
      setSlideDirection("right")
      setCurrentStep((prev) => prev - 1)
    }
  }

  const handleChipClick = (chipText: string) => {
    // 3번째 카드(생각)일 때는 다중 선택 가능
    if (currentStep === 2) {
      setSelectedThoughts((prev) => {
        if (prev.includes(chipText)) {
          // 이미 선택된 경우 제거
          return prev.filter((t) => t !== chipText)
        } else {
          // 선택되지 않은 경우 추가
          return [...prev, chipText]
        }
      })
    } else {
      // 다른 카드는 기존대로 단일 선택
      handleAnswer(chipText)
    }
  }

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleAnswer(inputValue)
  }

  const handleGenerateScript = () => {
    const finalData: StrictIntakeInput = {
      core_emotion: collectedData.core_emotion || "",
      situation_context: collectedData.situation_context || "",
      automatic_thought: collectedData.automatic_thought || "",
      physical_sensation: collectedData.physical_sensation || "",
      intensity: collectedData.intensity || 5,
      coping_attempt: collectedData.coping_attempt || "",
      immediate_goal: collectedData.immediate_goal || "",
    }
    onComplete(finalData)
  }

  const slideVariants = {
    enter: (direction: "left" | "right") => ({
      x: direction === "left" ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: "left" | "right") => ({
      x: direction === "left" ? -300 : 300,
      opacity: 0,
    }),
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header with progress bar */}
      <header className="fixed top-0 left-0 right-0 z-20 px-6 py-4 bg-background/80 backdrop-blur-xl border-b border-border/10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          {/* Segmented Progress Bar */}
          <div className="flex-1 mr-4 flex gap-1.5">
            {Array.from({ length: MAX_ITEMS }).map((_, i) => (
              <motion.div key={i} className="flex-1 h-1.5 rounded-full overflow-hidden bg-muted/50">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: BRAND_COLOR }}
                  initial={{ width: 0 }}
                  animate={{ width: i < currentStep ? "100%" : i === currentStep ? "50%" : "0%" }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              </motion.div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <span
              className="text-sm font-bold px-3 py-1.5 rounded-full"
              style={{
                backgroundColor: `${BRAND_COLOR}15`,
                color: BRAND_COLOR,
              }}
            >
              {Math.min(currentStep + 1, MAX_ITEMS)}/{MAX_ITEMS}
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-6 py-24">
        <div className="w-full max-w-2xl relative">
          {/* Previous Button */}
          {!isComplete && currentStep > 0 && (
            <motion.button
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              onClick={handlePrevious}
              disabled={isTransitioning}
              className={cn(
                "absolute -left-4 md:-left-16 top-1/2 -translate-y-1/2 z-10",
                "w-12 h-12 rounded-full",
                "bg-card backdrop-blur-sm border border-border/30",
                "flex items-center justify-center",
                "text-muted-foreground hover:text-foreground",
                "transition-all duration-200",
                "disabled:opacity-30 disabled:cursor-not-allowed",
              )}
              style={{
                boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
              }}
              whileHover={{ scale: 1.05, borderColor: BRAND_COLOR }}
              whileTap={{ scale: 0.95 }}
            >
              <ChevronLeft className="w-5 h-5" />
            </motion.button>
          )}

          {/* Next Button (when input has value) */}
          {!isComplete && (currentStep === 6 ? (targetTemplate.emotion && targetTemplate.sensory && targetTemplate.action) : inputValue.trim()) && (
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              onClick={() => handleAnswer(inputValue)}
              disabled={isTransitioning}
              className={cn(
                "absolute -right-4 md:-right-16 top-1/2 -translate-y-1/2 z-10",
                "w-12 h-12 rounded-full",
                "flex items-center justify-center",
                "text-white",
                "transition-all duration-200",
                "disabled:opacity-30 disabled:cursor-not-allowed",
              )}
              style={{
                backgroundColor: BRAND_COLOR,
                boxShadow: `0 4px 24px ${BRAND_COLOR}50`,
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <ChevronRight className="w-5 h-5" />
            </motion.button>
          )}

          {/* Card Carousel */}
          <AnimatePresence mode="wait" custom={slideDirection}>
            {!isComplete ? (
              <motion.div
                key={currentStep}
                custom={slideDirection}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  duration: 0.2,
                  ease: "easeOut",
                }}
                className={cn(
                  "relative p-8 md:p-12 rounded-3xl",
                  "bg-card backdrop-blur-xl",
                  "border-2 transition-all duration-300",
                )}
                style={{
                  borderColor: isFocused ? BRAND_COLOR : "hsl(var(--border) / 0.2)",
                  boxShadow: isFocused
                    ? `0 0 0 1px ${BRAND_COLOR}, 0 0 40px ${BRAND_COLOR}25, 0 25px 50px -12px rgba(0,0,0,0.25)`
                    : "0 25px 50px -12px rgba(0,0,0,0.15)",
                }}
              >
                <div className="space-y-8">
                  {/* Question Header */}
                  <div className="space-y-4">
                    <motion.div
                      className="flex items-center gap-3"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 }}
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{
                          background: `linear-gradient(135deg, ${BRAND_COLOR}, #ff9966)`,
                          boxShadow: `0 4px 16px ${BRAND_COLOR}40`,
                        }}
                      >
                        <Sparkles className="w-5 h-5 text-white" />
                      </div>
                      <span className="text-sm text-muted-foreground font-medium tracking-wide uppercase">
                        Step {currentStep + 1}
                      </span>
                    </motion.div>

                    <motion.h1
                      className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground leading-tight text-balance"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 }}
                    >
                      {currentQuestion.question}
                    </motion.h1>

                    <motion.p
                      className="text-muted-foreground text-base md:text-lg"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.2 }}
                    >
                      {currentQuestion.subtext}
                    </motion.p>
                  </div>

                  {/* Suggestion Chips or 육하원칙 */}
                  {currentStep === 1 ? (
                    // 육하원칙 입력 그리드
                    <motion.div
                      className="space-y-4"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25 }}
                    >
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {Object.entries(SIX_W_CHIPS).map(([key, chips], colIndex) => {
                          const labels = {
                            when: "언제",
                            where: "어디서",
                            who: "누가",
                            what: "무엇을",
                            how: "어떻게",
                            why: "왜",
                          }
                          return (
                            <div key={key} className="space-y-2">
                              <label className="text-xs font-semibold text-muted-foreground px-1">
                                {labels[key as keyof typeof labels]}
                              </label>
                              <input
                                type={showPassword ? "text" : "password"}
                                value={sixW[key as keyof typeof sixW]}
                                onChange={(e) =>
                                  setSixW({ ...sixW, [key]: e.target.value })
                                }
                                onFocus={() => setSixWFocused(key)}
                                onBlur={(e) => {
                                  // relatedTarget을 확인하여 칩 버튼 클릭 시 포커스 유지
                                  if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) {
                                    setTimeout(() => setSixWFocused(null), 150)
                                  }
                                }}
                                placeholder={chips[0]}
                                className={cn(
                                  "w-full px-3 py-2 text-sm",
                                  "bg-muted/30 border border-border/50 rounded-lg",
                                  "focus:outline-none focus:ring-2 focus:ring-offset-0",
                                  "transition-all duration-200",
                                )}
                                style={{
                                  borderColor: sixWFocused === key ? BRAND_COLOR : undefined,
                                  ringColor: BRAND_COLOR,
                                }}
                              />
                              {sixWFocused === key && (
                                <div className="flex flex-wrap gap-1.5" onMouseDown={(e) => e.preventDefault()}>
                                  {chips.map((chip) => (
                                    <button
                                      key={chip}
                                      type="button"
                                      onClick={() => {
                                        setSixW({ ...sixW, [key]: chip })
                                      }}
                                      className={cn(
                                        "px-2 py-1 text-xs rounded",
                                        "bg-muted/50 hover:bg-muted",
                                        "border border-border/30",
                                        "transition-colors duration-200",
                                      )}
                                    >
                                      {chip}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </motion.div>
                  ) : (
                    // 기존 칩 UI
                    <motion.div
                      className="flex flex-wrap gap-2.5"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25 }}
                    >
                      {currentQuestion.chips.map((chip, index) => {
                        const isSelected = currentStep === 2 && selectedThoughts.includes(chip)
                        return (
                          <motion.button
                            key={chip}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.25 + index * 0.03 }}
                            onClick={() => handleChipClick(chip)}
                            disabled={isTransitioning && currentStep !== 2}
                            whileHover={{
                              scale: 1.05,
                              y: -2,
                            }}
                            whileTap={{ scale: 0.95 }}
                            className={cn(
                              "px-5 py-2.5 rounded-full text-sm font-medium",
                              "backdrop-blur-sm",
                              "border",
                              "transition-all duration-200",
                              "disabled:opacity-50 disabled:cursor-not-allowed",
                              "select-none cursor-pointer",
                              isSelected
                                ? "bg-[#fd6f22] text-white border-[#fd6f22]"
                                : "bg-muted/50 border-border/50 text-foreground",
                            )}
                            style={
                              isSelected
                                ? {
                                    boxShadow: `0 4px 20px ${BRAND_COLOR}40`,
                                  }
                                : {}
                            }
                            onMouseEnter={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.borderColor = BRAND_COLOR
                                e.currentTarget.style.backgroundColor = `${BRAND_COLOR}15`
                                e.currentTarget.style.color = BRAND_COLOR
                                e.currentTarget.style.boxShadow = `0 4px 20px ${BRAND_COLOR}25`
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.borderColor = ""
                                e.currentTarget.style.backgroundColor = ""
                                e.currentTarget.style.color = ""
                                e.currentTarget.style.boxShadow = ""
                              }
                            }}
                          >
                            {chip}
                          </motion.button>
                        )
                      })}
                    </motion.div>
                  )}

                  {/* Text Input: 7단계는 템플릿, 나머지는 기존 입력창 */}
                  <AnimatePresence mode="wait">
                    {currentStep === 6 ? (
                      <motion.div 
                        key="template-ui"
                        className="space-y-6 py-4"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                      >
                        <div className="text-xl md:text-2xl leading-relaxed font-medium text-foreground/90">
                          "나는 
                          <input
                            className="mx-2 px-3 py-1 bg-muted/40 border-b-2 border-[#fd6f22] focus:outline-none w-32 text-center"
                            placeholder="평온한"
                            value={targetTemplate.emotion}
                            onChange={(e) => {
                              const val = e.target.value;
                              setTargetTemplate(prev => ({ ...prev, emotion: val }));
                              setInputValue(`나는 ${val} 상태가 되어, ${targetTemplate.sensory}을 느끼며, ${targetTemplate.action}을 할 것이다.`);
                            }}
                          /> 
                          상태가 되어, <br className="md:hidden" />
                          <input
                            className="mx-2 px-3 py-1 bg-muted/40 border-b-2 border-[#fd6f22] focus:outline-none w-48 text-center"
                            placeholder="가슴이 시원해짐"
                            value={targetTemplate.sensory}
                            onChange={(e) => {
                              const val = e.target.value;
                              setTargetTemplate(prev => ({ ...prev, sensory: val }));
                              setInputValue(`나는 ${targetTemplate.emotion} 상태가 되어, ${val}을 느끼며, ${targetTemplate.action}을 할 것이다.`);
                            }}
                          />
                          을 느끼며, <br /> 세션이 끝나면 
                          <input
                            className="mx-2 px-3 py-1 bg-muted/40 border-b-2 border-[#fd6f22] focus:outline-none w-48 text-center"
                            placeholder="따뜻한 물 한 잔"
                            value={targetTemplate.action}
                            onChange={(e) => {
                              const val = e.target.value;
                              setTargetTemplate(prev => ({ ...prev, action: val }));
                              setInputValue(`나는 ${targetTemplate.emotion} 상태가 되어, ${targetTemplate.sensory}을 느끼며, ${val}을 할 것이다.`);
                            }}
                          />
                          을 할 것이다."
                        </div>
                      </motion.div>
                    ) : (
                      <motion.form
                        key="standard-input"
                        onSubmit={handleInputSubmit}
                        className="space-y-3"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ delay: 0.35 }}
                      >
                        <div className="relative">
                          <input
                            ref={inputRef}
                            type={showPassword ? "text" : "password"}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onFocus={() => setIsFocused(true)}
                            onBlur={() => setIsFocused(false)}
                            placeholder={currentQuestion.placeholder}
                            disabled={isTransitioning}
                            className={cn(
                              "w-full px-0 py-4 pr-12 text-lg md:text-xl font-medium",
                              "bg-transparent border-0 border-b-2",
                              "placeholder:text-muted-foreground/40",
                              "focus:outline-none",
                              "transition-colors duration-200",
                              "disabled:opacity-50",
                            )}
                            style={{
                              borderBottomColor: isFocused ? BRAND_COLOR : "hsl(var(--border) / 0.3)",
                            }}
                          />
                          {inputValue && (
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-foreground"
                            >
                              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground/50">칩을 클릭하거나 직접 입력 후 Enter</p>
                      </motion.form>
                    )}
                  </AnimatePresence>

                  {/* Empathy Bubble */}
                  <AnimatePresence>
                    {showEmpathy && (
                      <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.9 }}
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl"
                        style={{
                          backgroundColor: `${BRAND_COLOR}12`,
                          border: `1px solid ${BRAND_COLOR}25`,
                        }}
                      >
                        <Check className="w-4 h-4" style={{ color: BRAND_COLOR }} />
                        <span className="text-sm font-medium text-foreground">{empathyText}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            ) : (
              /* Completion Card */
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="p-8 md:p-12 rounded-3xl text-center space-y-8 bg-card"
                style={{
                  border: `2px solid ${BRAND_COLOR}`,
                  boxShadow: `0 0 60px ${BRAND_COLOR}15, 0 25px 50px -12px rgba(0,0,0,0.2)`,
                }}
              >
                {/* Success Icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 200,
                    damping: 15,
                    delay: 0.2,
                  }}
                  className="relative mx-auto w-24 h-24"
                >
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{ backgroundColor: BRAND_COLOR }}
                    animate={{
                      scale: [1, 1.3, 1],
                      opacity: [0.25, 0.08, 0.25],
                    }}
                    transition={{
                      duration: 2.5,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: "easeInOut",
                    }}
                  />
                  <div
                    className="absolute inset-0 flex items-center justify-center rounded-full"
                    style={{
                      background: `linear-gradient(135deg, ${BRAND_COLOR}, #ff9966)`,
                      boxShadow: `0 8px 32px ${BRAND_COLOR}50`,
                    }}
                  >
                    <Sparkles className="w-10 h-10 text-white" />
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="space-y-3"
                >
                  <h2 className="text-2xl md:text-3xl font-bold text-foreground">준비가 완료되었어요!</h2>
                  <p className="text-muted-foreground text-lg">당신만을 위한 EFT 스크립트를 생성할게요</p>
                </motion.div>

                {/* Summary */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="grid grid-cols-2 md:grid-cols-3 gap-3"
                >
                  {Object.entries(collectedData).map(([key, value], index) => (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.5 + index * 0.05 }}
                      className="px-4 py-3 rounded-xl bg-muted/50 backdrop-blur-sm border border-border/30"
                    >
                      <p className="text-xs text-muted-foreground mb-1 capitalize">
                        {key === "core_emotion"
                          ? "감정"
                          : key === "situation_context"
                            ? "상황"
                            : key === "automatic_thought"
                              ? "생각"
                              : key === "physical_sensation"
                                ? "신체반응"
                                : key === "intensity"
                                  ? "강도"
                                  : key === "coping_attempt"
                                    ? "대처방식"
                                    : "목표"}
                      </p>
                      <p className="text-sm font-medium text-foreground truncate">
                        {key === "intensity" ? `${value}/10` : value}
                      </p>
                    </motion.div>
                  ))}
                </motion.div>

                {/* CTA Button */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
                  <Button
                    size="lg"
                    onClick={handleGenerateScript}
                    className="h-14 px-10 text-lg gap-3 rounded-2xl text-white transition-all hover:scale-105"
                    style={{
                      background: `linear-gradient(135deg, ${BRAND_COLOR}, #ff9966)`,
                      boxShadow: `0 8px 32px ${BRAND_COLOR}40`,
                    }}
                  >
                    <Sparkles className="w-5 h-5" />
                    EFT 스크립트 생성하기
                  </Button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}
