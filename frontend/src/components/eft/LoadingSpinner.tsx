import { motion } from "framer-motion"
import { Sparkles } from "lucide-react"

const BRAND_COLOR = "#fd6f22"

export function LoadingSpinner() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6">
      <motion.div
        className="relative w-20 h-20"
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(from 0deg, transparent, ${BRAND_COLOR})`,
            mask: "radial-gradient(farthest-side, transparent calc(100% - 4px), black calc(100% - 4px))",
            WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 4px), black calc(100% - 4px))",
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <Sparkles className="w-8 h-8" style={{ color: BRAND_COLOR }} />
        </div>
      </motion.div>
      <motion.p
        className="text-lg text-muted-foreground"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
      >
        ¤l½¸ Ý1 ...
      </motion.p>
    </div>
  )
}
