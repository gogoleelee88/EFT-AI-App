import { useState, useEffect } from "react"
import { Moon, Sun } from "lucide-react"

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark")
    }
    return false
  })

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark")
      localStorage.setItem("theme", "dark")
    } else {
      document.documentElement.classList.remove("dark")
      localStorage.setItem("theme", "light")
    }
  }, [isDark])

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme")
    if (savedTheme === "dark") {
      setIsDark(true)
    } else if (savedTheme === "light") {
      setIsDark(false)
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setIsDark(true)
    }
  }, [])

  return (
    <button
      onClick={() => setIsDark(!isDark)}
      className="w-10 h-10 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition-colors"
      aria-label="Toggle theme"
    >
      {isDark ? <Sun className="w-5 h-5 text-foreground" /> : <Moon className="w-5 h-5 text-foreground" />}
    </button>
  )
}
