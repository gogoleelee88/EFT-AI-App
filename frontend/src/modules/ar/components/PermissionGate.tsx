import { useState, useEffect } from 'react';

interface PermissionGateProps {
  children: React.ReactNode;
  onPermissionGranted?: () => void;
}

export default function PermissionGate({ children, onPermissionGranted }: PermissionGateProps) {
  const [permission, setPermission] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [error, setError] = useState<string | null>(null);

  const requestPermission = async () => {
    try {
      setError(null);
      
      // 카메라 권한 요청
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' }, 
        audio: false 
      });
      
      // 권한 획득 성공
      stream.getTracks().forEach(track => track.stop()); // 스트림 정리
      setPermission('granted');
      onPermissionGranted?.();
      
    } catch (err) {
      setPermission('denied');
      
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('카메라 권한이 거부되었습니다. 브라우저 설정에서 카메라 권한을 허용해주세요.');
        } else if (err.name === 'NotFoundError') {
          setError('카메라를 찾을 수 없습니다. 카메라가 연결되어 있는지 확인해주세요.');
        } else if (err.name === 'NotSupportedError') {
          setError('이 브라우저에서는 카메라를 지원하지 않습니다.');
        } else {
          setError(`카메라 접근 중 오류가 발생했습니다: ${err.message}`);
        }
      } else {
        setError('알 수 없는 오류가 발생했습니다.');
      }
    }
  };

  useEffect(() => {
    // 권한 상태 확인
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'camera' as PermissionName }).then(result => {
        if (result.state === 'granted') {
          setPermission('granted');
          onPermissionGranted?.();
        } else if (result.state === 'denied') {
          setPermission('denied');
        }
      }).catch(() => {
        // 권한 API를 지원하지 않는 경우
        setPermission('pending');
      });
    }
  }, [onPermissionGranted]);

  if (permission === 'granted') {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-6 bg-gray-50 rounded-lg">
      <div className="text-center max-w-md">
        <div className="mb-6">
          <svg 
            className="w-16 h-16 mx-auto text-gray-400 mb-4" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" 
            />
          </svg>
          
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            카메라 권한이 필요합니다
          </h3>
          
          <p className="text-gray-600 mb-4">
            EFT AR 세션을 위해 카메라 접근 권한이 필요합니다. 
            얼굴과 자세를 인식하여 정확한 타점을 표시합니다.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-md">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        <button
          onClick={requestPermission}
          disabled={permission === 'pending'}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {permission === 'pending' ? '권한 확인 중...' : '카메라 권한 허용'}
        </button>

        {permission === 'denied' && (
          <p className="text-sm text-gray-500 mt-3">
            권한이 거부된 경우, 브라우저 주소창의 카메라 아이콘을 클릭하여 수동으로 허용할 수 있습니다.
          </p>
        )}
      </div>
    </div>
  );
}