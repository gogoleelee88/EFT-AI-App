import React from 'react';
import { useNavigate } from 'react-router-dom';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  const handleGetStarted = () => {
    // 앱 시작 - 로그인/회원가입으로 이동
    navigate('/');
  };

  return (
    <div className="bg-black text-white leading-relaxed" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
      {/* 전역 스타일 */}
      <style>{`
        .text-accent { color: #FFD700; }
        .bg-accent { background-color: #FFD700; }
        .btn-glow:hover { box-shadow: 0 0 15px #FFD700; transform: translateY(-2px); transition: all 0.3s; }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: #1a1a1a; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #555; }
      `}</style>

      {/* Navigation */}
      <nav className="fixed w-full z-50 bg-black/80 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
          <img src="/이름.png" alt="TOCMOOD Logo" className="h-8 md:h-10 object-contain" />
          <a href="#footer-form" className="bg-white text-black px-4 py-2 rounded-full font-bold text-sm hover:bg-gray-200 transition">
            알림 신청하기
          </a>
        </div>
      </nav>

      {/* Header */}
      <header className="relative w-full h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img src="/제목을 입력해주세요..png" alt="Background" className="w-full h-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black"></div>
        </div>

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto mt-10">
          <p className="text-accent font-bold tracking-widest mb-4 animate-pulse">SYSTEMATIC MOOD MANAGEMENT</p>
          <h1 className="text-4xl md:text-6xl font-black mb-6 leading-tight">
            감정은 참는 것이 아니라,<br />
            <span className="text-white border-b-4 border-accent">시스템으로 관리</span>하는 것입니다.
          </h1>
          <p className="text-gray-300 text-lg md:text-xl mb-8 font-light">
            MoodTalk: 세계 최초 행동 재진입(Behavioral Re-entry) AI<br />
            <span className="text-sm md:text-base text-gray-400 mt-2 block">
              구글 리더십 코치와 엘리트 스포츠 팀의 멘탈 프로토콜 탑재 | 12월 13일 공개
            </span>
          </p>

          <div className="flex flex-col md:flex-row gap-4 justify-center">
            <a href="#footer-form" className="bg-accent text-black px-8 py-4 rounded-lg font-bold text-lg btn-glow flex items-center justify-center gap-2">
              <i className="fa-solid fa-rocket"></i> 텀블벅 펀딩 알림 신청
            </a>
            <button
              onClick={handleGetStarted}
              className="border border-white text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-white hover:text-black transition flex items-center justify-center gap-2"
            >
              <i className="fa-regular fa-calendar-check"></i> 앱 시작하기
            </button>
          </div>
        </div>
      </header>

      {/* Section 1 */}
      <section className="py-20 bg-gray-900">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              "불안해서 일이 손에 안 잡히나요?<br />
              <span className="text-accent">'힘내'라는 말은 그만두겠습니다."</span>
            </h2>
            <p className="text-gray-400">말뿐인 위로 대신, 뇌과학에 기반한 확실한 솔루션을 제공합니다.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-gray-700 group">
              {/* Video 대신 이미지로 대체 가능 */}
              <div className="w-full h-64 bg-gray-800 flex items-center justify-center">
                <p className="text-gray-500">EFT 데모 영상 영역</p>
              </div>
              <div className="absolute bottom-4 left-4 bg-black/70 px-3 py-1 rounded text-xs text-accent">
                🔴 AI 기반 EFT 가이드 시연 중
              </div>
            </div>

            <div className="space-y-8">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center text-accent text-xl shrink-0">
                  <i className="fa-solid fa-microscope"></i>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">1. Intake (정밀 분석)</h3>
                  <p className="text-gray-400 text-sm">단순히 "기분이 나빠"가 아닙니다. 감정의 해상도를 높여 문제의 진짜 원인을 포착합니다.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center text-accent text-xl shrink-0">
                  <i className="fa-solid fa-fingerprint"></i>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">2. Somatic Reset (신체 개입)</h3>
                  <p className="text-gray-400 text-sm">불안한 뇌를 끄는 물리적 스위치. AR 기반 EFT 태핑과 호흡으로 즉각적인 생리학적 안정을 유도합니다.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center text-accent text-xl shrink-0">
                  <i className="fa-solid fa-rotate"></i>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">3. Re-entry (행동 재진입)</h3>
                  <p className="text-gray-400 text-sm">감정 소모 3시간 → 30초. 감정을 털어내고 다시 '몰입'의 상태로 돌아가는 가장 빠른 길을 제시합니다.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2 */}
      <section className="py-20 bg-black relative">
        <div className="max-w-6xl mx-auto px-4 grid md:grid-cols-2 gap-12 items-center">
          <div className="order-2 md:order-1">
            <img src="/서비스이름.png" alt="Emotional Struggle" className="rounded-lg shadow-lg opacity-80 hover:opacity-100 transition duration-500" />
            <p className="text-center text-xs text-gray-500 mt-2">TOCMOOD: 태도를 무너뜨리는 기분을 톡</p>
          </div>

          <div className="order-1 md:order-2">
            <h2 className="text-3xl font-bold mb-6">
              올림픽 메달리스트와 CEO들은<br />
              멘탈을 어떻게 관리할까요?
            </h2>
            <div className="w-20 h-1 bg-accent mb-6"></div>
            <p className="text-gray-300 mb-6 leading-relaxed">
              그들은 멘탈이 강하게 태어난 것이 아닙니다. <br />
              <strong>관리는 기술(Skill)입니다.</strong>
            </p>
            <p className="text-gray-400 mb-6 leading-relaxed text-sm">
              MoodTalk는 임상심리(CBT/ACT), 퍼포먼스 심리학, 그리고 도파민 시스템 관리 이론을 통합하여 당신의 스마트폰에 탑재했습니다.<br /><br />
              우리는 명상 앱이 아닙니다. 당신의 압도적 성과를 위한 <strong>'멘탈 엔지니어링 도구'</strong>입니다.
            </p>
          </div>
        </div>
      </section>

      {/* Roadmap Section */}
      <section className="py-20 bg-gray-900 text-center">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl font-bold mb-12">PROJECT ROADMAP</h2>

          <div className="space-y-8">
            {/* 로드맵 아이템들 */}
            <div className="p-4 rounded border border-gray-700 bg-gray-800 shadow">
              <div className="flex items-center justify-between space-x-2 mb-1">
                <div className="font-bold text-white">MODUCON 2025 발표</div>
                <time className="font-mono text-xs text-accent">12.05</time>
              </div>
              <div className="text-gray-400 text-xs text-left">컨트리뷰션 세션 참가 및 프로젝트 비전 공개</div>
            </div>

            <div className="p-4 rounded border border-gray-600 bg-gray-800 shadow">
              <div className="flex items-center justify-between space-x-2 mb-1">
                <div className="font-bold text-white">AI 라이브 데모 공개</div>
                <time className="font-mono text-xs text-accent">12.13</time>
              </div>
              <div className="text-gray-400 text-xs text-left">GPU 서버 오픈 및 실시간 시연 영상 공개</div>
            </div>

            <div className="p-4 rounded border border-gray-700 bg-gray-800 shadow opacity-50">
              <div className="flex items-center justify-between space-x-2 mb-1">
                <div className="font-bold text-white">텀블벅 크라우드 펀딩</div>
                <time className="font-mono text-xs text-gray-500">Coming Soon</time>
              </div>
              <div className="text-gray-400 text-xs text-left">얼리버드 혜택 오픈 예정</div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="footer-form" className="bg-black py-20 border-t border-gray-800 text-center">
        <div className="max-w-xl mx-auto px-4">
          <img src="/이름.png" alt="TOCMOOD Logo" className="h-12 mx-auto mb-8 opacity-80" />

          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            남들보다 먼저 MoodTalk를 경험하세요.
          </h2>
          <p className="text-gray-400 mb-8">
            12월 13일 데모 공개 알림과 텀블벅 얼리버드 혜택을<br />
            가장 먼저 문자로 보내드립니다. (스팸 없음, 100% 무료)
          </p>

          <a href="https://forms.google.com" target="_blank" rel="noopener noreferrer" className="block w-full bg-accent text-black font-bold text-lg py-4 rounded-lg hover:bg-yellow-400 transition mb-4">
            지금 알림 신청하기 (클릭)
          </a>

          <p className="text-gray-600 text-xs mt-8">
            © 2025 TOCMOOD. All rights reserved.<br />
            Contact: moodtalk_official@email.com
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
