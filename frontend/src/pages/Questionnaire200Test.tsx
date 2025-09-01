/**
 * 200문항 심리검사 테스트 페이지
 * 
 * 목적: Questionnaire200 컴포넌트의 연동 테스트 및 디버깅
 * 사용: 개발 환경에서 200문항 시스템 동작 확인
 * 
 * 테스트 기능:
 * - JSON 파일 로딩 확인
 * - 문항 표시 및 응답 처리
 * - 진행률 계산 및 표시  
 * - 결과 분석 및 점수 집계
 * - 다양한 테스트 모드 지원
 * 
 * 작성일: 2025-08-18
 */

import React, { useState } from 'react';
import { Questionnaire200 } from '../components/feature/Questionnaire200';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import type { 
  QuestionnaireResult200, 
  QuestionnaireProgress200,
  QuestionnaireTestMode 
} from '../types/questionnaire200';

const Questionnaire200Test: React.FC = () => {
  const [result, setResult] = useState<QuestionnaireResult200 | null>(null);
  const [progress, setProgress] = useState<QuestionnaireProgress200 | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [testMode, setTestMode] = useState<QuestionnaireTestMode>({
    enabled: true,
    showScores: false,
    skipQuestions: [],
    fastMode: false,
    autoAnswer: false
  });

  const handleStart = () => {
    setIsStarted(true);
    setResult(null);
    setProgress(null);
  };

  const handleComplete = (finalResult: QuestionnaireResult200) => {
    console.log('🎉 검사 완료!', finalResult);
    setResult(finalResult);
    setIsStarted(false);
  };

  const handleProgress = (currentProgress: QuestionnaireProgress200) => {
    console.log('📊 진행 상황:', currentProgress);
    setProgress(currentProgress);
  };

  const handleReset = () => {
    setIsStarted(false);
    setResult(null);
    setProgress(null);
  };

  // 테스트 모드 토글 함수들
  const toggleTestMode = (key: keyof QuestionnaireTestMode) => {
    setTestMode(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        
        {/* 헤더 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            200문항 심리검사 시스템 테스트
          </h1>
          <p className="text-gray-600">
            JSON 연동 및 컴포넌트 동작 확인용 테스트 페이지
          </p>
        </div>

        {/* 테스트 모드 설정 */}
        {!isStarted && (
          <Card className="p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">🧪 테스트 모드 설정</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={testMode.showScores}
                  onChange={() => toggleTestMode('showScores')}
                  className="rounded"
                />
                <span>점수 실시간 표시</span>
              </label>
              
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={testMode.fastMode}
                  onChange={() => toggleTestMode('fastMode')}
                  className="rounded"
                />
                <span>빠른 테스트 모드</span>
              </label>
              
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={testMode.autoAnswer}
                  onChange={() => toggleTestMode('autoAnswer')}
                  className="rounded"
                />
                <span>자동 응답 (랜덤)</span>
              </label>
            </div>
          </Card>
        )}

        {/* 진행 상황 표시 */}
        {progress && (
          <Card className="p-4 mb-6 bg-blue-50">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-medium text-blue-800">진행 상황</h3>
                <p className="text-blue-600 text-sm">
                  {progress.currentQuestionIndex} / {progress.totalQuestions} 문항 완료
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-800">
                  {Math.round((progress.currentQuestionIndex / progress.totalQuestions) * 100)}%
                </div>
                <p className="text-blue-600 text-xs">완료율</p>
              </div>
            </div>
          </Card>
        )}

        {/* 시작 전 화면 */}
        {!isStarted && !result && (
          <Card className="p-8 text-center">
            <div className="mb-6">
              <div className="text-6xl mb-4">🧠</div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                200문항 심리검사 준비완료
              </h2>
              <p className="text-gray-600">
                심층 심리 프로파일링을 통한 맞춤형 EFT 추천을 위한 검사입니다.
              </p>
            </div>
            
            <div className="space-y-6">
              {/* 기본 정보 */}
              <div className="text-sm text-gray-500 space-y-1">
                <p>📝 총 200문항 (5개 카테고리)</p>
                <p>⏱️ 예상 소요시간: 15-20분</p>
              </div>

              {/* 중간 저장 안내 - 강조 표시 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-800 mb-2 flex items-center">
                  💾 안심하고 검사하세요!
                </h3>
                <div className="text-sm text-blue-700 space-y-1">
                  <p>✅ <strong>자동 저장</strong>: 답변할 때마다 자동으로 저장됩니다</p>
                  <p>✅ <strong>언제든 중단</strong>: 브라우저를 닫아도 진행률이 보존됩니다</p>
                  <p>✅ <strong>이어서 계속</strong>: 24시간 내 다시 접속하면 이어서 할 수 있어요</p>
                  <p>✅ <strong>완전 무료</strong>: 회원가입 없이 바로 진행 가능</p>
                </div>
              </div>

              {/* 추가 정보 */}
              <div className="text-xs text-gray-400 space-y-1">
                <p>💡 팁: 한 번에 완료하지 않아도 괜찮아요</p>
                <p>🔒 개인정보: 로컬 저장으로 개인정보 보호</p>
              </div>
              
              <Button 
                onClick={handleStart}
                className="px-8 py-3 text-lg bg-blue-600 hover:bg-blue-700"
              >
                안심하고 검사 시작하기
              </Button>
            </div>
          </Card>
        )}

        {/* 검사 진행 중 */}
        {isStarted && (
          <>
            <Questionnaire200
              onComplete={handleComplete}
              onProgress={handleProgress}
              testMode={testMode}
              userId="test-user-001"
            />
            
            {/* 중단 버튼 */}
            <div className="mt-6 text-center">
              <Button
                onClick={handleReset}
                variant="outline"
                className="text-red-600 border-red-600 hover:bg-red-50"
              >
                검사 중단
              </Button>
            </div>
          </>
        )}

        {/* 결과 표시 */}
        {result && (
          <div className="space-y-6">
            <Card className="p-6">
              <h2 className="text-2xl font-bold text-green-700 mb-4 flex items-center">
                🎉 검사 완료!
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 기본 정보 */}
                <div>
                  <h3 className="font-semibold mb-3">📊 기본 정보</h3>
                  <div className="space-y-2 text-sm">
                    <p><span className="font-medium">사용자 ID:</span> {result.userId}</p>
                    <p><span className="font-medium">완료 시간:</span> {result.completedAt.toLocaleString('ko-KR')}</p>
                    <p><span className="font-medium">소요 시간:</span> {Math.floor(result.totalResponseTime / 60)}분 {result.totalResponseTime % 60}초</p>
                  </div>
                </div>

                {/* 카테고리별 점수 */}
                <div>
                  <h3 className="font-semibold mb-3">📈 카테고리별 평균 점수</h3>
                  <div className="space-y-2">
                    {Object.entries(result.categoryScores).map(([category, score]) => (
                      <div key={category} className="flex justify-between items-center">
                        <span className="text-sm">{category}</span>
                        <div className="flex items-center space-x-2">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-500 h-2 rounded-full"
                              style={{ width: `${(score.averageScore * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium w-8">
                            {(score.averageScore * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* 상세 척도 점수 */}
            <Card className="p-6">
              <h3 className="text-xl font-semibold mb-4">📋 척도별 상세 점수</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">척도</th>
                      <th className="text-right py-2">점수</th>
                      <th className="text-right py-2">비율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(result.scaleScores)
                      .sort(([,a], [,b]) => b - a)
                      .map(([scale, score]) => (
                      <tr key={scale} className="border-b border-gray-100">
                        <td className="py-2">{scale}</td>
                        <td className="text-right py-2 font-medium">{score}</td>
                        <td className="text-right py-2 text-gray-600">
                          {((score / Math.max(...Object.values(result.scaleScores))) * 100).toFixed(0)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* 다시 시작 버튼 */}
            <div className="text-center">
              <Button onClick={handleReset} className="px-8 py-3">
                새로운 검사 시작
              </Button>
            </div>
          </div>
        )}

        {/* 디버그 정보 (개발 모드) */}
        {process.env.NODE_ENV === 'development' && (progress || result) && (
          <Card className="p-4 mt-6 bg-gray-50">
            <details className="text-xs">
              <summary className="cursor-pointer font-medium mb-2">🔍 디버그 정보</summary>
              <pre className="bg-white p-3 rounded text-xs overflow-auto max-h-64">
                {JSON.stringify({progress, result}, null, 2)}
              </pre>
            </details>
          </Card>
        )}

      </div>
    </div>
  );
};

export default Questionnaire200Test;