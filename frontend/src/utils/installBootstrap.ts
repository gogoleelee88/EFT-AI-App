import { buildApkDownloadUrl } from "./apkDownload";

export type InstallChannel =
  | "apk"
  | "play_store"
  | "firebase_app_distribution"
  | "internal_app_sharing"
  | "unknown";

export type InstallBootstrap = {
  platform: "android";
  channel: InstallChannel;
  installUrl: string;
  fallbackUrl: string;
  qrPayload: string;
  versionName: string | null;
  versionCode: string | null;
  buildId: string | null;
  updatedAt: string | null;
  minSupportedVersion: string | null;
  releaseNotes: string | null;
  source: "manifest" | "fallback";
};

type InstallManifestPlatformEntry = {
  channel?: string | null;
  install_url?: string | null;
  fallback_url?: string | null;
  qr_payload?: string | null;
  version_name?: string | number | null;
  version_code?: string | number | null;
  build_id?: string | number | null;
  updated_at?: string | null;
  min_supported_version?: string | null;
  release_notes?: string | null;
};

type InstallManifest = {
  android?: InstallManifestPlatformEntry | null;
};

const DEFAULT_INSTALL_MANIFEST_PATH = "/install-manifest.json";
const DEFAULT_INSTALL_QR_LANDING_PATH = "/install/android";

const getBuildToken = (): string => {
  if (typeof __BUILD_ID__ !== "undefined" && __BUILD_ID__) {
    return String(__BUILD_ID__);
  }
  return "dev";
};

const toTrimmedString = (value: unknown): string => {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
};

const toNullableString = (value: unknown): string | null => {
  const normalized = toTrimmedString(value);
  return normalized ? normalized : null;
};

