import { useState } from "react"
import { SlideIntake } from "@/components/eft/SlideIntake"
import { EFTScriptDisplay } from "@/components/eft/EFTScriptDisplay"
import { LoadingSpinner } from "@/components/eft/LoadingSpinner"
import { useNavigate } from "react-router-dom"
import type { EFTScript, StrictIntakeInput } from "@/types/serverAI"

export default function EFTPage() {
  const [script, setScript] = useState<EFTScript | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (data: StrictIntakeInput) => {
    setLoading(true)
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "EFT 스크립트 요청",
          strict_intake: data,
        }),
      })
      const result = await response.json()
      if (result.eft_script) {
        setScript(result.eft_script)
      } else {
        alert("EFT 스크립트 생성에 실패했습니다.")
      }
    } catch (error) {
      console.error("API 오류:", error)
      alert("서버 오류가 발생했습니다.")
    } finally {
      setLoading(false)
    }
  }

  const handleStartSession = () => {
    console.log("EFT 세션 시작 - AR Holistic으로 이동")
    navigate("/ar-holistic")
  }

  if (loading) {
    return <LoadingSpinner />
  }

  if (script) {
    return <EFTScriptDisplay script={script} onClose={() => setScript(null)} onStartSession={handleStartSession} />
  }

  return <SlideIntake onComplete={handleSubmit} />
}
