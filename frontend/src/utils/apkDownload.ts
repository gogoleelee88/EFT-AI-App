const APP_VERSION_FALLBACK_TOKEN = "dev";

const getBuildToken = (): string => {
  if (typeof __BUILD_ID__ !== "undefined" && __BUILD_ID__) {
    return String(__BUILD_ID__);
  }
  return APP_VERSION_FALLBACK_TOKEN;
};

export const buildApkDownloadUrl = (rawUrl: string): string => {
  const url = rawUrl.trim();
  if (!url) {
    return "";
  }
  if (/\.apk(?:$|\?)/i.test(url)) return url;
  if (typeof window === "undefined") {
    return url;
  }
  try {
    const target = new URL(url, window.location.origin);
    if (target.searchParams.has("v")) {
      return target.href;
    }
    target.searchParams.set("v", getBuildToken());
    return target.toString();
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}v=${encodeURIComponent(getBuildToken())}`;
  }
};
