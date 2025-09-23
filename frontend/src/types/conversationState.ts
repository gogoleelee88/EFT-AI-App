// frontend/src/types/conversationState.ts
// 대화 상태/전이 + 안전검사 + 금지어 감쇠 + 문장 복원 유틸

import { getOrCreateSessionId } from '../lib/session';

export type ConversationState = 'S1' | 'S2' | 'S3' | 'S4';

export interface SafetyFlags {
  selfHarm: boolean;
  otherHarm: boolean;
  escalated: boolean; // 한번 올렸으면 중복 안내 방지
}

export interface ConversationSession {
  sessionId: string;             // ✅ 세션 고유 식별자
  state: ConversationState;
  turn: number;                  // 응답 확정 후 +1 (아래 enforceTwoTurnRule 주석 참고)
  lastUserCoreNoun?: string;     // 잘림 복원용
  safety: SafetyFlags;
}

/** 최초 메모리 상의 기본 세션 값 생성 */
export const initialSession = (): ConversationSession => ({
  sessionId: (globalThis as any)?.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2) + Date.now().toString(36),
  state: 'S1',
  turn: 0,
  safety: { selfHarm: false, otherHarm: false, escalated: false },
});

/**
 * 세션 생성:
 * - 기본 값은 initialSession()을 사용
 * - persist=true면 로컬스토리지의 고정 세션ID를 우선 적용
 *   (재방문/새 탭에서도 동일 ID 유지)
 */
export const createSession = (persist = true): ConversationSession => {
  const base = initialSession();
  if (!persist) return base;

  const stableId = getOrCreateSessionId(base.sessionId);
  return { ...base, sessionId: stableId };
};

/* ---------------------------
 *  핵심 명사 추출 (간단 버전)
 * --------------------------- */
/**
 * 핵심 명사 추출
 * 현재: (잠|일|업무|관계|스트레스|불안|긴장|가슴|수면) 외 실제 유입어 확장 계획
 */
export function extractCoreNoun(userText: string): string {
  const m = /(잠|일|업무|관계|스트레스|불안|긴장|가슴|수면)/.exec(userText);
  return m?.[1] ?? '상황';
}

/* ---------------------------------
 *  상태 전이 (S3→S4, S4→S2 등)
 * --------------------------------- */
export function nextState(session: ConversationSession, userText: string): void {
  const feedback = /(가벼워졌|변화|잘 모르|효과)/.test(userText);

  // S3에서 개입 피드백이 오면 효과 확인 단계 S4로
  if (session.state === 'S3' && feedback) {
    session.state = 'S4';
    return;
  }

  // S4는 보통 "다음 한 걸음 합의" 후 S2로 회귀
  if (session.state === 'S4') {
    session.state = 'S2';
    return;
  }

  // [수정 2] 초기 S1 → 첫 라포/파악 후 S2로 자동 전환
  if (session.state === 'S1') {
    session.state = 'S2';
    return;
  }
}

/* ---------------------------------------------------
 *  2턴 규칙: 응답 생성 "이전"에 호출하여 상태 계산,
 *  turn 은 "응답 확정 후" +1 하는 것이 안전
 * --------------------------------------------------- */
export function enforceTwoTurnRule(session: ConversationSession): void {
  // [수정 3] 2턴 미만에서 S3 진입 시 강제로 S2로 되돌림
  if (session.state === 'S3' && session.turn < 2) {
    session.state = 'S2';
    console.log('⚠️ 2턴 규칙 위반 → S3에서 S2로 강제 전환');
  }
}

/* -------------------------------------------
 *  사용자 문장 기반 슬롯 업데이트 (핵심 명사)
 * ------------------------------------------- */
export function onUserMessage(session: ConversationSession, userText: string): void {
  session.lastUserCoreNoun = extractCoreNoun(userText);
  nextState(session, userText);
}

/* ---------------------------------------
 *  어시스턴트 문장 후처리(잘림 복원 등)
 *  - "로 " 로 시작하면 "<명사>로 "로 복원
 * --------------------------------------- */
export function sanitizeAssistantText(session: ConversationSession, text: string): string {
  let out = text ?? '';
  if (/^로\s/.test(out)) {
    const noun = session.lastUserCoreNoun ?? '상황';
    out = `${noun}로 ` + out.slice(2);
    console.log(`🔧 문맥 복원: "${noun}로" 추가됨`);
  }
  return out.trim();
}

