interface CountdownProps {
  count: number;
  isVisible: boolean;
}

export default function Countdown({ count, isVisible }: CountdownProps) {
  if (!isVisible || count <= 0) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
      <div className="relative">
        {/* 배경 원 */}
        <div className="w-32 h-32 bg-black bg-opacity-80 rounded-full flex items-center justify-center">
          {/* 카운트다운 숫자 */}
          <span className="text-6xl font-bold text-white select-none">
            {count}
          </span>
        </div>
        
        {/* 펄스 애니메이션 */}
        <div className="absolute inset-0 w-32 h-32 border-4 border-blue-500 rounded-full animate-ping opacity-75"></div>
      </div>
    </div>
  );
}