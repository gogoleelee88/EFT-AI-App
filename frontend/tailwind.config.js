/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // 피그마 디자인 완성 후 색상/간격 추가 예정
    },
  },
  plugins: [
    require('@tailwindcss/typography')
  ],
}