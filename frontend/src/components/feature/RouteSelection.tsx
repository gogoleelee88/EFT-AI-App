import React from 'react';
import { Card, Button } from '../ui';

interface RouteSelectionProps {
  onRouteSelect: (route: 'conversation' | 'checkin' | 'affirmation') => void;
}

const RouteSelection: React.FC<RouteSelectionProps> = ({ onRouteSelect }) => {
  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          오늘은 어떤 방식으로 마음을 돌봐드릴까요? 💙
        </h1>
        <p className="text-gray-600">
          편안한 방식을 선택해서 시작해 보세요
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* 루트 1: 자유 대화형 */}
        <Card 
          className="p-6 hover:shadow-lg transition-all cursor-pointer border-2 hover:border-blue-200"
          onClick={() => onRouteSelect('conversation')}
        >
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full mx-auto flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            
            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                AI 동반자와 대화하기
              </h3>
              <p className="text-gray-600 text-sm mb-4">
                자유롭게 마음을 이야기하고, AI가 함께 감정을 살펴보며 맞춤 케어를 제안해드려요
              </p>
              
              <div className="bg-blue-50 p-3 rounded-lg mb-4">
                <h4 className="font-medium text-blue-900 mb-2">이런 분께 추천</h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• 복잡한 감정을 정리하고 싶으신 분</li>
                  <li>• 깊이 있는 대화를 원하시는 분</li>
                  <li>• 근본 원인을 찾고 싶으신 분</li>
                </ul>
              </div>
              
              <div className="text-xs text-gray-500 mb-4">
                ⏱️ 소요시간: 15-25분 | 🤖 AI 분석 포함
              </div>
            </div>
            
            <Button variant="outline" fullWidth>
              대화 시작하기
            </Button>
          </div>
        </Card>

        {/* 루트 2: 구조화된 체크인 */}
        <Card 
          className="p-6 hover:shadow-lg transition-all cursor-pointer border-2 hover:border-green-200"
          onClick={() => onRouteSelect('checkin')}
        >
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-gradient-to-br from-green-400 to-teal-500 rounded-full mx-auto flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            
            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                감정 체크인하기
              </h3>
              <p className="text-gray-600 text-sm mb-4">
                간단한 선택으로 현재 감정을 파악하고, 바로 맞춤형 EFT 셀프케어를 시작해보세요
              </p>
              
              <div className="bg-green-50 p-3 rounded-lg mb-4">
                <h4 className="font-medium text-green-900 mb-2">이런 분께 추천</h4>
                <ul className="text-sm text-green-700 space-y-1">
                  <li>• 빠르게 케어하고 싶으신 분</li>
                  <li>• 감정이 명확하신 분</li>
                  <li>• 간편한 방식을 선호하시는 분</li>
                </ul>
              </div>
              
              <div className="text-xs text-gray-500 mb-4">
                ⏱️ 소요시간: 10-15분 | ⚡ 즉시 EFT 시작
              </div>
            </div>
            
            <Button variant="outline" fullWidth>
              체크인 시작하기
            </Button>
          </div>
        </Card>

        {/* 루트 3: 확언 EFT */}
        <Card 
          className="p-6 hover:shadow-lg transition-all cursor-pointer border-2 hover:border-purple-200"
          onClick={() => onRouteSelect('affirmation')}
        >
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full mx-auto flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
            
            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                확언 EFT
              </h3>
              <p className="text-gray-600 text-sm mb-4">
                개인 맞춤형 확언과 함께 즉시 마음의 힘을 기르는 EFT 세션을 시작해보세요
              </p>
              
              <div className="bg-purple-50 p-3 rounded-lg mb-4">
                <h4 className="font-medium text-purple-900 mb-2">이런 분께 추천</h4>
                <ul className="text-sm text-purple-700 space-y-1">
                  <li>• 긍정적 마음가짐이 필요하신 분</li>
                  <li>• 자신감을 기르고 싶으신 분</li>
                  <li>• 매일 짧은 루틴을 원하시는 분</li>
                </ul>
              </div>
              
              <div className="text-xs text-gray-500 mb-4">
                ⏱️ 소요시간: 5-10분 | ✨ 개인 맞춤 확언
              </div>
            </div>
            
            <Button variant="outline" fullWidth>
              확언 시작하기
            </Button>
          </div>
        </Card>
      </div>

      {/* 도움말 섹션 */}
      <Card className="p-4 bg-gray-50">
        <div className="text-center">
          <h4 className="font-medium text-gray-900 mb-2">
            💡 잘 모르겠으시나요?
          </h4>
          <p className="text-sm text-gray-600 mb-3">
            처음 사용하시거나 어떤 방식이 좋을지 모르시겠다면 <strong>AI 동반자와 대화하기</strong>를 추천드려요.
          </p>
          <div className="text-xs text-gray-500">
            *모든 대화는 안전하게 보호되며, 전문적 치료가 필요한 경우 전문가 상담을 권해드립니다.
          </div>
        </div>
      </Card>
    </div>
  );
};

export default RouteSelection;