/* --------------------------------------------
 *  금지어/반복 멘트 감쇠 (24시간 캐시 예시)
 *  - 프론트(sessionStorage) + 메모리 맵 병행
 * -------------------------------------------- */
type BanKey = string;
const memoryBan = new Map<BanKey, { count: number; expiresAt: number }>();
const ONE_DAY = 24 * 60 * 60 * 1000;

function now() { return Date.now(); }
// 1) sessionStorage 안전 래퍼
function safeSessionGet(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && 'sessionStorage' in window) {
      return window.sessionStorage.getItem(key);
    }
  } catch {
    return null;
  }
}
function safeSessionSet(key: string, val: string) {
  try {
    if (typeof window !== 'undefined' && 'sessionStorage' in window) {
      window.sessionStorage.setItem(key, val);
    }
  } catch {}
}

function readBanCount(key: BanKey): number {
  const m = memoryBan.get(key);
  const s = safeSessionGet(`ban:${key}`);
  const countMem = m && m.expiresAt > now() ? m.count : 0;
  const countSess = s ? Number(s) : 0;
  return Math.max(countMem, countSess);
}
function writeBanCount(key: BanKey, count: number) {
  memoryBan.set(key, { count, expiresAt: now() + ONE_DAY });
  safeSessionSet(`ban:${key}`, String(count));
}

/** 같은 안내를 과도하게 반복하지 않도록 제한 */
export function shouldBanPhrase(key: BanKey, maxPerDay = 2): boolean {
  const c = readBanCount(key);
  if (c >= maxPerDay) return true;
  writeBanCount(key, c + 1);
  return false;
}

/* -----------------------------
 *  안전 스크리닝 & 안내 부착
 * ----------------------------- */
/**
 * 안전 스크리닝 & 안내 부착
 * NOTE: 세션을 변경합니다 (side-effect).
 * - session.safety.{selfHarm, otherHarm, escalated}
 * - ban 카운트로 하루 1회 안내 제한
 */
export function applySafetyCheck(
  session: ConversationSession,
  userText: string,
  assistantText: string
): string {
  // 2) 안전 정규식 강화
  const SELF_HARM_RX = /(죽\s*고|자\s*살|끝내\s*고|없어지(?:고|고\s*싶|고싶)|소용\s*없|의미\s*없)/;
  const OTHER_HARM_RX = /(해치(?:고|겠)|복\s*수|폭\s*력|때려|죽여\s*버리)/;

  const selfHarm = SELF_HARM_RX.test(userText);
  const otherHarm = OTHER_HARM_RX.test(userText);

  let out = assistantText;

  // 중복 안내 방지 (escalated)
  if (selfHarm && !session.safety.escalated) {
    session.safety.selfHarm = true;
    session.safety.escalated = true;

    // 하루 1회 제한 (shouldBanPhrase 내부에서 카운트 증가)
    if (!shouldBanPhrase('safety:selfHarm', 1)) {
      out += `\n\n🆘 **안전이 최우선입니다**\n\n지금 상황이 너무 힘드시군요. 당신은 혼자가 아닙니다:\n\n• 📞 **자살예방상담전화: 1393** (24시간 무료)\n• 🚨 **응급상황: 119**\n• 💬 **카카오톡 상담: '생명의전화'**\n\n이것은 당신 잘못이 아닙니다. 도움을 요청하는 것은 용기입니다.`;
      console.log('🚨 자해 위험 감지 → 안전 안내 제공 (하루 1회)');
    } else {
      console.log('🚨 자해 위험 감지 → 안내 생략 (하루 1회 제한)');
    }
  }

  if (otherHarm && !session.safety.escalated) {
    session.safety.otherHarm = true;
    session.safety.escalated = true;

    // 하루 1회 제한
    if (!shouldBanPhrase('safety:otherHarm', 1)) {
      out += `\n\n⚠️ **안전한 공간 만들기**\n\n지금 느끼시는 분노와 감정을 이해합니다. 하지만 안전이 중요해요:\n\n• 📞 **분노조절 상담: 1393**\n• 🧘 **즉시 분리**: 상황에서 잠시 떨어져 보세요\n• 💨 **깊은 호흡**: 4초 들이쉬고, 6초 내쉬기\n\n감정은 일시적입니다. 함께 안전한 방법을 찾아보아요.`;
      console.log('⚠️ 타해 위험 감지 → 안전 안내 제공 (하루 1회)');
    } else {
      console.log('⚠️ 타해 위험 감지 → 안내 생략 (하루 1회 제한)');
    }
  }

  return out;
}

