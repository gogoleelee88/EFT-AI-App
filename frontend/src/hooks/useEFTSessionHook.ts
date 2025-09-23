import { useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

interface EFTSessionData {
  sessionId: string;
  startTime: string;
  technique: string;
  presuds?: number;
}

interface UseEFTSessionHookProps {
  onEFTComplete?: (sessionData: EFTSessionData) => void;
  onAutoSUDS?: (measurementType: 'post', context: string) => void;
}

interface UseEFTSessionHookReturn {
  startEFTSession: (technique: string, presuds?: number) => void;
  completeEFTSession: (sessionData?: Partial<EFTSessionData>) => void;
  getCurrentSession: () => EFTSessionData | null;
  isEFTInProgress: () => boolean;
}

/**
 * EFT 세션 생명주기 관리 및 자동 SUDS 측정 훅
 *
 * 기능:
 * 1. EFT 세션 시작/종료 추적
 * 2. EFT 종료 시 자동 Post-SUDS 측정 트리거
 * 3. 브라우저 뒤로가기 감지로 세션 중단 처리
 * 4. 세션 데이터 로컬 스토리지 관리
 */
export const useEFTSessionHook = ({
  onEFTComplete,
  onAutoSUDS
}: UseEFTSessionHookProps = {}): UseEFTSessionHookReturn => {
  const navigate = useNavigate();
  const location = useLocation();

  const EFT_SESSION_KEY = 'eft_current_session';

  // EFT 세션 시작
  const startEFTSession = useCallback((technique: string, presuds?: number) => {
    const sessionData: EFTSessionData = {
      sessionId: `eft_${Date.now()}`,
      startTime: new Date().toISOString(),
      technique,
      presuds
    };

    // 로컬 스토리지에 세션 저장
    localStorage.setItem(EFT_SESSION_KEY, JSON.stringify(sessionData));

    console.log('EFT 세션 시작:', sessionData);
  }, []);

  // EFT 세션 완료
  const completeEFTSession = useCallback((additionalData: Partial<EFTSessionData> = {}) => {
    const currentSession = getCurrentSession();
    if (!currentSession) {
      console.warn('완료할 EFT 세션이 없습니다.');
      return;
    }

    const completedSession: EFTSessionData = {
      ...currentSession,
      ...additionalData
    };

    // 세션 완료 콜백 실행
    onEFTComplete?.(completedSession);

    // 자동 Post-SUDS 측정 트리거
    if (onAutoSUDS) {
      const context = `eft_complete_${completedSession.technique}`;
      setTimeout(() => {
        onAutoSUDS('post', context);
      }, 500); // UI 전환 후 약간의 딜레이
    }

    // 로컬 스토리지에서 세션 제거
    localStorage.removeItem(EFT_SESSION_KEY);

    console.log('EFT 세션 완료:', completedSession);
  }, [onEFTComplete, onAutoSUDS]);

  // 현재 세션 조회
  const getCurrentSession = useCallback((): EFTSessionData | null => {
    try {
      const sessionData = localStorage.getItem(EFT_SESSION_KEY);
      return sessionData ? JSON.parse(sessionData) : null;
    } catch (error) {
      console.error('EFT 세션 데이터 파싱 오류:', error);
      localStorage.removeItem(EFT_SESSION_KEY);
      return null;
    }
  }, []);

  // EFT 진행 중 여부 확인
  const isEFTInProgress = useCallback((): boolean => {
    return getCurrentSession() !== null;
  }, [getCurrentSession]);

  // EFT 페이지 감지 및 자동 세션 관리
  useEffect(() => {
    const currentPath = location.pathname;
    const isEFTPage = currentPath.includes('/ar-holistic') ||
                     currentPath.includes('/eft') ||
                     currentPath.includes('/breathing');

    if (isEFTPage) {
      // EFT 페이지 진입 시 세션이 없으면 자동 시작
      if (!getCurrentSession()) {
        const technique = currentPath.includes('holistic') ? 'ar_holistic' :
                         currentPath.includes('breathing') ? 'breathing' : 'basic_eft';
        startEFTSession(technique);
      }
    } else {
      // EFT 페이지 이탈 시 진행 중인 세션이 있으면 자동 완료
      const currentSession = getCurrentSession();
      if (currentSession) {
        console.log('EFT 페이지 이탈 감지 - 세션 자동 완료');
        completeEFTSession();
      }
    }
  }, [location.pathname, getCurrentSession, startEFTSession, completeEFTSession]);

  // 브라우저 뒤로가기/앞으로가기 감지
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const currentSession = getCurrentSession();
      if (currentSession) {
        // 브라우저 네비게이션으로 EFT 페이지를 벗어날 때
        console.log('브라우저 네비게이션으로 EFT 세션 중단');
        completeEFTSession();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [getCurrentSession, completeEFTSession]);

  // 페이지 언로드 시 세션 정리 (브라우저 종료, 새로고침 등)
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const currentSession = getCurrentSession();
      if (currentSession) {
        // 브라우저 종료/새로고침 시 경고 (선택사항)
        event.preventDefault();
        event.returnValue = 'EFT 세션이 진행 중입니다. 정말 페이지를 벗어나시겠습니까?';

        // 세션 완료 처리
        completeEFTSession();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [getCurrentSession, completeEFTSession]);

  return {
    startEFTSession,
    completeEFTSession,
    getCurrentSession,
    isEFTInProgress
  };
};

// EFT 세션 컨텍스트용 헬퍼 (선택사항)
export const getEFTTechniqueName = (technique: string): string => {
  const techniqueNames: Record<string, string> = {
    'ar_holistic': 'AR 홀리스틱 EFT',
    'basic_eft': '기본 EFT 탭핑',
    'breathing': '호흡 운동',
    'advanced_eft': '고급 EFT 기법'
  };

  return techniqueNames[technique] || technique;
};

// EFT 완료 시 자동 SUDS 토큰 생성 헬퍼
export const createPostSUDSToken = (technique: string, sessionId: string): string => {
  const prompt = `${getEFTTechniqueName(technique)} 세션을 완료하셨습니다! 이제 세션 후 스트레스 수준을 측정해주세요.`;
  const context = `eft_complete_${technique}`;

  return `[ask_suds: {"measurement_type":"post","prompt_message":"${prompt}","context":"${context}","priority":5}]`;
};

export default useEFTSessionHook;