import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEFTScript } from '../contexts/EFTScriptContext';
import { SlideIntake } from '../components/eft/SlideIntake';
import type { StrictIntakeInput, ChatResponse } from '../types/serverAI';

export const EFTStrictPage: React.FC = () => {
  const navigate = useNavigate();
  const { setEftScript } = useEFTScript();
  const [strictIntakeData, setStrictIntakeData] = useState<StrictIntakeInput | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (data: StrictIntakeInput) => {
    setLoading(true);
    setStrictIntakeData(data);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'EFT 스크립트 요청',
          strict_intake: data
        })
      });

      const result: ChatResponse = await response.json();

      if (result.eft_script) {
        // EFT 스크립트를 Context에 저장
        setEftScript({
          setup_phrase: result.eft_script.setup_phrase,
          focus_words: result.eft_script.focus_words,
          target_emotion: result.eft_script.target_emotion,
          intensity_label: result.eft_script.intensity_label,
          round_phrases: result.eft_script.round_phrases
        });

        // 바로 AR Holistic 페이지로 이동
        navigate("/ar-holistic", {
          state: {
            strictIntake: data,
            intensity_before: data.intensity,
          },
        });
      } else {
        alert('EFT 스크립트 생성에 실패했습니다.');
      }
    } catch (error) {
      console.error('API 오류:', error);
      alert('서버 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        fontSize: '20px',
        color: '#fd6f22',
        flexDirection: 'column',
        gap: '20px'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          border: '4px solid #fd6f2220',
          borderTop: '4px solid #fd6f22',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        스크립트 생성 중...
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md md:max-w-2xl lg:max-w-4xl">
        <SlideIntake onComplete={handleSubmit} />
      </div>
    </div>
  );
};
