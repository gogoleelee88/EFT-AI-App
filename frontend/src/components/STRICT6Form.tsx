import React, { useState } from 'react';
import type { StrictIntakeInput } from '../types/serverAI';
import './STRICT6.css';

interface STRICT6FormProps {
  onSubmit: (data: StrictIntakeInput) => void;
  onCancel?: () => void;
}

/**
 * STRICT6 감정 입력 폼 컴포넌트
 *
 * 사용자로부터 구조화된 감정 정보를 수집합니다.
 */
export const STRICT6Form: React.FC<STRICT6FormProps> = ({ onSubmit, onCancel }) => {
  const [formData, setFormData] = useState<StrictIntakeInput>({
    core_emotion: '',
    situation_context: '',
    automatic_thought: '',
    physical_sensation: '',
    behavioral_reaction: '',
    intensity: 5,
    available_time: undefined,
    immediate_goal: ''
  });

  const [errors, setErrors] = useState<Partial<Record<keyof StrictIntakeInput, string>>>({});

  // 필수 필드 검증
  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof StrictIntakeInput, string>> = {};

    if (!formData.core_emotion.trim()) {
      newErrors.core_emotion = '핵심 감정을 입력해주세요';
    }
    if (!formData.situation_context.trim()) {
      newErrors.situation_context = '상황을 입력해주세요';
    }
    if (!formData.automatic_thought.trim()) {
      newErrors.automatic_thought = '떠오르는 생각을 입력해주세요';
    }
    if (formData.intensity < 0 || formData.intensity > 10) {
      newErrors.intensity = '감정 강도는 0~10 사이여야 합니다';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (validate()) {
      // 빈 문자열 필드는 undefined로 변환 (선택 필드)
      const cleanedData: StrictIntakeInput = {
        ...formData,
        physical_sensation: formData.physical_sensation?.trim() || undefined,
        behavioral_reaction: formData.behavioral_reaction?.trim() || undefined,
        immediate_goal: formData.immediate_goal?.trim() || undefined,
        available_time: formData.available_time || undefined
      };

      onSubmit(cleanedData);
    }
  };

  const handleChange = (field: keyof StrictIntakeInput, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    // 에러 클리어
    if (errors[field]) {
      setErrors(prev => {
        const { [field]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="strict6-form">
      <h2>감정 상태 입력 (STRICT6)</h2>
      <p className="form-description">
        지금 느끼는 감정을 구조화된 형식으로 입력해주세요.
      </p>

      {/* 1. 핵심 감정 (필수) */}
      <div className="form-group">
        <label htmlFor="core_emotion">
          1. 핵심 감정 <span className="required">*</span>
        </label>
        <input
          id="core_emotion"
          type="text"
          value={formData.core_emotion}
          onChange={(e) => handleChange('core_emotion', e.target.value)}
          placeholder="예: 불안, 분노, 슬픔, 짜증, 수치심"
          className={errors.core_emotion ? 'error' : ''}
        />
        {errors.core_emotion && <span className="error-message">{errors.core_emotion}</span>}
      </div>

      {/* 2. 감정 강도 (필수) */}
      <div className="form-group">
        <label htmlFor="intensity">
          2. 감정 강도 (0~10) <span className="required">*</span>
          <span className="intensity-value">{formData.intensity}</span>
        </label>
        <input
          id="intensity"
          type="range"
          min="0"
          max="10"
          value={formData.intensity}
          onChange={(e) => handleChange('intensity', parseInt(e.target.value))}
        />
        <div className="intensity-labels">
          <span>약함 (0-3)</span>
          <span>중간 (4-6)</span>
          <span>강함 (7-10)</span>
        </div>
        {errors.intensity && <span className="error-message">{errors.intensity}</span>}
      </div>

      {/* 3. 상황 맥락 (필수) */}
      <div className="form-group">
        <label htmlFor="situation_context">
          3. 상황 맥락 <span className="required">*</span>
        </label>
        <textarea
          id="situation_context"
          value={formData.situation_context}
          onChange={(e) => handleChange('situation_context', e.target.value)}
          placeholder="예: 내일 발표를 앞두고 자료를 다시 확인하는 중"
          rows={2}
          className={errors.situation_context ? 'error' : ''}
        />
        {errors.situation_context && <span className="error-message">{errors.situation_context}</span>}
      </div>

      {/* 4. 자동사고 (필수) */}
      <div className="form-group">
        <label htmlFor="automatic_thought">
          4. 떠오르는 생각 <span className="required">*</span>
        </label>
        <textarea
          id="automatic_thought"
          value={formData.automatic_thought}
          onChange={(e) => handleChange('automatic_thought', e.target.value)}
          placeholder="예: 망치면 어쩌지, 다들 나를 무능하다고 볼 것 같아"
          rows={2}
          className={errors.automatic_thought ? 'error' : ''}
        />
        {errors.automatic_thought && <span className="error-message">{errors.automatic_thought}</span>}
      </div>

      {/* 5. 신체 감각 (선택) */}
      <div className="form-group">
        <label htmlFor="physical_sensation">
          5. 몸에서 느껴지는 것 <span className="optional">(선택)</span>
        </label>
        <input
          id="physical_sensation"
          type="text"
          value={formData.physical_sensation}
          onChange={(e) => handleChange('physical_sensation', e.target.value)}
          placeholder="예: 가슴이 꽉 막히고 손에 힘이 잘 안 들어감"
        />
      </div>

      {/* 6. 행동 반응 (선택) */}
      <div className="form-group">
        <label htmlFor="behavioral_reaction">
          6. 지금 하고 있거나 하고 싶은 행동 <span className="optional">(선택)</span>
        </label>
        <input
          id="behavioral_reaction"
          type="text"
          value={formData.behavioral_reaction}
          onChange={(e) => handleChange('behavioral_reaction', e.target.value)}
          placeholder="예: 계속 자료를 확인하고 있음"
        />
      </div>

      {/* 7. 즉시 목표 (선택) */}
      <div className="form-group">
        <label htmlFor="immediate_goal">
          7. 지금의 목표 <span className="optional">(선택)</span>
        </label>
        <input
          id="immediate_goal"
          type="text"
          value={formData.immediate_goal}
          onChange={(e) => handleChange('immediate_goal', e.target.value)}
          placeholder="예: 최소한 준비한 만큼만 안정적으로 발표하고 싶다"
        />
      </div>

      {/* 8. 사용 가능 시간 (선택) */}
      <div className="form-group">
        <label htmlFor="available_time">
          8. 사용 가능 시간 (분) <span className="optional">(선택)</span>
        </label>
        <input
          id="available_time"
          type="number"
          min="1"
          max="60"
          value={formData.available_time || ''}
          onChange={(e) => handleChange('available_time', e.target.value ? parseInt(e.target.value) : 0)}
          placeholder="비워두면 자동 계산됩니다"
        />
      </div>

      {/* 버튼 */}
      <div className="form-actions">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-cancel">
            취소
          </button>
        )}
        <button type="submit" className="btn-submit">
          EFT 스크립트 생성
        </button>
      </div>
    </form>
  );
};
