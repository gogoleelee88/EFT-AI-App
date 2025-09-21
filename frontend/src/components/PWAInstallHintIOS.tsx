import { useEffect, useState } from "react";

export default function PWAInstallHintIOS() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = (window.navigator as any).standalone === true;
    if (isIOS && !isStandalone) setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 max-w-sm w-[90%] p-3 bg-white/90 backdrop-blur border rounded-xl shadow-lg z-50">
      <p className="text-sm text-gray-800">
        iOS에서는 설치 배너가 보이지 않아요. <b>공유</b> 버튼을 눌러 <b>홈 화면에 추가</b>를 선택해 설치하세요.
      </p>
      <button
        className="mt-2 text-xs text-blue-600 hover:text-blue-800"
        onClick={() => setShow(false)}
      >
        닫기
      </button>
    </div>
  );
}