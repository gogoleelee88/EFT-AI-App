import { Link } from "react-router-dom";
import AlarmInstallGuide from "../components/feature/AlarmInstallGuide";
import { buildApkDownloadUrl } from "../utils/apkDownload";

const getAppInstallUrl = () => {
  if (typeof window === "undefined") {
    return "";
  }

  const raw =
    import.meta.env.VITE_APP_INSTALL_URL ||
    import.meta.env.VITE_DIRECT_APK_URL ||
    `${window.location.origin}/latest.apk`;
  return buildApkDownloadUrl(raw);
};

const playStoreUrl = import.meta.env.VITE_PLAY_STORE_URL || "";
const directApkUrl = import.meta.env.VITE_DIRECT_APK_URL || "";
const internalTestQrUrl = import.meta.env.VITE_INTERNAL_TEST_QR_URL || "";

const isApkLikeUrl = (url: string): boolean => {
  const normalized = url.toLowerCase();
  return normalized.includes(".apk") || normalized.includes("/latest.apk");
};

const resolveInternalTestQrUrl = (fallbackInstallUrl: string): string => {
  if (!internalTestQrUrl) {
    return fallbackInstallUrl;
  }

  const resolved = buildApkDownloadUrl(internalTestQrUrl);
  if (!isApkLikeUrl(resolved)) {
    return fallbackInstallUrl;
  }

  return resolved;
};

const getQrImage = (url: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=1&data=${encodeURIComponent(url)}`;

const SectionTitle = ({ title }: { title: string }) => (
  <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
);

const InstallGuidePage = () => {
  const appInstallUrl = getAppInstallUrl();
  const fallbackApkUrl = buildApkDownloadUrl(
    directApkUrl || (typeof window !== "undefined" ? `${window.location.origin}/latest.apk` : "")
  );
  const qrApkUrl = resolveInternalTestQrUrl(appInstallUrl);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-4 text-sm text-gray-500">
          <Link to="/" className="text-indigo-600 hover:underline">
            홈으로
          </Link>
        </div>

        <h1 className="text-2xl font-bold text-gray-900">앱 설치 안내</h1>
        <p className="mt-2 text-sm text-gray-600">
          안드로이드 APK 또는 Play Store에서 앱을 받아 설치하는 방법입니다. 아래 링크와 QR 코드를 통해
          최신 설치 파일을 내려받아 주세요.
        </p>

        <div className="mt-5">
          <AlarmInstallGuide
            title="직접 테스트를 위한 알림 앱 설치"
            description="현재 사용 중인 설치 URL을 기준으로, 기기에서 APK 또는 QR 복구를 진행할 수 있습니다."
            installUrl={appInstallUrl}
            className="bg-white"
          />
        </div>

        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
          <SectionTitle title="플레이 스토어 설치" />
          {playStoreUrl ? (
            <a
              href={playStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Play Store에서 설치하기
            </a>
          ) : (
            <p className="mt-3 text-sm text-gray-600">현재 Play Store 링크가 설정되어 있지 않습니다.</p>
          )}
        </section>

        <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <SectionTitle title="대체 APK QR 다운로드" />
          <p className="mt-3 break-all text-xs text-gray-600">
            현재 QR 대상 URL: <code>{qrApkUrl || "(없음)"}</code>
          </p>
          {qrApkUrl ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-gray-700">APK 링크가 유효한 경우 QR로도 바로 설치할 수 있습니다.</p>
              <a
                href={qrApkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                APK QR 링크 열기
              </a>
              <div>
                <img
                  src={getQrImage(qrApkUrl)}
                  alt="APK QR"
                  className="h-44 w-44 rounded border bg-white"
                />
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-600">현재 APK QR 링크가 설정되어 있지 않습니다.</p>
          )}
        </section>

        <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <SectionTitle title="폴백 다운로드 APK" />
          <p className="mt-3 text-sm text-gray-700">
            Play Store 접속이 어려운 경우 아래 APK로 직접 받아 설치할 수 있습니다.
          </p>
          {fallbackApkUrl ? (
            <a
              href={fallbackApkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex rounded bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
            >
              APK 직접 다운로드
            </a>
          ) : (
            <p className="mt-3 text-sm text-gray-600">현재 APK 링크가 설정되어 있지 않습니다.</p>
          )}
        </section>

        <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <SectionTitle title="안내" />
          <ul className="mt-3 space-y-2 text-sm text-gray-700 list-disc list-inside">
            <li>iOS: Safari에서는 앱 설치가 지원되지 않습니다.</li>
            <li>Android: Chrome 또는 기본 브라우저에서 링크를 열어주세요.</li>
            <li>설치가 완료되면 안내 메시지를 따라 앱을 실행하세요.</li>
            <li>설치 실패가 반복되면 QR 이미지 파일을 새로고침해 다시 시도해 주세요.</li>
          </ul>
        </section>
      </div>
    </div>
  );
};

export default InstallGuidePage;
