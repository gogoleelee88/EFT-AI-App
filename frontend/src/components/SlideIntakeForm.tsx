"use client"

import React, { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, ArrowRight, Check, ChevronLeft, ChevronRight } from "lucide-react"

// --- [수정 포인트 1] 강력한 카드 디자인을 위한 스타일 상수 ---
const BRAND_COLOR = "#fd6f22" // v0 오리지널 주황색
const GLASS_STYLE = {
  background: "rgba(255, 255, 255, 0.7)", // 더 선명한 유리 효과
  backdropFilter: "blur(20px)",
  border: "1px solid rgba(255, 255, 255, 0.5)",
  boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.15)", // 확실한 그림자
}

interface StrictIntakeInput {
  core_emotion: string
  situation_context: string
  automatic_thought: string
  physical_sensation?: string
  behavioral_reaction?: string
  intensity: number
  available_time?: number
  immediate_goal?: string
}

interface SlideIntakeFormProps {
  onSubmit: (data: StrictIntakeInput) => void
}

interface QuestionStep {
  id: keyof StrictIntakeInput
  question: string
  subtext: string
  placeholder: string
  chips: string[]
  isOptional?: boolean
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
    question: "어떤 상황에서 이 감정이 생겼나요?",
    subtext: "구체적인 상황을 알려주세요",
    placeholder: "예: 중요한 발표를 앞두고 있어요...",
    chips: ["업무", "대인관계", "가족", "연애", "건강", "경제", "학업", "미래"],
  },
  {
    id: "automatic_thought",
    question: "그 감정과 함께 어떤 생각이 드나요?",
    subtext: "머릿속에 맴도는 생각을 알려주세요",
    placeholder: "예: 망치면 어쩌지, 다들 나를 무능하다고 볼 것 같아...",
    chips: ["내가 부족해", "다 잘못될 거야", "아무도 날 이해 못해", "통제할 수 없어", "너무 지쳤어"],
  },
  {
    id: "physical_sensation",
    question: "몸에서 어떤 반응이 느껴지세요?",
    subtext: "신체적으로 느껴지는 증상을 선택해주세요 (선택사항)",
    placeholder: "예: 가슴이 꽉 막히고 손에 힘이 잘 안 들어감...",
    chips: ["두통", "가슴 답답함", "어깨 긴장", "복통", "심장 두근거림", "숨이 막힘", "피로감"],
    isOptional: true,
  },
  {
    id: "intensity",
    question: "불편함의 강도는 어느 정도인가요?",
    subtext: "0(평온)부터 10(매우 강함)까지 선택해주세요",
    placeholder: "숫자를 선택해주세요",
    chips: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
  },
  {
    id: "behavioral_reaction",
    question: "평소에 이런 감정을 어떻게 다루시나요?",
    subtext: "지금까지 해온 방식을 알려주세요 (선택사항)",
    placeholder: "예: 혼자 참음, 운동...",
    chips: ["혼자 참음", "운동", "음악 듣기", "친구와 대화", "명상", "잠자기", "아무것도 안 함"],
    isOptional: true,
  },
  {
    id: "immediate_goal",
    question: "오늘 어떤 변화를 원하시나요?",
    subtext: "EFT를 통해 얻고 싶은 것을 알려주세요 (선택사항)",
    placeholder: "예: 마음의 평화, 불안 해소...",
    chips: ["마음의 평화", "불안 해소", "자신감 회복", "스트레스 완화", "에너지 충전", "감정 정리"],
    isOptional: true,
  },
]

const EMPATHY_RESPONSES = [
  "그렇군요, 충분히 이해해요.",
  "알겠어요, 말씀해주셔서 고마워요.",
  "네, 그런 마음이 드셨군요.",
  "좋아요, 잘 받았습니다.",
  "공감이 돼요. 다음으로 넘어갈게요.",
]

const MAX_ITEMS = QUESTION_FLOW.length

