export {};

declare global {
  interface Window {
    // ==================== PWA 설치 ====================
    promptAppInstall?: () => Promise<boolean>;
    
    // ==================== 푸시 알림 ====================
    requestNotificationPermission?: () => Promise<NotificationPermission | 'unsupported'>;
    subscribePush?: () => Promise<PushSubscription | null>;
    unsubscribePush?: () => Promise<boolean>;
    
    // ==================== 개발 관련 ====================
    // 개발용 전역 유틸리티들 (필요시 추가)
  }
  
  // ==================== 커스텀 이벤트 ====================
  interface WindowEventMap {
    'app:hydrated': Event;
    'app-install-available': CustomEvent;
  }
}