const hasExplicitScheme = (value: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(value);

const isRelativePath = (value: string): boolean =>
  value.startsWith("/") || value.startsWith("./") || value.startsWith("../");

const absolutizeUrl = (rawUrl: string): string => {
  const normalized = rawUrl.trim();
  if (!normalized) return "";
  if (typeof window === "undefined") {
    return normalized;
  }
  try {
    return new URL(normalized, window.location.origin).toString();
  } catch {
    return normalized;
  }
};

const withBuildToken = (rawUrl: string): string => {
  const normalized = rawUrl.trim();
  if (!normalized) return "";
  if (typeof window === "undefined") {
    return normalized;
  }
  try {
    const target = new URL(normalized, window.location.origin);
    if (target.searchParams.has("v")) {
      return target.toString();
    }
    target.searchParams.set("v", getBuildToken());
    return target.toString();
  } catch {
    const separator = normalized.includes("?") ? "&" : "?";
    return `${normalized}${separator}v=${encodeURIComponent(getBuildToken())}`;
  }
};

const normalizeInstallUrl = (rawUrl: string): string => {
  const normalized = rawUrl.trim();
  if (!normalized) return "";
  if (/\.apk(?:$|\?)/i.test(normalized) || /\/latest\.apk(?:$|\?)/i.test(normalized)) {
    return buildApkDownloadUrl(normalized);
  }
  return absolutizeUrl(normalized);
};

const normalizeQrPayload = (rawValue: string, fallbackValue: string): string => {
  const normalized = rawValue.trim();
  if (!normalized) {
    return fallbackValue;
  }
  if (/\.apk(?:$|\?)/i.test(normalized) || /\/latest\.apk(?:$|\?)/i.test(normalized)) {
    return buildApkDownloadUrl(normalized);
  }
  if (isRelativePath(normalized)) {
    return absolutizeUrl(normalized);
  }
  if (hasExplicitScheme(normalized)) {
    return normalized;
  }
  return normalized;
};

const inferChannel = (rawChannel: string, installUrl: string): InstallChannel => {
  const channel = rawChannel.trim().toLowerCase();
  if (channel === "apk") return "apk";
  if (channel === "play_store") return "play_store";
  if (channel === "firebase_app_distribution") return "firebase_app_distribution";
  if (channel === "internal_app_sharing") return "internal_app_sharing";
  if (installUrl.includes("play.google.com")) return "play_store";
  if (installUrl.includes("appdistribution.firebase.dev")) return "firebase_app_distribution";
  if (installUrl.includes("internal-app-sharing")) return "internal_app_sharing";
  if (/\.apk(?:$|\?)/i.test(installUrl) || /\/latest\.apk(?:$|\?)/i.test(installUrl)) {
    return "apk";
  }
  return "unknown";
};

const resolveFallbackRawInstallUrl = (): string => {
  if (typeof window === "undefined") {
    return "";
  }
  return (
    import.meta.env.VITE_APP_INSTALL_URL ||
    import.meta.env.VITE_PLAY_STORE_URL ||
    import.meta.env.VITE_DIRECT_APK_URL ||
    `${window.location.origin.replace(/\/+$/, "")}/latest.apk`
  );
};

const resolveFallbackRawQrPayload = (installUrl: string): string => {
  if (import.meta.env.VITE_INTERNAL_TEST_QR_URL) {
    return import.meta.env.VITE_INTERNAL_TEST_QR_URL;
  }
  if (typeof window === "undefined") {
    return installUrl;
  }
  return `${window.location.origin.replace(/\/+$/, "")}${
    import.meta.env.VITE_INSTALL_QR_LANDING_URL || DEFAULT_INSTALL_QR_LANDING_PATH
  }`;
};

export const getFallbackInstallBootstrap = (): InstallBootstrap => {
  const installUrl = normalizeInstallUrl(resolveFallbackRawInstallUrl());
  const fallbackUrl = normalizeInstallUrl(
    import.meta.env.VITE_DIRECT_APK_URL ||
      (typeof window !== "undefined"
        ? `${window.location.origin.replace(/\/+$/, "")}/latest.apk`
        : installUrl)
  );
  const qrPayload = normalizeQrPayload(resolveFallbackRawQrPayload(installUrl), installUrl);
  const versionName = toNullableString(import.meta.env.VITE_ANDROID_VERSION_NAME);
  const versionCode = toNullableString(import.meta.env.VITE_ANDROID_VERSION_CODE);

  return {
    platform: "android",
    channel: inferChannel(import.meta.env.VITE_INSTALL_CHANNEL || "", installUrl),
    installUrl,
    fallbackUrl: fallbackUrl || installUrl,
    qrPayload: qrPayload || installUrl,
    versionName,
    versionCode,
    buildId: getBuildToken(),
    updatedAt: null,
    minSupportedVersion: null,
    releaseNotes: null,
    source: "fallback",
  };
};

export const resolveInstallBootstrapFromManifest = (
  manifest: InstallManifest | null | undefined,
  fallback = getFallbackInstallBootstrap()
): InstallBootstrap => {
  const entry = manifest?.android;
  if (!entry) {
    return fallback;
  }

  const installUrl = normalizeInstallUrl(toTrimmedString(entry.install_url) || fallback.installUrl);
  const fallbackUrl = normalizeInstallUrl(toTrimmedString(entry.fallback_url) || fallback.fallbackUrl);
  const qrPayload = normalizeQrPayload(
    toTrimmedString(entry.qr_payload) || installUrl,
    installUrl || fallback.qrPayload
  );

  return {
    platform: "android",
    channel: inferChannel(toTrimmedString(entry.channel), installUrl),
    installUrl: installUrl || fallback.installUrl,
    fallbackUrl: fallbackUrl || fallback.fallbackUrl,
    qrPayload: qrPayload || installUrl || fallback.qrPayload,
    versionName: toNullableString(entry.version_name) ?? fallback.versionName,
    versionCode: toNullableString(entry.version_code) ?? fallback.versionCode,
    buildId: toNullableString(entry.build_id) ?? fallback.buildId,
    updatedAt: toNullableString(entry.updated_at),
    minSupportedVersion: toNullableString(entry.min_supported_version),
    releaseNotes: toNullableString(entry.release_notes),
    source: "manifest",
  };
};

export const getInstallManifestUrl = (): string => {
  const rawManifestUrl = import.meta.env.VITE_INSTALL_MANIFEST_URL || DEFAULT_INSTALL_MANIFEST_PATH;
  return withBuildToken(rawManifestUrl);
};

export const loadInstallBootstrap = async (): Promise<{
  bootstrap: InstallBootstrap;
  warning: string | null;
}> => {
  const fallback = getFallbackInstallBootstrap();

  if (typeof window === "undefined" || typeof fetch === "undefined") {
    return { bootstrap: fallback, warning: null };
  }

  try {
    const response = await fetch(getInstallManifestUrl(), {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`install_manifest_http_${response.status}`);
    }

    const manifest = (await response.json()) as InstallManifest;
    return {
      bootstrap: resolveInstallBootstrapFromManifest(manifest, fallback),
      warning: null,
    };
  } catch (error) {
    console.warn("install bootstrap fallback", error);
    return {
      bootstrap: fallback,
      warning: "Install metadata could not be refreshed. Using the fallback install link.",
    };
  }
};

export const getInstallPrimaryLabel = (channel: InstallChannel): string => {
  switch (channel) {
    case "play_store":
      return "Open Play Store";
    case "firebase_app_distribution":
      return "Open test build";
    case "internal_app_sharing":
      return "Open Android test link";
    case "apk":
      return "Download Android APK";
    default:
      return "Open install link";
  }
};

export const getInstallChannelLabel = (channel: InstallChannel): string => {
  switch (channel) {
    case "play_store":
      return "Play Store";
    case "firebase_app_distribution":
      return "Firebase App Distribution";
    case "internal_app_sharing":
      return "Internal App Sharing";
    case "apk":
      return "Direct APK";
    default:
      return "Install link";
  }
};