export function SlideIntakeForm({ onSubmit }: SlideIntakeFormProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [inputValue, setInputValue] = useState("")
  const [collectedData, setCollectedData] = useState<Partial<StrictIntakeInput>>({})
  const [showEmpathy, setShowEmpathy] = useState(false)
  const [empathyText, setEmpathyText] = useState("")
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [slideDirection, setSlideDirection] = useState<"left" | "right">("left")
  const [isFocused, setIsFocused] = useState(false)

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

  const handleAnswer = (answer: string) => {
    if (isTransitioning) return

    if (!answer.trim() && currentQuestion.isOptional) {
      setCurrentStep(prev => prev + 1)
      return
    }

    if (!answer.trim()) return

    setIsTransitioning(true)
    setSlideDirection("left")

    if (currentQuestion.id === "intensity") {
      const numMatch = answer.match(/\d+/)
      const intensity = numMatch ? parseInt(numMatch[0], 10) : 5
      setCollectedData(prev => ({ ...prev, intensity: Math.min(10, Math.max(0, intensity)) }))
    } else if (currentQuestion.id === "available_time") {
      const numMatch = answer.match(/\d+/)
      const time = numMatch ? parseInt(numMatch[0], 10) : undefined
      setCollectedData(prev => ({ ...prev, available_time: time }))
    } else {
      setCollectedData(prev => ({ ...prev, [currentQuestion.id]: answer }))
    }

    const randomEmpathy = EMPATHY_RESPONSES[Math.floor(Math.random() * EMPATHY_RESPONSES.length)]
    setEmpathyText(randomEmpathy)
    setShowEmpathy(true)
    setInputValue("")

    setTimeout(() => {
      setShowEmpathy(false)
      setTimeout(() => {
        setCurrentStep(prev => prev + 1)
        setIsTransitioning(false)
      }, 300)
    }, 1500)
  }

  const handlePrevious = () => {
    if (currentStep > 0 && !isTransitioning) {
      setSlideDirection("right")
      setCurrentStep(prev => prev - 1)
    }
  }

  const handleChipClick = (chipText: string) => {
    handleAnswer(chipText)
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
      intensity: collectedData.intensity || 5,
      physical_sensation: collectedData.physical_sensation,
      behavioral_reaction: collectedData.behavioral_reaction,
      immediate_goal: collectedData.immediate_goal,
      available_time: collectedData.available_time,
    }
    onSubmit(finalData)
  }

  const slideVariants = {
    enter: (direction: "left" | "right") => ({
      x: direction === "left" ? 300 : -300,
      opacity: 0,
      scale: 0.95,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
    },
    exit: (direction: "left" | "right") => ({
      x: direction === "left" ? -300 : 300,
      opacity: 0,
      scale: 0.95,
    }),
  }

  return (
    // [수정 1] 배경: 모바일에서는 스크롤 가능하게, PC에서는 중앙 정렬
    <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center justify-center overflow-hidden relative">

      {/* 배경 장식 (PC에서만 보이게 은은하게 처리) */}
      <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[100px] pointer-events-none opacity-50" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-blue-400/20 rounded-full blur-[100px] pointer-events-none opacity-50" />

      {/* 상단 헤더 */}
      <header className="fixed top-0 left-0 right-0 z-50 px-6 py-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex-1 mr-4 h-1.5 bg-muted rounded-full overflow-hidden backdrop-blur-sm">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: BRAND_COLOR }}
              initial={{ width: 0 }}
              animate={{ width: `${(currentStep / MAX_ITEMS) * 100}%` }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          </div>
          <div className="flex items-center gap-3">
             <span className="text-xs font-bold px-2 py-1 rounded-full bg-white/50 backdrop-blur text-primary border border-primary/20">
              {Math.min(currentStep + 1, MAX_ITEMS)}/{MAX_ITEMS}
            </span>
          </div>
        </div>
      </header>

      {/* [핵심 수정 포인트]
         1. w-full h-full: 모바일에서는 화면을 꽉 채움 (반응형)
         2. md:max-w-md md:h-[680px]: 태블릿/PC(md) 이상에서는 예쁜 카드 비율로 고정
      */}
      <main className="w-full h-full md:max-w-md md:h-[680px] relative px-4 flex items-center justify-center transition-all duration-300 ease-in-out">

        {/* 이전 버튼: PC에서는 카드 밖, 모바일에서는 숨김(또는 상단 배치 고려) */}
        {!isComplete && currentStep > 0 && (
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={handlePrevious}
            disabled={isTransitioning}
            className="absolute -left-16 top-1/2 -translate-y-1/2 z-10 p-3 text-muted-foreground hover:text-foreground transition-colors hidden md:block rounded-full hover:bg-black/5"
          >
            <ChevronLeft className="w-8 h-8" />
          </motion.button>
        )}

        <div className="w-full h-full relative flex flex-col justify-center">

          <AnimatePresence mode="wait" custom={slideDirection}>
            {!isComplete ? (
              <motion.div
                key={currentStep}
                custom={slideDirection}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: "spring", stiffness: 400, damping: 35 }}

                // [카드 스타일 수정]
                // 모바일: 둥근 모서리 적게, 꽉 찬 느낌, 그림자 없음
                // PC(md): 둥근 모서리 크게, 그림자 빵빵하게, 유리 효과
                className="absolute inset-0 flex flex-col justify-center p-6 md:p-10 md:rounded-[2.5rem] md:bg-card/40 md:backdrop-blur-xl md:border md:border-white/20 md:shadow-2xl"
                style={{
                  // PC에서만 테두리 색상 적용 (모바일은 깔끔하게)
                  borderColor: isFocused ? BRAND_COLOR : undefined,
                }}
              >
                <div className="space-y-8 w-full max-w-sm mx-auto">
                  {/* 질문 섹션 */}
                  <div className="space-y-4 text-center">
                     <motion.div
                      className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 shadow-lg shadow-orange-500/20"
                      style={{ background: `linear-gradient(135deg, ${BRAND_COLOR}, #ff9f5a)` }}
                      initial={{ scale: 0 }} animate={{ scale: 1 }}
                    >
                      <Sparkles className="w-7 h-7 text-white" />
                    </motion.div>

                    <motion.h1
                      className="text-3xl md:text-4xl font-bold text-foreground leading-tight break-keep"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      {currentQuestion.question}
                    </motion.h1>

                    <motion.p
                      className="text-muted-foreground text-lg"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      {currentQuestion.subtext}
                    </motion.p>
                  </div>

                  {/* 칩 선택 버튼들 */}
                  <motion.div
                    className="flex flex-wrap justify-center gap-2.5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    {currentQuestion.chips.map((chip, index) => (
                      <motion.button
                        key={chip}
                        onClick={() => handleChipClick(chip)}
                        disabled={isTransitioning}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.1 + index * 0.05 }}
                        className="px-5 py-2.5 rounded-full text-sm font-medium bg-white/80 dark:bg-black/20 border border-black/5 hover:border-primary hover:text-primary active:scale-95 transition-all shadow-sm"
                      >
                        {chip}
                      </motion.button>
                    ))}
                  </motion.div>

                  {/* 입력창 */}
                  <div className="relative pt-6">
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onFocus={() => setIsFocused(true)}
                      onBlur={() => setIsFocused(false)}
                      placeholder={currentQuestion.placeholder}
                      className="w-full px-4 py-4 text-center text-xl bg-transparent border-b-2 border-muted-foreground/20 focus:border-primary focus:outline-none placeholder:text-muted-foreground/30 transition-colors"
                      onKeyDown={(e) => e.key === 'Enter' && handleInputSubmit(e)}
                    />
                     <div className="absolute right-2 top-1/2 translate-y-1">
                        {inputValue && (
                          <button onClick={handleInputSubmit} className="p-2 rounded-full bg-primary text-white hover:opacity-90 transition-opacity shadow-lg">
                            <ArrowRight className="w-5 h-5"/>
                          </button>
                        )}
                     </div>
                  </div>
                </div>

                {/* 공감 팝업 */}
                <AnimatePresence>
                  {showEmpathy && (
                    <motion.div
                      initial={{ opacity: 0, y: 20, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="absolute bottom-10 left-0 right-0 flex justify-center pointer-events-none"
                    >
                      <span className="px-6 py-3 rounded-2xl bg-primary/10 text-primary text-sm font-bold border border-primary/20 backdrop-blur-md shadow-xl">
                        {empathyText}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : (
              /* 완료 화면 */
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute inset-0 flex flex-col justify-center items-center p-8 text-center space-y-8 md:rounded-[2.5rem] md:bg-card/40 md:backdrop-blur-xl md:border md:border-white/20 md:shadow-2xl"
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse" />
                  <div className="w-28 h-28 relative rounded-full bg-gradient-to-tr from-primary to-orange-300 flex items-center justify-center shadow-2xl">
                    <Sparkles className="w-12 h-12 text-white" />
                  </div>
                </div>

                <div className="space-y-2">
                  <h2 className="text-3xl md:text-4xl font-bold">준비 완료!</h2>
                  <p className="text-muted-foreground text-lg">당신의 이야기를 바탕으로<br/>치유 스크립트를 생성합니다.</p>
                </div>

                <button
                  onClick={handleGenerateScript}
                  className="w-full max-w-xs py-7 text-xl rounded-2xl bg-primary hover:bg-primary/90 shadow-xl shadow-primary/30 transition-transform hover:-translate-y-1 text-white font-bold"
                >
                  스크립트 생성하기
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}
