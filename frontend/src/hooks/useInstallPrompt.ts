import { useEffect, useState } from "react";

export default function useInstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      console.log('🎉 beforeinstallprompt 이벤트 발생!', e);
      e.preventDefault();           // 기본 배너 막고
      setDeferred(e);               // 이벤트 저장
      setSupported(true);
      console.log('✅ PWA 설치 버튼 활성화됨');
    };

    window.addEventListener("beforeinstallprompt", handler as any);
    console.log('📱 beforeinstallprompt 리스너 등록됨');

    return () => {
      window.removeEventListener("beforeinstallprompt", handler as any);
      console.log('🧹 beforeinstallprompt 리스너 정리됨');
    };
  }, []);

  const promptInstall = async () => {
    if (!deferred) return { outcome: "dismissed" as const };
    const res = await deferred.prompt(); // 반드시 사용자 제스처 안에서 호출!
    setDeferred(null);                   // 한 번 쓰면 보통 소멸
    return res;
  };

  return { supported, promptInstall };
}