import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PWAInstallPrompt from '../components/feature/PWAInstallPrompt';

// 레벨별 색상 및 이모티콘 정의 (설계서 기반)
const LEVEL_STYLES = {
  1: { color: '#CD7F32', emoji: '🌱', title: '새싹 탐험가' },
  2: { color: '#CD7F32', emoji: '🌿', title: '마음 탐험가' },
  3: { color: '#C0C0C0', emoji: '🌳', title: '심리 마스터' },
  4: { color: '#FFD700', emoji: '🏆', title: '통찰 전문가' },
  5: { color: '#E5E4E2', emoji: '💎', title: '마음 현자' }
};

// 통찰 데이터 (설계서의 32개 공통 통찰 예시)
const COMMON_INSIGHTS = [
  { id: 1, title: '미루기 습관 완전 끝내는 법', progress: 100, category: 'productivity' },
  { id: 2, title: '나의 기본 성격 패턴 분석', progress: 100, category: 'personality' },
  { id: 3, title: '스트레스를 힘으로 바꾸는 법', progress: 100, category: 'stress' },
  { id: 4, title: '연애 패턴 분석', progress: 82, category: 'relationship' },
  { id: 5, title: '돈 걱정 해결법', progress: 15, category: 'finance' },
  { id: 6, title: '갈등→기회 대화법', progress: 8, category: 'communication' },
];

// 개인 맞춤 통찰 데이터 (설계서 기반)
const PERSONAL_INSIGHTS = [
  { id: 'p1', title: '권위자 관계 치유법', confidence: 89, category: 'personal' },
  { id: 'p2', title: '완벽주의 극복 나만의 방법', confidence: 76, category: 'personal' },
];

interface EFTUser {
  uid: string;
  email: string | null;
  name: string | null;
  photoURL: string | null;
  level: number;
  xp: number;
  nextLevelXp: number;
  gems: number;
  badges: number;
  streak: number;
  createdAt: Date;
  lastLogin: Date;
  privacySettings: {
    dataCollection: boolean;
    aiLearning: boolean;
  };
  completedQuests: string[];
  unlockedInsights: string[];
}

interface DashboardProps {
  user?: EFTUser | null;
}

