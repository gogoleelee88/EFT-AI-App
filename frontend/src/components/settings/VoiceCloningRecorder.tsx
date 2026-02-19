import React, { useState } from 'react';

type Props = {
  className?: string;
  onVoiceCreated?: (voiceId: string) => void;
};

/**
 * 나만의 목소리 만들기 컴포넌트.
 * - 3~10초 음성 파일 업로드 → /api/voice/upload → voice_id 를 localStorage 에 저장.
 * - 실제 녹음 기능은 추후 확장 가능 (현재는 파일 업로드만 지원).
 */
export function VoiceCloningRecorder({ className, onVoiceCreated }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setMessage(null);
  };

  const handleUpload = async () => {
    if (!file || !agreed || isUploading) return;
    setIsUploading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      // TODO: 로그인 연동 시 user_id를 함께 보낼 수 있음.
      const res = await fetch('/api/voice/upload', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || '업로드 실패');
      }
      const data = (await res.json()) as { voice_id: string; ok: boolean };
      if (data.ok && data.voice_id) {
        // 커스텀 음성 프로필 ID를 localStorage에 저장
        window.localStorage.setItem('custom_voice_id', data.voice_id);
        setMessage('✅ 커스텀 목소리 프로필이 생성되었습니다.');
        onVoiceCreated?.(data.voice_id);
      } else {
        setMessage('업로드는 성공했지만 voice_id를 받지 못했습니다.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '업로드 중 오류가 발생했습니다.';
      setMessage(`❌ ${msg}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={className}>
      <h3 className="mb-2 text-sm font-semibold text-gray-700">
        🎙️ 나만의 목소리 만들기 (베타)
      </h3>
      <p className="mb-2 text-xs text-gray-500">
        3~10초 분량의 음성 파일(wav/mp3)을 업로드하면, 명상 가이드를 그 목소리 스타일로 재생할 수 있어요.
      </p>
      <label className="mt-2 flex items-start gap-2 text-xs text-gray-600">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span>
          타인의 목소리를 무단으로 사용할 경우 법적 책임은 사용자에게 있으며, 본인은 이에 동의합니다.
        </span>
      </label>
      <div className="mt-3 flex flex-col gap-2 text-sm">
        <input
          type="file"
          accept="audio/*"
          onChange={handleFileChange}
          className="block w-full text-xs text-gray-600"
        />
        <button
          type="button"
          onClick={handleUpload}
          disabled={!file || !agreed || isUploading}
          className={`rounded-lg px-3 py-2 text-xs font-medium text-white ${
            !file || !agreed || isUploading
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-700'
          }`}
        >
          {isUploading ? '업로드 중...' : '음성 업로드'}
        </button>
      </div>
      {message && (
        <p className="mt-2 text-xs text-gray-600">
          {message}
        </p>
      )}
    </div>
  );
}

