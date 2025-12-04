import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEFTScript } from '../contexts/EFTScriptContext';
import { STRICT6Form } from '../components/STRICT6Form';
import { EFTScriptDisplay } from '../components/EFTScriptDisplay';
import type { StrictIntakeInput, ChatResponse, EFTScript } from '../types/serverAI';
import '../components/STRICT6.css';

export const EFTStrictPage: React.FC = () => {
  const navigate = useNavigate();
  const { setEftScript } = useEFTScript();
  const [script, setScript] = useState<EFTScript | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (data: StrictIntakeInput) => {
    setLoading(true);

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
        setScript(result.eft_script);
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
        color: '#666'
      }}>
        스크립트 생성 중...
      </div>
    );
  }

  if (script) {
    return (
      <EFTScriptDisplay
        script={script}
        onClose={() => setScript(null)}
                  onStartSession={() => {
                    console.log('EFT 세션 시작 - AR Holistic으로 이동');
                    
                    // 디버깅: Context에 저장할 스크립트 내용을 확인합니다.
                    console.log("[DEBUG] Script to be set in context:", script);
        
                    // EFT 스크립트를 Context에 저장
                    setEftScript({
                      setup_phrase: script.setup_phrase,
                      focus_words: script.focus_words,
                      target_emotion: script.target_emotion,
                      intensity_label: script.intensity_label,
                      round_phrases: script.round_phrases
                    });
                    
                    // AR Holistic으로 이동 (URL 파라미터 없이)
                    navigate("/ar-holistic");
                  }}      />
    );
  }

  return <STRICT6Form onSubmit={handleSubmit} />;
};
