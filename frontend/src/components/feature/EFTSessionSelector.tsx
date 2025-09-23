/**
 * EFT 세션 선택 컴포넌트
 * 2D 기본, 3D 아바타, AR 카메라 가이드 중 선택
 */

import React, { useState } from 'react';
import { Box, Camera, User, ArrowRight, Info } from 'lucide-react';
import EFTGuide3D from './EFTGuide3D';
import EFTGuideAR from './EFTGuideAR';

type EFTGuideMode = 'selector' | '2d' | '3d' | 'ar';

interface EFTSessionSelectorProps {
  onClose?: () => void;
}

export const EFTSessionSelector: React.FC<EFTSessionSelectorProps> = ({ onClose }) => {
  const [currentMode, setCurrentMode] = useState<EFTGuideMode>('selector');
  const [sessionProgress, setSessionProgress] = useState<number>(0);

  // 세션 완료 핸들러
  const handleSessionComplete = () => {
    setSessionProgress(100);
    // 2초 후 선택 화면으로 돌아가기
    setTimeout(() => {
      setCurrentMode('selector');
      setSessionProgress(0);
    }, 2000);
  };

  // 포인트 진행 핸들러
  const handlePointProgress = (pointIndex: number, isCompleted: boolean) => {
    console.log(`포인트 ${pointIndex + 1} ${isCompleted ? '완료' : '진행 중'}`);
  };

  // 2D 기본 가이드 (간단한 텍스트 기반)
  const BasicEFTGuide = () => {
    const [currentPoint, setCurrentPoint] = useState(0);
    const [isActive, setIsActive] = useState(false);

    const basicPoints = [
      { name: '정수리', description: '머리 정수리 부분을 7-10회 가볍게 두드리세요' },
      { name: '눈썹', description: '눈썹 안쪽 시작점을 7-10회 가볍게 두드리세요' },
      { name: '눈가', description: '눈꼬리 바깥쪽을 7-10회 가볍게 두드리세요' },
      { name: '눈 밑', description: '눈 아래 뼈 부분을 7-10회 가볍게 두드리세요' },
      { name: '코 밑', description: '코와 입술 사이를 7-10회 가볍게 두드리세요' },
      { name: '턱', description: '턱 중앙 아래를 7-10회 가볍게 두드리세요' },
      { name: '쇄골', description: '쇄골 아래를 7-10회 가볍게 두드리세요' },
      { name: '겨드랑이', description: '겨드랑이 아래를 7-10회 가볍게 두드리세요' },
      { name: '손날', description: '손날 부분을 7-10회 가볍게 두드리세요' }
    ];

    const nextPoint = () => {
      if (currentPoint + 1 >= basicPoints.length) {
        handleSessionComplete();
        setIsActive(false);
        setCurrentPoint(0);
      } else {
        setCurrentPoint(currentPoint + 1);
      }
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-md mx-auto">
          {/* 헤더 */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setCurrentMode('selector')}
              className="p-2 text-gray-600 hover:text-gray-800"
            >
              ← 뒤로
            </button>
            <h1 className="text-xl font-bold text-gray-800">기본 EFT 가이드</h1>
            <div className="w-10" />
          </div>

          {!isActive ? (
            // 시작 화면
            <div className="bg-white rounded-2xl p-6 shadow-lg text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-lg font-semibold mb-2">기본 EFT 세션</h2>
              <p className="text-gray-600 mb-6">
                텍스트 가이드를 따라 EFT 탭핑을 진행합니다.
                총 9개의 포인트를 순서대로 탭핑하게 됩니다.
              </p>
              <button
                onClick={() => setIsActive(true)}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 rounded-lg transition-colors"
              >
                세션 시작
              </button>
            </div>
          ) : (
            // 진행 화면
            <div className="space-y-4">
              {/* 진행률 */}
              <div className="bg-white rounded-lg p-4 shadow">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>진행률</span>
                  <span>{currentPoint + 1} / {basicPoints.length}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${((currentPoint + 1) / basicPoints.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* 현재 포인트 */}
              <div className="bg-white rounded-2xl p-6 shadow-lg text-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-green-600">
                    {currentPoint + 1}
                  </span>
                </div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">
                  {basicPoints[currentPoint].name}
                </h3>
                <p className="text-gray-600 mb-6">
                  {basicPoints[currentPoint].description}
                </p>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => setIsActive(false)}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-3 rounded-lg transition-colors"
                  >
                    중지
                  </button>
                  <button
                    onClick={nextPoint}
                    className="flex-1 bg-green-500 hover:bg-green-600 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    완료 <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 안내 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">탭핑 방법</p>
                    <p>검지와 중지로 해당 부위를 리듬감 있게 가볍게 두드리세요. 너무 세게 누르지 마세요.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // 메인 선택 화면
  if (currentMode === 'selector') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-4">
        <div className="max-w-md mx-auto">
          {/* 헤더 */}
          <div className="flex items-center justify-between mb-6">
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 text-gray-600 hover:text-gray-800"
              >
                ← 뒤로
              </button>
            )}
            <h1 className="text-xl font-bold text-gray-800">EFT 가이드 선택</h1>
            <div className="w-10" />
          </div>

          {/* 가이드 옵션들 */}
          <div className="space-y-4">
            {/* 기본 가이드 */}
            <div
              onClick={() => setCurrentMode('2d')}
              className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer hover:scale-[1.02]"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <User className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-800">기본 가이드</h3>
                  <p className="text-sm text-gray-600">텍스트 설명과 함께 진행하는 기본 EFT 세션</p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-green-100 text-green-700 text-xs rounded-full">초보자 추천</span>
                <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">간단함</span>
              </div>
            </div>

            {/* 3D 아바타 가이드 */}
            <div
              onClick={() => setCurrentMode('3d')}
              className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer hover:scale-[1.02]"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                  <Box className="w-6 h-6 text-purple-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-800">3D 아바타 가이드</h3>
                  <p className="text-sm text-gray-600">3D 아바타로 탭핑 포인트를 시각적으로 안내</p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">시각적</span>
                <span className="px-3 py-1 bg-orange-100 text-orange-700 text-xs rounded-full">인터랙티브</span>
              </div>
            </div>

            {/* AR 카메라 가이드 */}
            <div
              onClick={() => setCurrentMode('ar')}
              className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer hover:scale-[1.02]"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-pink-100 rounded-xl flex items-center justify-center">
                  <Camera className="w-6 h-6 text-pink-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-800">AR 카메라 가이드</h3>
                  <p className="text-sm text-gray-600">실시간 얼굴 인식으로 정확한 탭핑 포인트 표시</p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-pink-100 text-pink-700 text-xs rounded-full">최신 기술</span>
                <span className="px-3 py-1 bg-red-100 text-red-700 text-xs rounded-full">정확함</span>
                <span className="px-3 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full">카메라 필요</span>
              </div>
            </div>
          </div>

          {/* 안내 메시지 */}
          <div className="mt-6 bg-white/70 backdrop-blur-sm rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-gray-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-gray-700">
                <p className="font-medium mb-1">EFT (감정자유기법)이란?</p>
                <p>특정 부위를 가볍게 두드리며 감정적 스트레스를 완화하는 기법입니다. 각 가이드 방식에 따라 편한 방법을 선택하세요.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 각 모드별 컴포넌트 렌더링
  return (
    <>
      {currentMode === '2d' && <BasicEFTGuide />}
      {currentMode === '3d' && (
        <EFTGuide3D
          isActive={true}
          onSessionComplete={handleSessionComplete}
          onPointProgress={handlePointProgress}
        />
      )}
      {currentMode === 'ar' && (
        <EFTGuideAR
          isActive={true}
          onSessionComplete={handleSessionComplete}
          onPointProgress={handlePointProgress}
        />
      )}
    </>
  );
};

export default EFTSessionSelector;