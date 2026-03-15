import { useMemo } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Link } from "react-router-dom";

import AlarmInstallGuide from "../components/feature/AlarmInstallGuide";
import { useInstallBootstrap } from "../hooks/useInstallBootstrap";
import {
  getFallbackInstallBootstrap,
  getInstallChannelLabel,
  getInstallPrimaryLabel,
} from "../utils/installBootstrap";

const SectionTitle = ({ title }: { title: string }) => (
  <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
);

const InstallGuidePage = () => {
  const { bootstrap, loading, warning } = useInstallBootstrap();
  const fallbackBootstrap = useMemo(() => getFallbackInstallBootstrap(), []);
  const currentBootstrap = loading ? fallbackBootstrap : bootstrap;
  const primaryInstallUrl =
    currentBootstrap.installUrl || currentBootstrap.fallbackUrl;
  const fallbackInstallUrl =
    currentBootstrap.fallbackUrl || currentBootstrap.installUrl;
  const qrValue = currentBootstrap.qrPayload || primaryInstallUrl;
  const playStoreUrl =
    currentBootstrap.channel === "play_store"
      ? currentBootstrap.installUrl
      : (import.meta.env.VITE_PLAY_STORE_URL || "").trim();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-4 text-sm text-gray-500">
          <Link to="/" className="text-indigo-600 hover:underline">
            홈으로
          </Link>
        </div>

        <h1 className="text-2xl font-bold text-gray-900">앱 설치 안내</h1>
        <p className="mt-2 text-sm text-gray-600">
          안드로이드 앱 설치 경로와 QR 정보를 한곳에서 확인할 수 있습니다.
          최신 설치 메타데이터가 있으면 우선 사용하고, 없으면 안전한 기본 경로로
          안내합니다.
        </p>

        <div className="mt-5">
          <AlarmInstallGuide
            title="알람 전달용 앱 설치"
            description="브라우저보다 앱 환경에서 알람 전달이 더 안정적입니다. 아래 링크나 QR을 사용해 설치를 이어가세요."
            bootstrap={currentBootstrap}
            loading={loading}
            warning={warning}
            className="bg-white"
          />
        </div>

        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
          <SectionTitle title="현재 배포 정보" />
          <div className="mt-3 space-y-2 text-sm text-gray-700">
            <p>
              채널:{" "}
              <span className="font-medium">
                {getInstallChannelLabel(currentBootstrap.channel)}
              </span>
            </p>
            <p>
              기본 링크:{" "}
              <code className="break-all">{primaryInstallUrl || "(없음)"}</code>
            </p>
            <p>
              메타데이터 소스:{" "}
              <span className="font-medium">
                {currentBootstrap.source === "manifest" ? "manifest" : "fallback"}
              </span>
            </p>
            {currentBootstrap.versionName && (
              <p>버전: {currentBootstrap.versionName}</p>
            )}
            {currentBootstrap.buildId && <p>빌드 ID: {currentBootstrap.buildId}</p>}
            {currentBootstrap.releaseNotes && (
              <p className="leading-6">릴리스 노트: {currentBootstrap.releaseNotes}</p>
            )}
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <SectionTitle title="기본 설치 경로" />
          {primaryInstallUrl ? (
            <a
              href={primaryInstallUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              {getInstallPrimaryLabel(currentBootstrap.channel)}
            </a>
          ) : (
            <p className="mt-3 text-sm text-gray-600">
              현재 설치 링크가 비어 있습니다.
            </p>
          )}
          {playStoreUrl && playStoreUrl !== primaryInstallUrl && (
            <a
              href={playStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 mt-3 inline-flex rounded border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              Play Store 열기
            </a>
          )}
        </section>

        <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <SectionTitle title="QR 설치 경로" />
          <p className="mt-3 break-all text-xs text-gray-600">
            현재 QR 대상: <code>{qrValue || "(없음)"}</code>
          </p>
          {qrValue ? (
            <div className="mt-3 space-y-3">
              <a
                href={qrValue}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                QR 대상 열기
              </a>
              <div className="inline-flex rounded border bg-white p-3">
                <QRCodeCanvas value={qrValue} size={180} level="M" includeMargin />
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-600">
              QR 대상 링크가 아직 준비되지 않았습니다.
            </p>
          )}
        </section>

        <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <SectionTitle title="대체 설치 경로" />
          {fallbackInstallUrl ? (
            <a
              href={fallbackInstallUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex rounded bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
            >
              대체 설치 링크 열기
            </a>
          ) : (
            <p className="mt-3 text-sm text-gray-600">
              대체 설치 경로가 준비되지 않았습니다.
            </p>
          )}
        </section>
      </div>
    </div>
  );
};

export default InstallGuidePage;
