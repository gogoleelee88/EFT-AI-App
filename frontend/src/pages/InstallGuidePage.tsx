import { Link } from "react-router-dom";
import AlarmInstallGuide from "../components/feature/AlarmInstallGuide";
import { buildApkDownloadUrl } from "../utils/apkDownload";

const getAppInstallUrl = () => {
  if (typeof window === "undefined") {
    return "";
  }

  const raw = (
    import.meta.env.VITE_APP_INSTALL_URL ||
    import.meta.env.VITE_DIRECT_APK_URL ||
    `${window.location.origin}/latest.apk`
  );
  return buildApkDownloadUrl(raw);
};

const playStoreUrl = import.meta.env.VITE_PLAY_STORE_URL || "";
const internalTestQrUrl = import.meta.env.VITE_INTERNAL_TEST_QR_URL || "";
const directApkUrl = import.meta.env.VITE_DIRECT_APK_URL || "";

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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-4 text-sm text-gray-500">
          <Link to="/" className="text-indigo-600 hover:underline">
            ← 메인으로
          </Link>
        </div>

        <h1 className="text-2xl font-bold text-gray-900">앱 설치 가이드</h1>
        <p className="mt-2 text-sm text-gray-600">
          알람/리마인더는 앱에서 가장 안정적으로 동작합니다.
          아래 배포 경로에서 본인 환경에 맞는 방법을 선택해 주세요.
        </p>

        <div className="mt-5">
          <AlarmInstallGuide
            title="이제 앱을 설치하고 알람/리마인더를 연동해 보세요"
            description="알람은 브라우저 제약이 많아서 앱에서 더 정확합니다. 설치 후 알람을 다시 만들어 보세요."
            installUrl={appInstallUrl}
            className="bg-white"
          />
        </div>

        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
          <SectionTitle title="플레이스토어 배포 앱" />
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
            <p className="mt-3 text-sm text-gray-600">아직 Play Store 링크가 등록되지 않았습니다.</p>
          )}
        </section>

        <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <SectionTitle title="내부 테스트용 APK 배포 QR" />
          {internalTestQrUrl ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-gray-700">테스트 링크를 열거나 QR을 스캔해 빌드를 받으세요.</p>
              <a
                href={internalTestQrUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                테스트 QR 링크 열기
              </a>
              <div>
                <img
                  src={getQrImage(internalTestQrUrl)}
                  alt="테스트 APK QR"
                  className="h-44 w-44 rounded border bg-white"
                />
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-600">아직 내부 테스트 QR 링크가 등록되지 않았습니다.</p>
          )}
        </section>

        <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <SectionTitle title="앱스토어 미등록 사용자용 대체 APK" />
          <p className="mt-3 text-sm text-gray-700">
            Play Store 노출이 되지 않는 경우 아래 APK를 직접 받아 설치할 수 있습니다.
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
            <p className="mt-3 text-sm text-gray-600">아직 대체 APK 링크가 등록되지 않았습니다.</p>
          )}
        </section>

        <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <SectionTitle title="요약" />
          <ul className="mt-3 space-y-2 text-sm text-gray-700 list-disc list-inside">
            <li>iOS: Safari 공유 → “홈 화면에 추가”</li>
            <li>Android: Chrome에서 “설치” 또는 “홈 화면에 추가”</li>
            <li>설치 후 앱에서 로그인하고 알람 설정을 다시 저장</li>
            <li>알람 미연결 시 브라우저 푸시 정책 때문에 전달이 제한될 수 있음</li>
          </ul>
        </section>
      </div>
    </div>
  );
};

export default InstallGuidePage;
