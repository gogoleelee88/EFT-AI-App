import { useRef } from "react";

export default function MoodBubble() {
  const bubbleRef = useRef<HTMLDivElement | null>(null);

  // 💥 파티클(조각) 생성
  const createBurst = (x: number, y: number) => {
    const particleCount = 30;
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement("div");
      particle.className = "mood-bubble-particle";
      document.body.appendChild(particle);

      const size = Math.random() * 10 + 5;
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;

      const destX = (Math.random() - 0.5) * 400;
      const destY = (Math.random() - 0.5) * 400;

      const animation = particle.animate(
        [
          { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
          { transform: `translate(${destX}px, ${destY}px) scale(0)`, opacity: 0 },
        ],
        {
          duration: Math.random() * 500 + 300,
          easing: "cubic-bezier(0, .9, .57, 1)",
          fill: "forwards",
        }
      );

      animation.onfinish = () => particle.remove();
    }
  };

  // 🫧 클릭 시 "톡!" + 파티클 + 숨었다가 다시 떠오르기
  const handleBubbleClick = () => {
    const bubble = bubbleRef.current;
    if (!bubble) return;

    const rect = bubble.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // "톡!" 텍스트
    const popText = document.createElement("div");
    popText.className = "mood-bubble-pop-text";
    popText.textContent = "톡!";
    popText.style.left = `${centerX}px`;
    popText.style.top = `${centerY}px`;
    popText.style.transform = "translate(-50%, -50%)";
    document.body.appendChild(popText);

    const textAnimation = popText.animate(
      [
        { transform: "translate(-50%, -50%) scale(0.5)", opacity: 1 },
        { transform: "translate(-50%, -100px) scale(1.5)", opacity: 0 },
      ],
      {
        duration: 600,
        easing: "ease-out",
        fill: "forwards",
      }
    );

    textAnimation.onfinish = () => popText.remove();

    // 조각 터지는 효과
    createBurst(centerX, centerY);

    // 비눗방울 숨기고, 1.5초 뒤 다시 나타나면서 애니메이션 리셋
    bubble.style.display = "none";
    setTimeout(() => {
      bubble.style.display = "block";
      bubble.style.animation = "none";
      // 강제 리플로우
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      bubble.offsetHeight;
      bubble.style.animation = "mood-bubble-float 6s ease-in-out infinite";
    }, 1500);
  };

  return (
    <div
      className="mood-bubble"
      ref={bubbleRef}
      onClick={handleBubbleClick}
    >
      <div className="mood-bubble-text">Mood</div>
    </div>
  );
}