const Dashboard: React.FC<DashboardProps> = ({ user }) => {
  const navigate = useNavigate();
  
  // 사용자 데이터가 없으면 기본값 사용 (로딩 중이거나 오류 상황)
  const currentUser = user || {
    uid: 'demo',
    email: null,
    name: '마음탐험가',
    photoURL: null,
    level: 3,
    xp: 2847,
    nextLevelXp: 4000,
    gems: 127,
    badges: 7,
    streak: 5,
    createdAt: new Date(),
    lastLogin: new Date(),
    privacySettings: {
      dataCollection: true,
      aiLearning: true
    },
    completedQuests: [],
    unlockedInsights: []
  };
  const [newInsightAlert, setNewInsightAlert] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [dailyQuests, setDailyQuests] = useState({
    emotionCheck: true,
    aiChat: true,
    affirmationEFT: false
  });

  // 레벨 진행률 계산
  const levelProgress = (currentUser.xp / currentUser.nextLevelXp) * 100;
  const currentLevelStyle = LEVEL_STYLES[currentUser.level as keyof typeof LEVEL_STYLES] || LEVEL_STYLES[1];

  // 완료된 일일 퀘스트 수 계산
  const completedQuests = Object.values(dailyQuests).filter(Boolean).length;
  const totalQuests = Object.keys(dailyQuests).length;

  // 완료된 통찰 수 계산
  const completedInsights = COMMON_INSIGHTS.filter(insight => insight.progress === 100).length;
  const inProgressInsights = COMMON_INSIGHTS.filter(insight => insight.progress > 0 && insight.progress < 100);

  // 메뉴 토글
  const toggleMenu = () => {
    setShowMenu(!showMenu);
  };

  // 통찰 해제 알림 닫기
  const handleCloseInsightAlert = () => {
    setNewInsightAlert(false);
  };

  // 각 액션 버튼 핸들러들
  const handleStartAIChat = () => {
    console.log('AI 대화 시작');
    setShowMenu(false);
    navigate('/ai-chat');
  };

  const handleEmotionCheck = () => {
    console.log('감정 체크인 시작');
    setShowMenu(false);
  };

  const handleAffirmationEFT = () => {
    console.log('확언 EFT 시작');
    setShowMenu(false);
  };

  const handle3DGuide = () => {
    console.log('3D/AR EFT 가이드 시작');
    setShowMenu(false);
    navigate('/eft-guide'); // EFT 세션 선택기로 이동
  };

  const handleViewInsight = (insightId: string | number) => {
    console.log('통찰 보기:', insightId);
    setShowMenu(false);
  };

  const handleStartStressSession = () => {
    console.log('스트레스 완화 세션 시작');
  };

  const handleMenuItemClick = (item: string) => {
    console.log(`메뉴 클릭: ${item}`);
    setShowMenu(false);
    
    // 메뉴 항목별 네비게이션 처리
    switch (item) {
      case 'AI 상담':
        navigate('/ai-chat');
        break;
      case 'EFT 세션':
        navigate('/eft-guide'); // EFT 세션 선택기로 이동
        break;
      case '감정 체크인':
        handleEmotionCheck();
        break;
      case '나의 통찰':
        // 통찰 페이지로 이동 (추후 구현)
        console.log('통찰 페이지로 이동');
        break;
      case '내 프로필':
        // 프로필 페이지로 이동 (추후 구현)
        console.log('프로필 페이지로 이동');
        break;
      default:
        console.log(`${item} 메뉴 - 추후 구현 예정`);
    }
  };

  // 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = () => {
      if (showMenu) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showMenu]);

  return (
    <div className="min-h-screen lg:min-h-0 bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50 lg:bg-transparent">
      {/* RPG 헤더 (설계서 § 3. 메인 대시보드) */}
      <div className="bg-white shadow-lg border-b-2 border-indigo-100 sticky top-0 z-40">
        <div className="max-w-md mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">{currentLevelStyle.emoji}</span>
              <div>
                <div className="text-sm text-gray-600">Lv.{currentUser.level}</div>
                <div className="font-bold text-gray-800">{currentUser.name}</div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <div className="text-sm text-amber-600">💎 {currentUser.gems}</div>
              </div>
              {/* 햄버거 메뉴 (설계서 § 10. 네비게이션 설계) */}
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMenu();
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative"
              >
                <div className="w-6 h-6 flex flex-col justify-center items-center space-y-1">
                  <div className="w-5 h-0.5 bg-gray-600"></div>
                  <div className="w-5 h-0.5 bg-gray-600"></div>
                  <div className="w-5 h-0.5 bg-gray-600"></div>
                </div>
                {newInsightAlert && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></div>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 슬라이드 메뉴 (설계서 § 10. 네비게이션 설계 - ☰ 메뉴 구조 상세) */}
      {showMenu && (
        <>
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setShowMenu(false)}
          ></div>
          
          <div 
            className="fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-50 transform transition-transform duration-300 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-800">메뉴</h2>
                <button 
                  onClick={() => setShowMenu(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <span className="text-xl text-gray-500">✕</span>
                </button>
              </div>

              {/* 메뉴 항목들 (설계서 정확한 구조) */}
              <div className="space-y-4">
                <button 
                  onClick={() => handleMenuItemClick('AI 상담')}
                  className="w-full flex items-center space-x-3 p-3 text-left hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <span className="text-xl">💬</span>
                  <span className="font-medium">AI 상담</span>
                  <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full">핵심</span>
                </button>

                <button 
                  onClick={() => handleMenuItemClick('감정 체크인')}
                  className="w-full flex items-center space-x-3 p-3 text-left hover:bg-red-50 rounded-lg transition-colors"
                >
                  <span className="text-xl">❤️</span>
                  <span className="font-medium">감정 체크인</span>
                </button>

                <button 
                  onClick={() => handleMenuItemClick('EFT 세션')}
                  className="w-full flex items-center space-x-3 p-3 text-left hover:bg-amber-50 rounded-lg transition-colors"
                >
                  <span className="text-xl">✨</span>
                  <span className="font-medium">EFT 세션</span>
                </button>

                <button 
                  onClick={() => handleMenuItemClick('나의 통찰')}
                  className="w-full flex items-center space-x-3 p-3 text-left hover:bg-purple-50 rounded-lg transition-colors"
                >
                  <span className="text-xl">🔮</span>
                  <span className="font-medium">나의 통찰</span>
                  {newInsightAlert && (
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  )}
                </button>

                <button 
                  onClick={() => handleMenuItemClick('내 프로필')}
                  className="w-full flex items-center space-x-3 p-3 text-left hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <span className="text-xl">👤</span>
                  <span className="font-medium">내 프로필</span>
                </button>

                {/* 설정 섹션 (설계서 § 10. 네비게이션 - 설정 하위메뉴) */}
                <div className="border-t pt-4 mt-6">
                  <div className="text-sm font-medium text-gray-500 mb-3">설정</div>
                  
                  <button 
                    onClick={() => handleMenuItemClick('알림 설정')}
                    className="w-full flex items-center space-x-3 p-3 text-left hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <span className="text-lg">🔔</span>
                    <span className="text-sm">알림 설정</span>
                  </button>

                  <button 
                    onClick={() => handleMenuItemClick('테마 설정')}
                    className="w-full flex items-center space-x-3 p-3 text-left hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <span className="text-lg">🎨</span>
                    <span className="text-sm">테마 설정</span>
                  </button>

                  <button 
                    onClick={() => handleMenuItemClick('개인정보')}
                    className="w-full flex items-center space-x-3 p-3 text-left hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <span className="text-lg">🔒</span>
                    <span className="text-sm">개인정보</span>
                  </button>

                  <button 
                    onClick={() => handleMenuItemClick('고객지원')}
                    className="w-full flex items-center space-x-3 p-3 text-left hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <span className="text-lg">📞</span>
                    <span className="text-sm">고객지원</span>
                  </button>
                </div>

                {/* 로그아웃 */}
                <div className="border-t pt-4 mt-6">
                  <button 
                    onClick={() => handleMenuItemClick('로그아웃')}
                    className="w-full flex items-center space-x-3 p-3 text-left hover:bg-red-50 rounded-lg transition-colors text-red-600"
                  >
                    <span className="text-lg">🚪</span>
                    <span className="text-sm font-medium">로그아웃</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 메인 콘텐츠 (설계서 § 3. 메인 대시보드 최종 확정 레이아웃) */}
      <div className="max-w-md mx-auto px-4 py-4 space-y-4 pb-6">
        
        {/* PWA 설치 프롬프트 */}
        <PWAInstallPrompt />
        
        {/* 일일 퀘스트 현황 (설계서 정확한 구조) */}
        <Card className="bg-gradient-to-r from-violet-500 to-purple-600 text-white border-none">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold">⚡ 오늘의 일일 퀘스트 ({completedQuests}/{totalQuests} 완료) +50XP</div>
            </div>
          </div>
          <div className="flex space-x-4 mt-2 text-sm">
            <span className={dailyQuests.emotionCheck ? "text-green-300" : "text-white opacity-70"}>
              {dailyQuests.emotionCheck ? "☑️" : "⬜"} 감정 체크인
            </span>
            <span className={dailyQuests.aiChat ? "text-green-300" : "text-white opacity-70"}>
              {dailyQuests.aiChat ? "☑️" : "⬜"} AI 대화
            </span>
            <span className={dailyQuests.affirmationEFT ? "text-green-300" : "text-white opacity-70"}>
              {dailyQuests.affirmationEFT ? "☑️" : "⬜"} 확언 EFT
            </span>
          </div>
        </Card>

        {/* 메인 퀘스트 진행도 (설계서 통찰 해제 퀘스트) */}
        <Card>
          <div className="space-y-3">
            <div className="font-bold text-gray-800">🎯 메인 퀘스트: 진행 중</div>
            <div>
              <div className="text-lg font-medium">🔮 "연애 패턴 분석" 해제 중</div>
              <div className="mt-2">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>진행률</span>
                  <span>82%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: '82%' }}
                  ></div>
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  (AI 대화 2회 더!)
                </div>
              </div>
              <div className="text-sm text-gray-600 mt-2">
                💡 완료 시: +200XP + "연애전문가" 뱃지
              </div>
            </div>
          </div>
        </Card>

        {/* 새로운 통찰 해제 알림 (설계서 통찰 해제 알림) */}
        {newInsightAlert && (
          <Card className="bg-gradient-to-r from-yellow-400 to-amber-500 text-white border-none">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="font-bold">🎉 새로운 통찰 해제! 🔓</div>
                <div className="text-sm opacity-90">💎 "미루기 습관 완전 끝내는 법" 생성됨!</div>
              </div>
              <div className="flex space-x-2">
                <Button 
                  size="sm" 
                  className="bg-white text-amber-600 hover:bg-gray-100"
                  onClick={() => handleViewInsight('procrastination')}
                >
                  지금 확인
                </Button>
                <button 
                  onClick={handleCloseInsightAlert}
                  className="text-white hover:text-gray-200"
                >
                  ✕
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* 메인 액션 - AI 대화 (설계서 메인 액션) */}
        <Card className="border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50">
          <div className="text-center space-y-4">
            <div className="text-lg font-bold text-gray-800">💬 마음 속 이야기를 들려주세요</div>
            <Button 
              variant="primary" 
              size="lg" 
              fullWidth
              onClick={handleStartAIChat}
              className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold py-4"
            >
              AI 동반자와 대화 시작
            </Button>
          </div>
        </Card>

        {/* 빠른 시작 (설계서 3가지 루트) */}
        <Card>
          <div className="space-y-3">
            <div className="font-bold text-gray-800">🎯 빠른 시작</div>
            <div className="grid grid-cols-3 gap-3">
              <Button 
                variant="outline" 
                className="h-16 flex flex-col items-center justify-center space-y-1 border-red-200 text-red-600 hover:bg-red-50"
                onClick={handleEmotionCheck}
              >
                <span className="text-lg">❤️</span>
                <span className="text-xs">감정체크</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-16 flex flex-col items-center justify-center space-y-1 border-amber-200 text-amber-600 hover:bg-amber-50"
                onClick={handleAffirmationEFT}
              >
                <span className="text-lg">✨</span>
                <span className="text-xs">확언EFT</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-16 flex flex-col items-center justify-center space-y-1 border-blue-200 text-blue-600 hover:bg-blue-50"
                onClick={handle3DGuide}
              >
                <span className="text-lg">🎧</span>
                <span className="text-xs">3D가이드</span>
              </Button>
            </div>
          </div>
        </Card>

        {/* 통찰 해제 현황 (설계서 32개 통찰 시스템) */}
        <Card>
          <div className="space-y-4">
            <div className="font-bold text-gray-800">🔮 통찰 해제 현황 (혁신 기능!)</div>
            
            {/* 해제완료 통찰 */}
            <div>
              <div className="text-sm font-medium text-gray-600 mb-2">해제완료 ({completedInsights}/32)</div>
              <div className="grid grid-cols-1 gap-2">
                {COMMON_INSIGHTS.filter(insight => insight.progress === 100).slice(0, 3).map(insight => (
                  <div 
                    key={insight.id}
                    className="flex items-center space-x-2 p-2 bg-green-50 rounded-lg cursor-pointer hover:bg-green-100 transition-colors"
                    onClick={() => handleViewInsight(insight.id)}
                  >
                    <span className="text-green-600">✨</span>
                    <span className="text-sm text-green-800 flex-1">{insight.title}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 진행중 통찰 */}
            <div>
              <div className="text-sm font-medium text-gray-600 mb-2">진행중</div>
              <div className="grid grid-cols-1 gap-2">
                {inProgressInsights.slice(0, 3).map(insight => (
                  <div 
                    key={insight.id}
                    className="flex items-center space-x-2 p-2 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => handleViewInsight(insight.id)}
                  >
                    <span className="text-gray-400">🔒</span>
                    <div className="flex-1">
                      <div className="text-sm text-gray-700">{insight.title}</div>
                      <div className="text-xs text-gray-500">{insight.progress}% 완료</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* 개인 맞춤 통찰 (설계서 AI 생성 통찰) */}
        <Card className="bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200">
          <div className="space-y-3">
            <div className="font-bold text-gray-800">🌟 개인 맞춤 통찰 ({PERSONAL_INSIGHTS.length}개 생성!)</div>
            <div className="space-y-2">
              {PERSONAL_INSIGHTS.map(insight => (
                <div 
                  key={insight.id}
                  className="flex items-center space-x-2 p-3 bg-white rounded-lg cursor-pointer hover:shadow-md transition-all border border-purple-100"
                  onClick={() => handleViewInsight(insight.id)}
                >
                  <span className="text-purple-600">💎</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-800">{insight.title}</div>
                    <div className="text-xs text-purple-600">신뢰도 {insight.confidence}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* 성장 현황 (설계서 레벨업 진행도) */}
        <Card>
          <div className="space-y-4">
            <div className="font-bold text-gray-800">📊 성장현황</div>
            
            <div>
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>다음 레벨까지</span>
                <span>{Math.round(levelProgress)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="h-3 rounded-full transition-all duration-500"
                  style={{ 
                    width: `${levelProgress}%`,
                    background: `linear-gradient(to right, ${currentLevelStyle.color}, #6366F1)`
                  }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {currentUser.xp.toLocaleString()} / {currentUser.nextLevelXp.toLocaleString()} XP
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="p-3 bg-amber-50 rounded-lg">
                <div className="text-2xl">🏆</div>
                <div className="text-sm font-medium text-gray-700">뱃지 {currentUser.badges}개</div>
              </div>
              <div className="p-3 bg-red-50 rounded-lg">
                <div className="text-2xl">🔥</div>
                <div className="text-sm font-medium text-gray-700">연속 {currentUser.streak}일</div>
              </div>
            </div>
          </div>
        </Card>

        {/* AI 개인화 추천 (설계서 AI 추천) */}
        <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200">
          <div className="space-y-3">
            <div className="font-bold text-gray-800">💡 AI 개인화 추천</div>
            <div className="text-sm text-gray-700">
              "최근 패턴 분석 결과, 목요일 오후 스트레스 관리가 필요해 보여요"
            </div>
            <Button 
              variant="primary" 
              fullWidth
              onClick={handleStartStressSession}
              className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
            >
              스트레스 완화 세션 🎯
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;