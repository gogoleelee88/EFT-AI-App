import React, { useState, useEffect } from 'react';
import Button from '../ui/Button';

interface PWAInstallPromptProps {
  className?: string;
}

const PWAInstallPrompt: React.FC<PWAInstallPromptProps> = ({ className = '' }) => {
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // 이미 설치된 앱인지 확인
    const checkIfInstalled = () => {
      // PWA가 이미 설치되어 있는지 확인
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
        setIsInstalled(true);
        return true;
      }
      
      // iOS Safari에서 홈화면에 추가되었는지 확인
      if ((window.navigator as any).standalone === true) {
        setIsInstalled(true);
        return true;
      }
      
      return false;
    };

    if (checkIfInstalled()) {
      return;
    }

    // 설치 가능한 이벤트 리스너
    const handleInstallPrompt = () => {
      setIsInstallable(true);
    };

    window.addEventListener('app-install-available', handleInstallPrompt);

    return () => {
      window.removeEventListener('app-install-available', handleInstallPrompt);
    };
  }, []);

  const handleInstallClick = () => {
    if ((window as any).promptAppInstall) {
      (window as any).promptAppInstall();
      setIsInstallable(false);
    }
  };

  // 이미 설치되었거나 설치 불가능한 경우 렌더링하지 않음
  if (isInstalled || !isInstallable) {
    return null;
  }

  return (
    <div className={`bg-gradient-to-r from-emerald-500 to-teal-600 text-white p-4 rounded-xl border border-emerald-200 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            <span className="text-xl">📱</span>
            <span className="font-bold text-sm">앱으로 설치하기</span>
          </div>
          <p className="text-xs opacity-90 leading-relaxed">
            홈화면에 추가하여 더 빠르고 편리하게 이용하세요!
          </p>
        </div>
        <div className="ml-4 flex space-x-2">
          <Button
            size="sm"
            onClick={handleInstallClick}
            className="bg-white text-emerald-600 hover:bg-emerald-50 font-medium px-4 py-2 text-xs"
          >
            설치하기
          </Button>
          <button
            onClick={() => setIsInstallable(false)}
            className="text-white hover:text-emerald-100 p-1"
          >
            <span className="text-sm">✕</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PWAInstallPrompt;