import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/Button";
import useInstallPrompt from "../../hooks/useInstallPrompt";

interface AlarmInstallGuideProps {
  title?: string;
  description?: string;
  className?: string;
  installUrl?: string;
  showDismiss?: boolean;
  onDismiss?: () => void;
}

export default function AlarmInstallGuide({
  title = "알람 기능은 앱에서 안정적으로 사용해요",
  description = "웹에서는 알람 푸시 연동이 브라우저별로 제한될 수 있어요. 앱을 설치하면 알람이 더 정확하게 동작합니다.",
  className = "",
  installUrl,
  showDismiss = false,
  onDismiss,
}: AlarmInstallGuideProps) {
  const { supported, promptInstall } = useInstallPrompt();
  const [copied, setCopied] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  const targetUrl = useMemo(
    () => installUrl || (typeof window !== "undefined" ? window.location.origin : ""),
    [installUrl]
  );

  const qrUrl = useMemo(
    () =>
      targetUrl
        ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=1&format=png&data=${encodeURIComponent(
            targetUrl
          )}`
        : "",
    [targetUrl]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const mediaQueryMatch = window.matchMedia("(display-mode: standalone)").matches;
    const iosStandalone = (window.navigator as any).standalone === true;
    setIsInstalled(mediaQueryMatch || iosStandalone);
  }, []);

  const handleInstall = async () => {
    if (!supported) return;
    setInstalling(true);
    try {
      await promptInstall();
    } finally {
      setInstalling(false);
    }
  };

  const handleCopy = async () => {
    if (!targetUrl || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      console.error("QR URL copy failed:", error);
    }
  };

  if (isInstalled) {
    return null;
  }

  return (
    <div
      className={`rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 p-4 ${className}`}
    >
      {showDismiss && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            닫기
          </button>
        </div>
      )}
      <h4 className="text-sm font-bold text-gray-900">{title}</h4>
      <p className="mt-1 text-xs leading-relaxed text-gray-700">{description}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {supported && (
          <Button size="sm" onClick={handleInstall} className="bg-amber-600 hover:bg-amber-700" disabled={installing}>
            {installing ? "설치 시도 중..." : "지금 앱으로 설치"}
          </Button>
        )}
        {!supported && targetUrl && (
          <a
            href={targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded border border-amber-300 bg-white px-3 py-2 text-xs text-amber-800 hover:bg-amber-100"
          >
            현재 링크로 접속
          </a>
        )}
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center rounded border border-amber-300 bg-white px-3 py-2 text-xs text-gray-700 hover:bg-amber-100"
        >
          {copied ? "복사됨" : "URL 복사"}
        </button>
      </div>

      {qrUrl && (
        <div className="mt-3 flex items-center gap-3">
          <img src={qrUrl} alt="앱 설치 QR" className="h-28 w-28 rounded border bg-white" />
          <div className="text-xs text-gray-700">
            휴대폰으로 QR을 찍어 현재 페이지를 열어주세요.
            <br />
            홈 화면 추가(설치) 또는 앱 설치 버튼을 눌러 주세요.
          </div>
        </div>
      )}
    </div>
  );
}