/* --------------------------------
 *  2단락 보장 유틸리티
 * -------------------------------- */
export function ensureTwoParagraphs(text: string): string[] {
  const parts = text.split(/\n{2,}/);
  if (parts.length >= 2) {
    return parts;
  }

  // 단락이 부족하면 안전 스크리닝 서브텍스트 추가
  return [text, "오늘 하루 중 가장 어려웠던 순간이 있었나요?"];
}

/* --------------------------------
 *  반복 감쇠 실제 구현
 * -------------------------------- */
// 3) 반복 문구 정확 매칭
const BANNED_PHRASES = [
  /\b함께 이야기해봐요\b/g,
  /\b어떤 기분인가요\b/g,
  /\b힘드시겠어요\b/g,
  /\b공감합니다\b/g,
  /\b이해합니다\b/g
];

export function dampenRepetition(session: ConversationSession, text: string): string {
  let result = text;
  let removedPhrases: string[] = [];

  BANNED_PHRASES.forEach(rx => {
    const key = rx.toString();
    if (shouldBanPhrase(`repeat:${key}`, 2) && rx.test(result)) {
      result = result.replace(rx, '');
      removedPhrases.push(key);
    }
  });

  if (removedPhrases.length > 0) {
    console.log(`🚫 반복 금지어 제거: ${removedPhrases.join(', ')}`);

    // 과잉 제거 시 보정 문구 추가
    if (result.trim().length < 30) {
      result = "조금 다른 방식으로 말씀드려볼게요. " + result;
    }
  }

  return result.trim();
}

/* --------------------------------
 *  길이 제한 강제
 * -------------------------------- */
export function enforceLength(text: string): string {
  const chars = [...text]; // 한글 정확 카운트

  if (chars.length < 400) {
    // <400자면 서브텍스트 추가
    return text + '\n\n오늘 하루 중 가장 어려웠던 순간이 있었나요?';
  } else if (chars.length > 800) {
    // >800자면 780자에서 자르고 자연스러운 마무리를 붙인다
    const truncated = chars.slice(0, 780).join('');
    return truncated + '... 이 부분을 좀 더 이야기해 볼까요?';
  }

  return text;
}

/* --------------------------------
 *  슬롯 추출 (기본 구현)
 * -------------------------------- */
/**
 * 슬롯 추출 - 컨텍스트 추출: work/family/relationship 분류가 일상어로도 잘 동작
 */
export function extractSlotsFrom(message: string): Record<string, any> {
  const slots: Record<string, any> = {};

  // 감정 키워드 추출
  const emotionKeywords = {
    '불안': 'anxiety', '우울': 'depression', '스트레스': 'stress',
    '화': 'anger', '분노': 'rage', '슬픔': 'sadness', '외로움': 'loneliness'
  };

  Object.entries(emotionKeywords).forEach(([korean, english]) => {
    if (message.includes(korean)) {
      slots.emotion = english;
    }
  });

  // 상황/맥락 추출 - 일상어("회사", "부모", "애인")로도 잘 동작
  if (message.includes('직장') || message.includes('회사') || message.includes('업무')) {
    slots.context = 'work';
  } else if (message.includes('가족') || message.includes('부모')) {
    slots.context = 'family';
  } else if (message.includes('연인') || message.includes('애인')) {
    slots.context = 'relationship';
  }

  return slots;
}

/* ---------------------------------------------
 *  통합 파이프라인 사용 예 (프론트 쪽 호출 흐름)
 * --------------------------------------------- */
// 1) 사용자 입력 도착
// onUserMessage(session, userText);

// 2) 엔진 응답 생성 후(확정 직전) 상태 정책 적용
// enforceTwoTurnRule(session);

// 3) 응답 텍스트 후처리
// let reply = sanitizeAssistantText(session, rawAssistantText);
// reply = applySafetyCheck(session, userText, reply);
// reply = dampenRepetition(session, reply);
// reply = enforceLength(reply);

// 4) 메시지 렌더링 & turn 카운트 증가
// session.turn += 1;

/* --------------------------------
 *  기존 호환성을 위한 별칭들
 * -------------------------------- */

// 기존 호출 호환용 별칭들만 유지
export { sanitizeAssistantText as restoreContext };