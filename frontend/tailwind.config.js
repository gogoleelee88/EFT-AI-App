/** @type {import('tailwindcss').Config} */
import typography from '@tailwindcss/typography'

export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // 브랜드 컬러
      colors: {
        brand: "#fd6f22",
        // v0 design system colors (OKLCH mapped to CSS variables)
        background: "oklch(var(--background) / <alpha-value>)",
        foreground: "oklch(var(--foreground) / <alpha-value>)",
        card: "oklch(var(--card) / <alpha-value>)",
        "card-foreground": "oklch(var(--card-foreground) / <alpha-value>)",
        primary: "oklch(var(--primary) / <alpha-value>)",
        "primary-foreground": "oklch(var(--primary-foreground) / <alpha-value>)",
        secondary: "oklch(var(--secondary) / <alpha-value>)",
        "secondary-foreground": "oklch(var(--secondary-foreground) / <alpha-value>)",
        muted: "oklch(var(--muted) / <alpha-value>)",
        "muted-foreground": "oklch(var(--muted-foreground) / <alpha-value>)",
        accent: "oklch(var(--accent) / <alpha-value>)",
        "accent-foreground": "oklch(var(--accent-foreground) / <alpha-value>)",
        border: "oklch(var(--border) / <alpha-value>)",
        input: "oklch(var(--input) / <alpha-value>)",
        ring: "oklch(var(--ring) / <alpha-value>)",
        // 일정관리(spec_loop) 모드 색 — S1
        spec: {
          100: "var(--spec-mode-100)",
          70: "var(--spec-mode-70)",
          40: "var(--spec-mode-40)",
        },
      },
      borderRadius: {
        "spec-card": "var(--spec-card-radius)",
      },
      boxShadow: {
        "spec-card": "var(--spec-card-shadow)",
      },
      // 폰트 패밀리
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "Geist Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      // 키프레임 애니메이션
      keyframes: {
        "neon-pulse": {
          "0%, 100%": {
            textShadow: "0 0 10px oklch(0.65 0.12 175), 0 0 20px oklch(0.65 0.12 175)",
          },
          "50%": {
            textShadow: "0 0 20px oklch(0.65 0.12 175), 0 0 30px oklch(0.65 0.12 175), 0 0 40px oklch(0.65 0.12 175)",
          },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "cp1": { "0%": { opacity: "1", transform: "translate(0,0) scale(1)" }, "100%": { opacity: "0", transform: "translate(35px,-50px) scale(0)" } },
        "cp2": { "0%": { opacity: "1", transform: "translate(0,0) scale(1)" }, "100%": { opacity: "0", transform: "translate(-35px,-50px) scale(0)" } },
        "cp3": { "0%": { opacity: "1", transform: "translate(0,0) scale(1)" }, "100%": { opacity: "0", transform: "translate(50px,-35px) scale(0)" } },
        "cp4": { "0%": { opacity: "1", transform: "translate(0,0) scale(1)" }, "100%": { opacity: "0", transform: "translate(-50px,-35px) scale(0)" } },
        "cp5": { "0%": { opacity: "1", transform: "translate(0,0) scale(1)" }, "100%": { opacity: "0", transform: "translate(25px,-55px) scale(0)" } },
        "cp6": { "0%": { opacity: "1", transform: "translate(0,0) scale(1)" }, "100%": { opacity: "0", transform: "translate(-25px,-55px) scale(0)" } },
        "cp7": { "0%": { opacity: "1", transform: "translate(0,0) scale(1)" }, "100%": { opacity: "0", transform: "translate(45px,-25px) scale(0)" } },
        "cp8": { "0%": { opacity: "1", transform: "translate(0,0) scale(1)" }, "100%": { opacity: "0", transform: "translate(-45px,-25px) scale(0)" } },
      },
      animation: {
        "neon-pulse": "neon-pulse 2s ease-in-out infinite",
        "fade-in-up": "fade-in-up 0.25s ease-out both",
        "cp1": "cp1 1s ease-out forwards",
        "cp2": "cp2 1s ease-out forwards",
        "cp3": "cp3 1s ease-out forwards",
        "cp4": "cp4 1s ease-out forwards",
        "cp5": "cp5 1s ease-out forwards",
        "cp6": "cp6 1s ease-out forwards",
        "cp7": "cp7 1s ease-out forwards",
        "cp8": "cp8 1s ease-out forwards",
      },
    },
  },
  plugins: [
    typography
  ],
}
