const APP_VERSION_FALLBACK_TOKEN = "dev";

const getBuildToken = (): string => {
  if (typeof __BUILD_ID__ !== "undefined" && __BUILD_ID__) {
    return String(__BUILD_ID__);
  }
  return APP_VERSION_FALLBACK_TOKEN;
};

export const buildApkDownloadUrl = (rawUrl: string): string => {
  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl) {
    return "";
  }
  if (typeof window === "undefined") {
    return trimmedUrl;
  }
  try {
    const target = new URL(trimmedUrl, window.location.origin);
    if (target.searchParams.has("v")) {
      return target.href;
    }
    target.searchParams.set("v", getBuildToken());
    return target.toString();
  } catch {
    const separator = trimmedUrl.includes("?") ? "&" : "?";
    return `${trimmedUrl}${separator}v=${encodeURIComponent(getBuildToken())}`;
  }
};
