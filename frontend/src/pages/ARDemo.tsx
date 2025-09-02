import { useState } from 'react';
import { ARSession } from '../modules/ar';
import samplePlan from '../modules/ar/sample-plan.json';
import type { EFTSessionPlan } from '../modules/ar/types';

export default function ARDemo() {
  const [sessionPlan] = useState<EFTSessionPlan>(samplePlan);
  const [settings, setSettings] = useState({
    autoPlay: true,
    enableTTS: true,
    enableSmoothing: true,
    showGuide: true
  });

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* 헤더 */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            EFT AR 세션 데모
          </h1>
          <p className="text-gray-600">
            카메라를 통해 실시간으로 EFT 타점을 안내받으며 세션을 진행하세요
          </p>
        </div>

        {/* 설정 패널 */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <h3 className="text-lg font-semibold mb-4">세션 설정</h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={settings.autoPlay}
                onChange={(e) => setSettings(prev => ({ ...prev, autoPlay: e.target.checked }))}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">자동 진행</span>
            </label>

            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={settings.enableTTS}
                onChange={(e) => setSettings(prev => ({ ...prev, enableTTS: e.target.checked }))}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">음성 안내</span>
            </label>

            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={settings.enableSmoothing}
                onChange={(e) => setSettings(prev => ({ ...prev, enableSmoothing: e.target.checked }))}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">스무딩</span>
            </label>

            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={settings.showGuide}
                onChange={(e) => setSettings(prev => ({ ...prev, showGuide: e.target.checked }))}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">가이드 박스</span>
            </label>
          </div>
        </div>

        {/* AR 세션 */}
        <ARSession
          plan={sessionPlan}
          autoPlay={settings.autoPlay}
          enableTTS={settings.enableTTS}
          enableSmoothing={settings.enableSmoothing}
          showGuide={settings.showGuide}
        />

        {/* 세션 정보 */}
        <div className="mt-6 bg-white rounded-lg shadow-md p-4">
          <h3 className="text-lg font-semibold mb-3">세션 정보</h3>
          <div className="space-y-2 text-sm">
            <p><strong>세션:</strong> {sessionPlan.title}</p>
            <p><strong>단계:</strong> {sessionPlan.steps.length}개</p>
            <p><strong>예상 소요시간:</strong> {sessionPlan.steps.reduce((sum, step) => sum + step.durationSec, 0)}초 ({Math.round(sessionPlan.steps.reduce((sum, step) => sum + step.durationSec, 0) / 60)}분)</p>
          </div>
          
          <div className="mt-4">
            <h4 className="font-medium mb-2">EFT 포인트 순서:</h4>
            <div className="flex flex-wrap gap-2">
              {sessionPlan.steps.map((step, index) => (
                <span
                  key={index}
                  className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                >
                  {index + 1}. {step.point} ({step.side})
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 도움말 */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">사용법 안내</h3>
          <ul className="space-y-1 text-sm text-blue-800">
            <li>• 카메라 권한을 허용해주세요</li>
            <li>• 얼굴과 어깨가 화면에 잘 보이도록 조정하세요</li>
            <li>• 충분한 조명이 있는 곳에서 사용하세요</li>
            <li>• 가이드 박스의 안내를 따라 타점을 터치하세요</li>
            <li>• 마이크 권한을 허용하면 음성 안내를 들을 수 있습니다</li>
          </ul>
        </div>
      </div>
    </div>
  );
}