import { useState } from "react"
import { motion } from "framer-motion"
import { X, Play, Copy, Check, Sparkles, Heart, Zap, ArrowRight } from "lucide-react"
import { Button } from "../ui/Button"
import { cn } from "../../lib/utils"
import type { EFTScript } from "../../types/serverAI"

interface EFTScriptDisplayProps {
  script: EFTScript
  onClose: () => void
  onStartSession: () => void
}

export function EFTScriptDisplay({ script, onClose, onStartSession }: EFTScriptDisplayProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<"overview" | "rounds">("overview")

  const copyToClipboard = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 px-6 py-4 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-foreground">EFT 스크립트</h1>
              <p className="text-sm text-muted-foreground">맞춤 생성 완료</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <main className="px-6 py-8">
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Emotion summary card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 rounded-3xl bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20"
          >
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-background/80">
                <Heart className="w-4 h-4 text-primary" />
                <span className="font-medium text-foreground">{script.target_emotion}</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-background/80">
                <Zap className="w-4 h-4 text-amber-500" />
                <span className="font-medium text-foreground">{script.intensity_label}</span>
              </div>
            </div>
          </motion.div>

          {/* Tab navigation */}
          <div className="flex gap-2 p-1 rounded-xl bg-muted">
            <button
              onClick={() => setActiveTab("overview")}
              className={cn(
                "flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-all",
                activeTab === "overview"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              개요
            </button>
            <button
              onClick={() => setActiveTab("rounds")}
              className={cn(
                "flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-all",
                activeTab === "rounds"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              라운드별 문구
            </button>
          </div>

          {activeTab === "overview" ? (
            <div className="space-y-6">
              {/* Setup phrase */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="p-6 rounded-2xl bg-card border border-border"
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="font-semibold text-foreground">셋업 문구</h3>
                    <p className="text-sm text-muted-foreground">시작할 때 사용하세요</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(script.setup_phrase, -1)}
                    className="shrink-0"
                  >
                    {copiedIndex === -1 ? <Check className="w-4 h-4 text-accent" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-lg leading-relaxed text-foreground">&ldquo;{script.setup_phrase}&rdquo;</p>
              </motion.div>

              {/* Focus words */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="p-6 rounded-2xl bg-card border border-border"
              >
                <h3 className="font-semibold text-foreground mb-4">포커스 키워드</h3>
                <div className="flex flex-wrap gap-2">
                  {script.focus_words.map((word, index) => (
                    <span key={index} className="px-4 py-2 rounded-full bg-primary/10 text-primary font-medium text-sm">
                      {word}
                    </span>
                  ))}
                </div>
              </motion.div>
            </div>
          ) : (
            <div className="space-y-4">
              {script.round_phrases.map((phrase, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="group p-5 rounded-2xl bg-card border border-border hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-primary">{index + 1}</span>
                    </div>
                    <p className="flex-1 text-foreground leading-relaxed pt-1">{phrase}</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyToClipboard(phrase, index)}
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      {copiedIndex === index ? <Check className="w-4 h-4 text-accent" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Fixed bottom CTA */}
      <div className="fixed bottom-0 inset-x-0 p-6 bg-gradient-to-t from-background via-background to-transparent">
        <div className="max-w-3xl mx-auto">
          <Button
            size="lg"
            onClick={onStartSession}
            className="w-full h-14 text-lg gap-3 rounded-2xl bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity shadow-lg shadow-primary/25"
          >
            <Play className="w-5 h-5" />
            EFT 세션 시작하기
            <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Bottom padding for fixed button */}
      <div className="h-32" />
    </div>
  )
}
