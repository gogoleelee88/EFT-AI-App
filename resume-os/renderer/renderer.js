// Renderer 엔트리: React UMD를 사용한 최소 진입점
const { useState, useEffect } = React;
const { createRoot } = ReactDOM;

function App() {
  const [now, setNow] = useState(new Date());
  const [activeNudge, setActiveNudge] = useState(null);
  const [fadeKey, setFadeKey] = useState(0);
  const [unknownActivity, setUnknownActivity] = useState(null);
  const [customName, setCustomName] = useState('');
  const [customDesc, setCustomDesc] = useState('');

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // resumeOS.onNudge 등록: Proactive Coach에서 nudge 발생 시 카드 표시
  useEffect(() => {
    if (!window.resumeOS || typeof window.resumeOS.onNudge !== 'function') return;
    window.resumeOS.onNudge((payload) => {
      setActiveNudge(payload);
      setFadeKey((k) => k + 1);
    });
  }, []);

  // Unknown_Activity → 새로운 동작 등록 카드 표시
  useEffect(() => {
    if (!window.resumeOS || typeof window.resumeOS.onUnknownActivity !== 'function') return;
    window.resumeOS.onUnknownActivity((payload) => {
      setUnknownActivity(payload);
      setCustomName('');
      setCustomDesc('');
    });
  }, []);

  const handleRespond = (action, snoozeMinutes) => {
    if (window.resumeOS && typeof window.resumeOS.respondNudge === 'function' && activeNudge) {
      window.resumeOS.respondNudge({ id: activeNudge.id, action, snoozeMinutes });
    }
    setActiveNudge(null);
  };

  const handleRegisterCustom = () => {
    if (
      !unknownActivity ||
      !customName.trim() ||
      !window.resumeOS ||
      typeof window.resumeOS.registerCustomActivity !== 'function'
    ) {
      return;
    }
    window.resumeOS.registerCustomActivity({
      bufferId: unknownActivity.bufferId,
      name: customName.trim(),
      description: customDesc.trim() || undefined,
    });
    setUnknownActivity(null);
    setCustomName('');
    setCustomDesc('');
  };

  const handleDismissUnknown = () => {
    setUnknownActivity(null);
    setCustomName('');
    setCustomDesc('');
  };

  return React.createElement(
    'div',
    { style: { maxWidth: 720, padding: 24 } },
    React.createElement('h1', { style: { fontSize: 28, marginBottom: 8 } }, '🧭 실행 복귀 OS (MVP 스켈레톤)'),
    React.createElement(
      'p',
      { style: { fontSize: 14, color: '#9ca3af', marginBottom: 16 } },
      '데스크톱 에이전트 + 로컬 백엔드 구조를 위한 초기 셸입니다.'
    ),
    React.createElement(
      'div',
      {
        style: {
          marginTop: 12,
          padding: 16,
          borderRadius: 12,
          background: 'rgba(15,23,42,0.7)',
          border: '1px solid rgba(148,163,184,0.3)',
        },
      },
      React.createElement(
        'h2',
        { style: { fontSize: 16, marginBottom: 8 } },
        '현재 상태'
      ),
      React.createElement(
        'ul',
        { style: { fontSize: 14, lineHeight: 1.6, paddingLeft: 20 } },
        React.createElement('li', null, `로컬 시간: ${now.toLocaleTimeString()}`),
        React.createElement('li', null, 'sensors/, engine/, ui/, storage/ 모듈은 다음 단계에서 채워집니다.'),
        React.createElement('li', null, '이 창은 Electron 메인 프로세스(main.js)가 띄운 React 렌더러입니다.')
      ),
      activeNudge &&
        React.createElement(
          'div',
          {
            key: fadeKey,
            style: {
              marginTop: 16,
              padding: 16,
              borderRadius: 12,
              background: 'rgba(15,23,42,0.95)',
              border: '1px solid rgba(251,191,36,0.8)',
              boxShadow: '0 10px 25px rgba(15,23,42,0.8)',
            },
          },
          React.createElement(
            'div',
            { style: { fontSize: 14, color: '#fbbf24', marginBottom: 4 } },
            activeNudge.type === 'RESUME'
              ? '⏱️ 다시 이어서 하실까요?'
              : activeNudge.type === 'STUCK_NUDGE'
              ? '🧩 막힌 부분을 풀어볼까요?'
              : '📌 잠깐 방향을 다시 잡을까요?'
          ),
          React.createElement(
            'p',
            { style: { fontSize: 13, color: '#e5e7eb', marginBottom: 12 } },
            `현재 상태: ${activeNudge.state} · 보낸 시각: ${new Date(
              activeNudge.ts
            ).toLocaleTimeString()}`
          ),
          React.createElement(
            'div',
            { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
            React.createElement(
              'button',
              {
                onClick: () => handleRespond('accept'),
                style: {
                  padding: '6px 10px',
                  borderRadius: 999,
                  border: '1px solid rgba(34,197,94,0.9)',
                  background: 'rgba(22,163,74,0.9)',
                  color: '#ecfdf5',
                  fontSize: 12,
                  cursor: 'pointer',
                },
              },
              '네, 이어서 할게요'
            ),
            React.createElement(
              'button',
              {
                onClick: () => handleRespond('snooze', 30),
                style: {
                  padding: '6px 10px',
                  borderRadius: 999,
                  border: '1px solid rgba(148,163,184,0.9)',
                  background: 'rgba(30,64,175,0.7)',
                  color: '#e0f2fe',
                  fontSize: 12,
                  cursor: 'pointer',
                },
              },
              '30분 뒤에 알려줘'
            ),
            React.createElement(
              'button',
              {
                onClick: () => handleRespond('dismiss'),
                style: {
                  padding: '6px 10px',
                  borderRadius: 999,
                  border: '1px solid rgba(148,163,184,0.9)',
                  background: 'transparent',
                  color: '#9ca3af',
                  fontSize: 12,
                  cursor: 'pointer',
                },
              },
              '지금은 괜찮아요'
            )
          )
      ),
      unknownActivity &&
        React.createElement(
          'div',
          {
            style: {
              marginTop: 16,
              padding: 16,
              borderRadius: 12,
              background: 'rgba(15,23,42,0.95)',
              border: '1px solid rgba(96,165,250,0.8)',
              boxShadow: '0 10px 25px rgba(15,23,42,0.8)',
            },
          },
          React.createElement(
            'div',
            { style: { fontSize: 14, color: '#93c5fd', marginBottom: 4 } },
            '✨ 새로운 동작을 발견했어요'
          ),
          React.createElement(
            'p',
            { style: { fontSize: 13, color: '#e5e7eb', marginBottom: 8 } },
            `시각: ${new Date(unknownActivity.ts).toLocaleTimeString()} · 상태 추정: ${unknownActivity.state}`
          ),
          React.createElement(
            'p',
            { style: { fontSize: 12, color: '#9ca3af', marginBottom: 8 } },
            '이 동작에 이름을 붙여두면 다음부터는 자동으로 인식할 수 있어요.'
          ),
          React.createElement(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 } },
            React.createElement('input', {
              value: customName,
              onChange: (e) => setCustomName(e.target.value),
              placeholder: '동작 이름 (예: 유튜브 딴짓 루틴)',
              style: {
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid rgba(148,163,184,0.9)',
                background: 'rgba(15,23,42,0.9)',
                color: '#e5e7eb',
                fontSize: 12,
              },
            }),
            React.createElement('input', {
              value: customDesc,
              onChange: (e) => setCustomDesc(e.target.value),
              placeholder: '선택: 이 동작에 대한 메모',
              style: {
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid rgba(148,163,184,0.5)',
                background: 'rgba(15,23,42,0.9)',
                color: '#e5e7eb',
                fontSize: 12,
              },
            })
          ),
          React.createElement(
            'div',
            { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
            React.createElement(
              'button',
              {
                onClick: handleRegisterCustom,
                style: {
                  padding: '6px 10px',
                  borderRadius: 999,
                  border: '1px solid rgba(59,130,246,0.9)',
                  background: 'rgba(37,99,235,0.9)',
                  color: '#eff6ff',
                  fontSize: 12,
                  cursor: 'pointer',
                },
              },
              '이 패턴 저장'
            ),
            React.createElement(
              'button',
              {
                onClick: handleDismissUnknown,
                style: {
                  padding: '6px 10px',
                  borderRadius: 999,
                  border: '1px solid rgba(148,163,184,0.9)',
                  background: 'transparent',
                  color: '#9ca3af',
                  fontSize: 12,
                  cursor: 'pointer',
                },
              },
              '이번엔 무시'
            )
          )
        )
    )
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(React.createElement(App));
}

