export {};

declare global {
  interface EftRecoveryBridge {
    onStrictIntakeComplete?: (payload?: string) => void;
  }

  interface Window {
    promptAppInstall?: () => Promise<boolean>;
    requestNotificationPermission?: () => Promise<NotificationPermission | "unsupported">;
    subscribePush?: () => Promise<PushSubscription | null>;
    unsubscribePush?: () => Promise<boolean>;
    EftRecoveryBridge?: EftRecoveryBridge;
  }

  interface WindowEventMap {
    "app:hydrated": Event;
    "app-install-available": CustomEvent;
  }
}
