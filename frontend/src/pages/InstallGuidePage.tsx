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
            ??硫붿씤?쇰줈
          </Link>
        </div>

        <h1 className="text-2xl font-bold text-gray-900">???ㅼ튂 媛?대뱶</h1>
        <p className="mt-2 text-sm text-gray-600">
          ?뚮엺/由щ쭏?몃뜑???깆뿉??媛???덉젙?곸쑝濡??숈옉?⑸땲??
          ?꾨옒 諛고룷 寃쎈줈?먯꽌 蹂몄씤 ?섍꼍??留욌뒗 諛⑸쾿???좏깮??二쇱꽭??
        </p>

        <div className="mt-5">
          <AlarmInstallGuide
            title="?댁젣 ?깆쓣 ?ㅼ튂?섍퀬 ?뚮엺/由щ쭏?몃뜑瑜??곕룞??蹂댁꽭??
            description="?뚮엺? 釉뚮씪?곗? ?쒖빟??留롮븘???깆뿉?????뺥솗?⑸땲?? ?ㅼ튂 ???뚮엺???ㅼ떆 留뚮뱾??蹂댁꽭??"
            installUrl={appInstallUrl}
            className="bg-white"
          />
        </div>

        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
          <SectionTitle title="?뚮젅?댁뒪?좎뼱 諛고룷 ?? />
          {playStoreUrl ? (
            <a
              href={playStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Play Store?먯꽌 ?ㅼ튂?섍린
            </a>
          ) : (
            <p className="mt-3 text-sm text-gray-600">?꾩쭅 Play Store 留곹겕媛 ?깅줉?섏? ?딆븯?듬땲??</p>
          )}
        </section>

        <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <SectionTitle title="?대? ?뚯뒪?몄슜 APK 諛고룷 QR" />
          {qrApkUrl ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-gray-700">?뚯뒪??留곹겕瑜??닿굅??QR???ㅼ틪??鍮뚮뱶瑜?諛쏆쑝?몄슂.</p>
              <a
                href={qrApkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                ?뚯뒪??QR 留곹겕 ?닿린
              </a>
              <div>
                <img
                  src={getQrImage(qrApkUrl)}
                  alt="?뚯뒪??APK QR"
                  className="h-44 w-44 rounded border bg-white"
                />
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-600">?꾩쭅 ?대? ?뚯뒪??QR 留곹겕媛 ?깅줉?섏? ?딆븯?듬땲??</p>
          )}
        </section>

        <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <SectionTitle title="?깆뒪?좎뼱 誘몃벑濡??ъ슜?먯슜 ?泥?APK" />
          <p className="mt-3 text-sm text-gray-700">
            Play Store ?몄텧???섏? ?딅뒗 寃쎌슦 ?꾨옒 APK瑜?吏곸젒 諛쏆븘 ?ㅼ튂?????덉뒿?덈떎.
          </p>
          {fallbackApkUrl ? (
            <a
              href={fallbackApkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex rounded bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
            >
              APK 吏곸젒 ?ㅼ슫濡쒕뱶
            </a>
          ) : (
            <p className="mt-3 text-sm text-gray-600">?꾩쭅 ?泥?APK 留곹겕媛 ?깅줉?섏? ?딆븯?듬땲??</p>
          )}
        </section>

        <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <SectionTitle title="?붿빟" />
          <ul className="mt-3 space-y-2 text-sm text-gray-700 list-disc list-inside">
            <li>iOS: Safari 怨듭쑀 ???쒗솃 ?붾㈃??異붽???/li>
            <li>Android: Chrome?먯꽌 ?쒖꽕移섃??먮뒗 ?쒗솃 ?붾㈃??異붽???/li>
            <li>?ㅼ튂 ???깆뿉??濡쒓렇?명븯怨??뚮엺 ?ㅼ젙???ㅼ떆 ???/li>
            <li>?뚮엺 誘몄뿰寃???釉뚮씪?곗? ?몄떆 ?뺤콉 ?뚮Ц???꾨떖???쒗븳?????덉쓬</li>
          </ul>
        </section>
      </div>
    </div>
  );
};

export default InstallGuidePage;
