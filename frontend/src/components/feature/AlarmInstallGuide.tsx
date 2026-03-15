import { useEffect, useMemo, useState } from "react";
import { Download, QrCode, ShieldCheck, Smartphone } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";

import useInstallPrompt from "../../hooks/useInstallPrompt";
import {
  getInstallChannelLabel,
  getInstallPrimaryLabel,
  type InstallBootstrap,
} from "../../utils/installBootstrap";
import { Button } from "../ui/Button";

interface AlarmInstallGuideProps {
  title?: string;
  description?: string;
  className?: string;
  installUrl?: string;
  showDismiss?: boolean;
  onDismiss?: () => void;
  bootstrap?: InstallBootstrap | null;
  loading?: boolean;
  warning?: string | null;
}

const isStandalone = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
};

const isApkLikeUrl = (value: string): boolean =>
  /(?:\/latest\.apk(?:$|\?)|\.apk(?:$|\?))/i.test(value.trim());

export default function AlarmInstallGuide({
  title = "알람 기능은 앱에서 가장 안정적으로 동작합니다",
  description = "브라우저 제약이 있는 환경에서는 앱 설치 경로와 QR 경로를 함께 준비해 두는 편이 안전합니다.",
  className = "",
  installUrl,
  showDismiss = false,
  onDismiss,
  bootstrap,
  loading = false,
  warning,
}: AlarmInstallGuideProps) {
  const { supported, promptInstall } = useInstallPrompt();
  const [copied, setCopied] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const updateInstalledState = () => {
      setIsInstalled(isStandalone());
    };

    updateInstalledState();
    window.addEventListener("appinstalled", updateInstalledState);

    return () => {
      window.removeEventListener("appinstalled", updateInstalledState);
    };
  }, []);

  const resolvedInstallUrl = useMemo(
    () => (bootstrap?.installUrl ?? installUrl ?? "").trim(),
    [bootstrap?.installUrl, installUrl]
  );
  const fallbackInstallUrl = useMemo(
    () => (bootstrap?.fallbackUrl ?? resolvedInstallUrl).trim(),
    [bootstrap?.fallbackUrl, resolvedInstallUrl]
  );
  const qrValue = useMemo(
    () => (bootstrap?.qrPayload || resolvedInstallUrl || fallbackInstallUrl).trim(),
    [bootstrap?.qrPayload, fallbackInstallUrl, resolvedInstallUrl]
  );
  const copyValue = qrValue || resolvedInstallUrl || fallbackInstallUrl;
  const channel = bootstrap?.channel ?? (isApkLikeUrl(resolvedInstallUrl) ? "apk" : "unknown");
  const primaryLabel = bootstrap
    ? getInstallPrimaryLabel(channel)
    : isApkLikeUrl(resolvedInstallUrl)
      ? "APK 열기"
      : "설치 링크 열기";
  const channelLabel = bootstrap
    ? getInstallChannelLabel(channel)
    : isApkLikeUrl(resolvedInstallUrl)
      ? "Direct APK"
      : "Install link";
  const canPromptInstall =
    supported ||
    (typeof window !== "undefined" && typeof window.promptAppInstall === "function");
  const effectiveWarning =
    warning ??
    (!resolvedInstallUrl && !fallbackInstallUrl
      ? "설치 링크가 아직 준비되지 않았습니다. 환경변수 또는 설치 매니페스트를 확인해 주세요."
      : null);
  const metadataSummary = [
    bootstrap?.versionName ? `v${bootstrap.versionName}` : null,
    bootstrap?.buildId ? `build ${bootstrap.buildId}` : null,
    bootstrap?.updatedAt ? bootstrap.updatedAt : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const handleInstall = async () => {
    if (!canPromptInstall) {
      return;
    }

    setInstalling(true);
    try {
      if (typeof window !== "undefined" && typeof window.promptAppInstall === "function") {
        await window.promptAppInstall();
      } else {
        await promptInstall();
      }
    } finally {
      setInstalling(false);
    }
  };

  const handleCopy = async () => {
    if (!copyValue || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(copyValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      console.error("Failed to copy install link:", error);
    }
  };

  if (isInstalled || (bootstrap?.source === "manifest" && !resolvedInstallUrl && !fallbackInstallUrl)) {
    return null;
  }

  return (
    <div
      className={`rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-yellow-50 p-5 shadow-sm ${className}`}
    >
      {showDismiss && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs font-medium text-slate-500 transition hover:text-slate-700"
          >
            닫기
          </button>
        </div>
      )}

      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-slate-950">{title}</h4>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">
              {channelLabel}
            </span>
            {bootstrap?.source && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
                {bootstrap.source === "manifest" ? "Manifest" : "Fallback"}
              </span>
            )}
            {metadataSummary && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-800">
                {metadataSummary}
              </span>
            )}
          </div>
          {loading && (
            <p className="mt-3 text-xs text-slate-500">설치 메타데이터를 확인하는 중입니다.</p>
          )}
          {effectiveWarning && (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {effectiveWarning}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {canPromptInstall && (
          <Button
            size="sm"
            onClick={() => {
              void handleInstall();
            }}
            className="bg-amber-600 hover:bg-amber-700"
            disabled={installing}
          >
            {installing ? "설치 확인 중..." : "웹앱 설치"}
          </Button>
        )}

        {resolvedInstallUrl && (
          <a
            href={resolvedInstallUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100"
          >
            <Download className="h-4 w-4" />
            {primaryLabel}
          </a>
        )}

        {fallbackInstallUrl && fallbackInstallUrl !== resolvedInstallUrl && (
          <a
            href={fallbackInstallUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <ShieldCheck className="h-4 w-4" />
            대체 설치 경로
          </a>
        )}

        {copyValue && (
          <button
            type="button"
            onClick={() => {
              void handleCopy();
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <QrCode className="h-4 w-4" />
            {copied ? "복사됨" : "설치 링크 복사"}
          </button>
        )}
      </div>

      {qrValue && (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-100 bg-white/90 p-4 sm:flex-row sm:items-center">
          <div className="flex h-28 w-28 items-center justify-center rounded-2xl border border-slate-200 bg-white">
            <QRCodeCanvas value={qrValue} size={96} level="M" includeMargin />
          </div>
          <div className="min-w-0 flex-1 text-sm text-slate-600">
            <div className="font-medium text-slate-900">모바일에서 바로 여는 QR</div>
            <p className="mt-1 leading-6">
              휴대폰으로 QR을 스캔해 설치 경로를 바로 열 수 있습니다. 브라우저에서
              열기 어렵다면 설치 링크 복사 버튼을 함께 사용해 주세요.
            </p>
            <div className="mt-2 break-all text-xs text-slate-500">{qrValue}</div>
          </div>
        </div>
      )}
    </div>
  );
}
