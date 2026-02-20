import React, { useEffect, useMemo, useState } from 'react';
import { GoogleAuthProvider, getRedirectResult, signInWithPopup, signInWithRedirect } from 'firebase/auth';

import { auth } from '../../firebase/config';
import Button from '../ui/Button';
import { resolveBackendUrl } from '@/config/api';

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
  const [connectNotion, setConnectNotion] = useState(false);

  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const inviteToken = searchParams.get('invite_token');
  const nextPath = searchParams.get('next');

  const redirectAfterLogin = async (mode: 'login' | 'signup') => {
    if (inviteToken) {
      const joinResp = await fetch(resolveBackendUrl('/api/chat/rooms/join'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_token: inviteToken }),
      });
      if (joinResp.ok) {
        const payload = await joinResp.json();
        if (payload?.room_id) {
          window.location.href = `/chat/rooms/${payload.room_id}`;
          return;
        }
      }
    }

    if (mode === 'signup' && connectNotion) {
      const notionAuthUrl = resolveBackendUrl('/api/notion/oauth/authorize?next=/dashboard');
      window.open(notionAuthUrl, '_blank', 'noopener,noreferrer');
    }

    window.location.href = nextPath || '/dashboard';
  };

  const submitLogin = async (user: any, mode: 'login' | 'signup') => {
    const idToken = await user.getIdToken();

    const userData = {
      uid: user.uid,
      email: user.email,
      name: user.displayName,
      photoURL: user.photoURL,
      createdAt: new Date(),
      agreedToMarketing,
      level: 1,
      xp: 0,
      gems: 50,
      badges: 0,
      streak: 0,
      privacySettings: {
        dataCollection: true,
        aiLearning: true,
      },
    };

    const resp = await fetch(resolveBackendUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id_token: idToken }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      const detail = text?.trim() || `HTTP ${resp.status}`;
      console.error('백엔드 로그인 실패 응답', { status: resp.status, detail });
      throw new Error(`백엔드 로그인에 실패했습니다. (${detail})`);
    }

    if (onSuccess) {
      onSuccess(userData);
    }

    await redirectAfterLogin(mode);
  };

  const handleGoogleAuth = async (mode: 'login' | 'signup') => {
    if (mode === 'signup') {
      setShowAgreements(true);
      if (!agreedToTerms || !agreedToPrivacy) {
        alert('필수 약관에 동의해 주세요.');
        return;
      }
    }

    setIsLoading(true);

    try {
      sessionStorage.setItem('auth_mode', mode);
      sessionStorage.setItem('auth_marketing', agreedToMarketing ? '1' : '0');
      sessionStorage.setItem('auth_connect_notion', connectNotion ? '1' : '0');

      const provider = new GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');

      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile) {
        await signInWithRedirect(auth, provider);
        return;
      }

      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      await submitLogin(user, mode);
    } catch (error: any) {
      console.error('로그인 실패:', error);
      let errorMessage = '로그인에 실패했습니다.';

      if (error.code === 'auth/popup-blocked') {
        errorMessage = '팝업이 차단되었습니다. 리다이렉트 로그인으로 전환합니다.';
        const provider = new GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');
        await signInWithRedirect(auth, provider);
        return;
      } else if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = '로그인이 취소되었습니다.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = '네트워크 연결을 확인해 주세요.';
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

  useEffect(() => {
    const run = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (!result?.user) return;

        const mode = (sessionStorage.getItem('auth_mode') as 'login' | 'signup') || 'login';
        const marketing = sessionStorage.getItem('auth_marketing') === '1';
        const notion = sessionStorage.getItem('auth_connect_notion') === '1';
        setAgreedToMarketing(marketing);
        setConnectNotion(notion);
        setIsLoading(true);
        await submitLogin(result.user, mode);
      } catch (error) {
        console.error('리다이렉트 로그인 실패:', error);
      } finally {
        setIsLoading(false);
      }
    };

    run();
  }, []);

  return (
    <div className="min-h-screen lg:min-h-0 bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50 lg:bg-transparent flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="mb-8">
            <div className="text-4xl mb-4">M</div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">MoodTalk 로그인</h1>
            <p className="text-gray-600 text-sm leading-relaxed">Google 계정으로 빠르게 시작할 수 있습니다.</p>
          </div>

          {!showAgreements ? (
            <div className="mb-6 space-y-3">
              <Button
                onClick={() => handleGoogleAuth('login')}
                disabled={isLoading}
                fullWidth
                size="lg"
                className="bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center space-x-3 py-4 font-medium"
              >
                {isLoading ? '로그인 중...' : 'Google로 로그인'}
              </Button>

              <Button
                onClick={() => setShowAgreements(true)}
                disabled={isLoading}
                fullWidth
                variant="outline"
                size="lg"
                className="border-blue-600 text-blue-700 hover:bg-blue-50 flex items-center justify-center space-x-3 py-4 font-medium"
              >
                회원가입 시작
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-4 text-left space-y-2">
                <h2 className="text-lg font-bold text-gray-800">서비스 이용 동의</h2>
                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(event) => setAgreedToTerms(event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    <span className="text-red-500">*</span> 서비스 이용약관 동의 (필수)
                  </span>
                </label>

                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={agreedToPrivacy}
                    onChange={(event) => setAgreedToPrivacy(event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    <span className="text-red-500">*</span> 개인정보 처리방침 동의 (필수)
                  </span>
                </label>

                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={agreedToMarketing}
                    onChange={(event) => setAgreedToMarketing(event.target.checked)}
                    className="mt-1"
                  />
                  <span>마케팅 수신 동의 (선택)</span>
                </label>

                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={connectNotion}
                    onChange={(event) => setConnectNotion(event.target.checked)}
                    className="mt-1"
                  />
                  <span>가입 후 Notion 연동도 진행</span>
                </label>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={() => handleGoogleAuth('signup')}
                  disabled={!canProceed || isLoading}
                  fullWidth
                  size="lg"
                  className="bg-blue-600 hover:bg-blue-700 text-white py-4 font-medium"
                >
                  {isLoading ? '가입 진행 중...' : '동의 후 Google로 가입'}
                </Button>

                <button
                  onClick={() => {
                    setShowAgreements(false);
                    setAgreedToTerms(false);
                    setAgreedToPrivacy(false);
                    setAgreedToMarketing(false);
                    setConnectNotion(false);
                  }}
                  className="w-full text-sm text-gray-500 hover:underline"
                  type="button"
                >
                  로그인 화면으로 돌아가기
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
