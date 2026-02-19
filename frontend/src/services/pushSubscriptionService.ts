export interface PushSetupResult {
  ok: boolean;
  reason?: string;
}

const ENV_VAPID_PUBLIC_KEY = (import.meta.env.VITE_WEBPUSH_VAPID_PUBLIC_KEY || "").trim();
let cachedServerVapidPublicKey: string | null = null;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function ensureServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) {
    return navigator.serviceWorker.ready;
  }
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

async function loadVapidPublicKey(): Promise<string> {
  if (ENV_VAPID_PUBLIC_KEY) {
    return ENV_VAPID_PUBLIC_KEY;
  }
  if (cachedServerVapidPublicKey) {
    return cachedServerVapidPublicKey;
  }

  const response = await fetch("/api/push/vapid-public-key", {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`failed to load VAPID key (${response.status})`);
  }

  const payload = (await response.json()) as {
    ok?: boolean;
    error?: string;
    public_key?: string;
  };
  const key = String(payload.public_key || "").trim();
  if (!key) {
    throw new Error(payload.error || "WEBPUSH_VAPID_PUBLIC_KEY is not configured");
  }
  cachedServerVapidPublicKey = key;
  return key;
}

async function getOrCreateSubscription(
  registration: ServiceWorkerRegistration,
  vapidPublicKey: string
): Promise<PushSubscription> {
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    return existing;
  }

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
}

async function sendSubscriptionToServer(subscription: PushSubscription, userId?: string): Promise<void> {
  const payload = {
    ...(subscription.toJSON() as Record<string, unknown>),
    user_id: userId || undefined,
  };
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw || `subscribe failed: ${response.status}`);
  }
}

export async function ensurePushReadyForAlarm(userId?: string): Promise<PushSetupResult> {
  if (!pushSupported()) {
    return {
      ok: false,
      reason: "This browser does not support push notifications.",
    };
  }

  let permission: NotificationPermission = Notification.permission;
  if (permission !== "granted") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    return {
      ok: false,
      reason: "Notification permission is required to save alarm.",
    };
  }

  try {
    const registration = await ensureServiceWorkerRegistration();
    const vapidPublicKey = await loadVapidPublicKey();

    if (registration.active) {
      registration.active.postMessage({ type: "SET_VAPID", key: vapidPublicKey });
    }

    const subscription = await getOrCreateSubscription(registration, vapidPublicKey);
    await sendSubscriptionToServer(subscription, userId);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `Push registration failed: ${error.message}`
          : "Push registration failed.",
    };
  }
}
