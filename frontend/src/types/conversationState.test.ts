// conversationState.test.ts
// 🧪 간단 테스트 케이스 (Jest/Vitest 스케치)

import {
  initialSession,
  onUserMessage,
  enforceTwoTurnRule,
  nextState,
  applySafetyCheck,
  sanitizeAssistantText,
  dampenRepetition,
  enforceLength
} from './conversationState';

// 1) 상태 전이 & 2턴 규칙
describe('상태 전이 & 2턴 규칙', () => {
  it('S1 -> S2 자동전환 & 2턴 규칙', () => {
    const s = initialSession();
    expect(s.state).toBe('S1');

    onUserMessage(s, '요즘 잠이 안 와요');
    expect(s.state).toBe('S2');
    expect(s.lastUserCoreNoun).toBe('잠');

    s.state = 'S3';
    s.turn = 1; // 아직 2턴 미만
    enforceTwoTurnRule(s);
    expect(s.state).toBe('S2'); // 강제 복귀
  });
});

// 2) S3→S4→S2
describe('S3→S4→S2 전이', () => {
  it('S3에서 개입 후 피드백 -> S4, 그리고 S2 회귀', () => {
    const s = initialSession();
    s.state = 'S3';

    nextState(s, '조금 가벼워졌어요');
    expect(s.state).toBe('S4');

    nextState(s, '다음에 이렇게 해볼게요');
    expect(s.state).toBe('S2');
  });
});

// 3) 안전 스크리닝 & 중복 방지
describe('안전 스크리닝', () => {
  it('self-harm 감지 시 안내 1회, 중복 부착 방지', () => {
    const s = initialSession();

    const out1 = applySafetyCheck(s, '그냥 없어지고 싶...', '본문1');
    expect(out1).toMatch(/자살예방상담전화/);
    expect(s.safety.escalated).toBe(true);

    const out2 = applySafetyCheck(s, '또 없어지고 싶어...', '본문2');
    // escalated=true + ban 1회 → 더 이상 붙지 않음
    expect(out2).toBe('본문2');
  });
});

// 4) 잘림 복원
describe('문맥 복원', () => {
  it('로 시작하는 문장 복원', () => {
    const s = initialSession();
    onUserMessage(s, '수면 문제가 있어요'); // lastUserCoreNoun = '수면'

    const fixed = sanitizeAssistantText(s, '로 힘드시겠어요. 오늘은...');
    expect(fixed.startsWith('수면로 ')).toBe(true);
  });
});

// 5) 반복 감쇠 & 길이 제한
describe('텍스트 후처리', () => {
  it('반복 문구 감쇠 & 길이 제한 보정', () => {
    const s = initialSession();

    let text = '힘드시겠어요. 함께 이야기해봐요. 어떤 기분인가요?';
    text = dampenRepetition(s, text);
    // 반복 카운트 상태에 따라 일부 제거되어도 문장 성립
    expect(text.length).toBeGreaterThan(10);

    const shortText = enforceLength('짧아요');
    expect(shortText).toMatch(/오늘 하루 중 가장 어려웠던 순간/);

    const longText = enforceLength('가'.repeat(1200));
    expect(longText.length).toBeLessThanOrEqual(820);
  });
});