import React, { useState } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../../firebase/config';
import Button from '../ui/Button';

interface LoginProps {
  onSuccess?: (user: any) => void;
  onError?: (error: Error) => void;
}

const Login: React.FC<LoginProps> = ({ onSuccess, onError }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [agreedToMarketing, setAgreedToMarketing] = useState(false);
  const [showAgreements, setShowAgreements] = useState(false);
  const [isAgreed, setIsAgreed] = useState(false);

  const handleGoogleAuth = async (mode: 'login' | 'signup') => {
    if (mode === 'signup') {
      setShowAgreements(true);
      if (!agreedToTerms || !agreedToPrivacy) {
        alert('필수 약관에 동의해주세요.');
        return;
      }
    }
    
    setIsLoading(true);
    
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');
      
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      console.log('로그인 성공:', user);
      
      // 사용자 정보 저장 (Firebase Firestore에 추가 정보 저장 가능)
      const userData = {
        uid: user.uid,
        email: user.email,
        name: user.displayName,
        photoURL: user.photoURL,
        createdAt: new Date(),
        agreedToMarketing,
        // EFT 앱 기본 설정
        level: 1,
        xp: 0,
        gems: 50, // 초기 젬 지급
        badges: 0,
        streak: 0,
        privacySettings: {
          dataCollection: true,
          aiLearning: true
        }
      };
      
      if (onSuccess) {
        onSuccess(userData);
      }
      
    } catch (error: any) {
      console.error('로그인 실패:', error);
      let errorMessage = '로그인에 실패했습니다.';
      
      if (error.code === 'auth/popup-blocked') {
        errorMessage = '팝업이 차단되었습니다. 팝업을 허용해주세요.';
      } else if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = '로그인이 취소되었습니다.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = '네트워크 연결을 확인해주세요.';
      }
      
      alert(errorMessage);
      
      if (onError) {
        onError(error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const canProceed = agreedToTerms && agreedToPrivacy;

  return (
    <div className="min-h-screen lg:min-h-0 bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50 lg:bg-transparent flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          {/* 로고 및 환영 메시지 */}
          <div className="mb-8">
            <div className="text-4xl mb-4">🌿</div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">환영합니다!</h1>
            <p className="text-gray-600 text-sm leading-relaxed">
              "AI와 함께하는 마음 여행을<br />
              지금 시작해보세요"
            </p>
          </div>

          {/* 초기 상태: 로그인/회원가입 분리 */}
          {!showAgreements ? (
            <div className="mb-6 space-y-3">
              <Button
                onClick={() => handleGoogleAuth('login')}
                disabled={isLoading}
                fullWidth
                size="lg"
                className="bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center space-x-3 py-4 font-medium"
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>로그인 중...</span>
                  </>
                ) : (
                  <>
                    <div className="w-5 h-5 bg-white rounded flex items-center justify-center">
                      <span className="text-blue-600 text-sm font-bold">G</span>
                    </div>
                    <span>Google로 로그인</span>
                  </>
                )}
              </Button>

              <Button
                onClick={() => setShowAgreements(true)}
                disabled={isLoading}
                fullWidth
                variant="outline"
                size="lg"
                className="border-blue-600 text-blue-700 hover:bg-blue-50 flex items-center justify-center space-x-3 py-4 font-medium"
              >
                <div className="w-5 h-5 bg-blue-600 rounded flex items-center justify-center">
                  <span className="text-white text-sm font-bold">G</span>
                </div>
                <span>회원가입 (첫 방문이신가요?)</span>
              </Button>
            </div>
          ) : (
            /* 회원가입 단계: 약관 표시 */
            <>
              <div className="mb-4 text-left space-y-3">
                <h2 className="text-lg font-bold text-gray-800">서비스 이용 동의</h2>
                <div className="h-32 overflow-y-auto bg-gray-100 p-3 rounded text-sm text-gray-600 border">
                  제 1조 (목적)<br />
                  본 약관은 MoodTalk 서비스의 이용 조건 및 절차...<br />
                  (여기에 실제 약관 내용을 넣으세요)<br />
                  ...
                </div>
              </div>

              <div className="mb-4 text-left space-y-3">
                <label className="flex items-start space-x-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => { setAgreedToTerms(e.target.checked); setIsAgreed(e.target.checked && agreedToPrivacy); }}
                    className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">
                    <span className="text-red-500">*</span> 서비스 이용약관 동의 (필수)
                  </span>
                </label>

                <label className="flex items-start space-x-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={agreedToPrivacy}
                    onChange={(e) => { setAgreedToPrivacy(e.target.checked); setIsAgreed(e.target.checked && agreedToTerms); }}
                    className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">
                    <span className="text-red-500">*</span> 개인정보 처리방침 동의 (필수)
                  </span>
                </label>

                <label className="flex items-start space-x-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={agreedToMarketing}
                    onChange={(e) => setAgreedToMarketing(e.target.checked)}
                    className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-600">
                    마케팅 수신 동의 (선택)
                  </span>
                </label>
              </div>

              <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-700 mb-4">
                💡 <strong>안전하고 빠른 구글 계정 로그인</strong><br />
                개인정보는 최소한만 수집합니다
              </div>

              <div className="space-y-3">
                <Button
                  onClick={() => handleGoogleAuth('signup')}
                  disabled={!canProceed || isLoading}
                  fullWidth
                  size="lg"
                  className={`
                    ${canProceed && !isLoading
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }
                    flex items-center justify-center space-x-3 py-4 font-medium
                  `}
                >
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>가입 진행 중...</span>
                    </>
                  ) : (
                    <>
                      <div className="w-5 h-5 bg-white rounded flex items-center justify-center">
                        <span className="text-blue-600 text-sm font-bold">G</span>
                      </div>
                      <span>동의하고 Google로 가입하기</span>
                    </>
                  )}
                </Button>

                <button
                  onClick={() => { setShowAgreements(false); setAgreedToTerms(false); setAgreedToPrivacy(false); setAgreedToMarketing(false); setIsAgreed(false); }}
                  className="w-full text-sm text-gray-500 hover:underline"
                >
                  ← 로그인 화면으로 돌아가기
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;