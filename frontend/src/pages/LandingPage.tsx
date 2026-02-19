import React from 'react';
import { useNavigate } from 'react-router-dom';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  const handleGetStarted = () => {
    navigate('/');
  };

  return (
    <div className="bg-black text-white leading-relaxed" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
      <style>{`
        .text-accent { color: #FFD700; }
        .bg-accent { background-color: #FFD700; }
        .btn-glow:hover { box-shadow: 0 0 15px #FFD700; transform: translateY(-2px); transition: all 0.3s; }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: #1a1a1a; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #555; }
      `}</style>

      <nav className="fixed w-full z-50 bg-black/80 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
          <img src="/이름.png" alt="TOCMOOD Logo" className="h-8 md:h-10 object-contain" />
          <div className="flex gap-3 items-center">
            <button
              onClick={() => navigate('/login')}
              className="border border-white text-white px-4 py-2 rounded-full font-bold text-sm hover:bg-white hover:text-black transition"
            >
              로그인
            </button>
          </div>
        </div>
      </nav>

      <header className="relative w-full h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img src="/제목을 입력해주세요..png" alt="Background" className="w-full h-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black"></div>
        </div>

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto mt-10">
          <p className="text-accent font-bold tracking-widest mb-4 animate-pulse">SYSTEMATIC MOOD MANAGEMENT</p>
          <h1 className="text-4xl md:text-6xl font-black mb-6 leading-tight">
            감정을 참는 것이 아니라<br />
            <span className="text-white border-b-4 border-accent">시스템으로 관리</span>하는 것입니다.
          </h1>
          <p className="text-gray-300 text-lg md:text-xl mb-8 font-light">
            MoodTalk: 업계 최초 행동 재진입(Behavioral Re-entry) AI<br />
            <span className="text-sm md:text-base text-gray-400 mt-2 block">
              글로벌 리더와 코치가 쓰는 멘탈 프로토콜 탑재 | 12월 13일 공개
            </span>
          </p>

          <div className="flex flex-col md:flex-row gap-4 justify-center">
            <button
              onClick={handleGetStarted}
              className="border border-white text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-white hover:text-black transition flex items-center justify-center gap-2"
            >
              <i className="fa-regular fa-calendar-check"></i> 무료 시작하기
            </button>
          </div>
        </div>
      </header>

      <section className="py-20 bg-gray-900">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              "불안에서 왜 계속 흔들릴까요?<br />
              <span className="text-accent">'정신력'만으로는 오래 버티기 어렵습니다."</span>
            </h2>
            <p className="text-gray-400">근거 기반 프로토콜로 감정 조절의 재현 가능한 루틴을 제공합니다.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-gray-700 group">
              <div className="w-full h-64 bg-gray-800 flex items-center justify-center">
                <p className="text-gray-500">EFT 데모 영상 영역</p>
              </div>
              <div className="absolute bottom-4 left-4 bg-black/70 px-3 py-1 rounded text-xs text-accent">
                AI 기반 EFT 가이드 시연 중
              </div>
            </div>

            <div className="space-y-8">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center text-accent text-xl shrink-0">
                  <i className="fa-solid fa-microscope"></i>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">1. Intake (정밀 분석)</h3>
                  <p className="text-gray-400 text-sm">단순한 "기분 체크"가 아닙니다. 감정의 트리거를 좁혀 문제의 실제 원인을 찾아갑니다.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center text-accent text-xl shrink-0">
                  <i className="fa-solid fa-fingerprint"></i>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">2. Somatic Reset (신체 개입)</h3>
                  <p className="text-gray-400 text-sm">불안을 다루는 신체 루틴에 AR 기반 EFT 태핑과 호흡을 결합해 즉각적이고 안정적인 리셋을 유도합니다.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center text-accent text-xl shrink-0">
                  <i className="fa-solid fa-rotate"></i>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">3. Re-entry (행동 재진입)</h3>
                  <p className="text-gray-400 text-sm">감정 소모 3시간을 30초로 줄이고 다시 '몰입' 상태로 돌아갈 수 있는 빠른 길을 제시합니다.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-black relative">
        <div className="max-w-6xl mx-auto px-4 grid md:grid-cols-2 gap-12 items-center">
          <div className="order-2 md:order-1">
            <img src="/서비스이름.png" alt="Emotional Struggle" className="rounded-lg shadow-lg opacity-80 hover:opacity-100 transition duration-500" />
            <p className="text-center text-xs text-gray-500 mt-2">TOCMOOD: 시도를 무너뜨리는 기분의 파도</p>
          </div>

          <div className="order-1 md:order-2">
            <h2 className="text-3xl font-bold mb-6">
              올림픽 메달리스트와 CEO들은<br />
              멘탈을 어떻게 관리할까요?
            </h2>
            <div className="w-20 h-1 bg-accent mb-6"></div>
            <p className="text-gray-300 mb-6 leading-relaxed">
              그들은 멘탈이 강해서 버티는 것이 아닙니다. <br />
              <strong>관리는 기술(Skill)입니다.</strong>
            </p>
            <p className="text-gray-400 mb-6 leading-relaxed text-sm">
              MoodTalk는 임상심리(CBT/ACT), 퍼포먼스 심리, 그리고 생체 리듬 관리를 통합하여 당신의 일상 회복 루틴을 설계합니다.<br /><br />
              더 이상 명상 앱만으로는 부족합니다. 당신의 목표와 성과를 위한 <strong>'멘탈 운영 체계'</strong>가 필요합니다.
            </p>
          </div>
        </div>
      </section>

      <section className="py-20 bg-gray-900 text-center">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl font-bold mb-12">PROJECT ROADMAP</h2>

          <div className="space-y-8">
            <div className="p-4 rounded border border-gray-700 bg-gray-800 shadow">
              <div className="flex items-center justify-between space-x-2 mb-1">
                <div className="font-bold text-white">MODUCON 2025 발표</div>
                <time className="font-mono text-xs text-accent">12.05</time>
              </div>
              <div className="text-gray-400 text-xs text-left">커뮤니티 세션 참가 및 프로젝트 비전 공개</div>
            </div>

            <div className="p-4 rounded border border-gray-600 bg-gray-800 shadow">
              <div className="flex items-center justify-between space-x-2 mb-1">
                <div className="font-bold text-white">AI 라이브 데모 공개</div>
                <time className="font-mono text-xs text-accent">12.13</time>
              </div>
              <div className="text-gray-400 text-xs text-left">GPU 서버 스트림 기반 실시간 시연 영상 공개</div>
            </div>

            <div className="p-4 rounded border border-gray-700 bg-gray-800 shadow opacity-50">
              <div className="flex items-center justify-between space-x-2 mb-1">
                <div className="font-bold text-white">얼리버드 오픈</div>
                <time className="font-mono text-xs text-gray-500">Coming Soon</time>
              </div>
              <div className="text-gray-400 text-xs text-left">얼리버드 신청 오픈 예정</div>
            </div>
          </div>
        </div>
      </section>

      <footer id="footer-form" className="bg-black py-20 border-t border-gray-800 text-center">
        <div className="max-w-xl mx-auto px-4">
          <img src="/이름.png" alt="TOCMOOD Logo" className="h-12 mx-auto mb-8 opacity-80" />

          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            누구보다 먼저 MoodTalk를 경험해보세요
          </h2>
          <p className="text-gray-400 mb-8">
            12월 13일 데모 공개 알림과 얼리버드 신청 소식을<br />
            가장 먼저 문자로 보내드립니다. (스팸 없음, 100% 무료)
          </p>
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
