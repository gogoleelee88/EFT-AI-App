// Firestore 헬퍼 - MVP 안전판
// --------------------------------------------------
// 요구사항:
//  - firebase 초기화 파일에서 `db`, `auth` export (아래 주석 참고)
//  - 타입: src/types/firestore.ts 에 정의한 것 사용
// --------------------------------------------------

import {
  addDoc, updateDoc, setDoc, doc, collection, serverTimestamp,
  onSnapshot, getDoc, type Unsubscribe, Timestamp
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from './firebase'; // ✅ 같은 services 폴더 내
import type {
  EFTSession, ConversationTurn, InsightUnlock, InsightAggregation, FSDate
} from '../types/firestore'; // ✅ 상대경로 유지

// 유틸
function assertUID(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('로그인이 필요합니다 (auth.currentUser.uid 없음)');
  return uid;
}
function nowFS(): FSDate { return serverTimestamp() as unknown as Timestamp; }

// 세션 생성/보장 --------------------------------------------------

/** 새 세션을 만든다. (필요시 direct 호출) */
export async function fsCreateSession(
  seed?: Partial<Omit<EFTSession,'id'|'uid'|'startedAt'|'turnCount'|'status'>>
): Promise<string> {
  const uid = assertUID();
  const ref = await addDoc(collection(db, 'sessions'), {
    uid,
    startedAt: nowFS(),
    status: 'active',
    conversationState: seed?.conversationState ?? 'S1',
    turnCount: 0,
    metadata: seed?.metadata ?? {},
    suds: seed?.suds ?? {},
  });
  console.log('🔥 Firestore 세션 생성:', ref.id);
  return ref.id;
}

/** 세션이 없으면 만들고 있으면 그대로 반환 */
export async function fsEnsureSession(sessionId?: string): Promise<string> {
  if (sessionId) return sessionId;
  return fsCreateSession();
}

/** 세션 필드 부분 업데이트 */
export async function fsUpdateSession(sessionId: string, patch: Partial<EFTSession>) {
  await updateDoc(doc(db, 'sessions', sessionId), patch as any);
}

/** 세션 종료 마킹 */
export async function fsCompleteSession(sessionId: string, status: 'completed'|'abandoned'='completed') {
  await updateDoc(doc(db, 'sessions', sessionId), {
    status, endedAt: nowFS(),
  });
}

// 턴 생성/업데이트 --------------------------------------------------

/** 턴 생성: 세션 보장 + 기본 userMessage 기록 */
export async function fsCreateTurn(params: {
  sessionId?: string;
  turnIndex?: number;               // 없으면 세션 turnCount+1 로 UI에서 정해도 됨
  userText: string;
  conversationState: EFTSession['conversationState'];
  userMeta?: ConversationTurn['userMessage']['metadata'];
}): Promise<{ sessionId: string; turnId: string; turnIndex: number; }> {
  const uid = assertUID();
  const sessionId = await fsEnsureSession(params.sessionId);

  // 세션의 turnCount 를 신뢰하지 않는 MVP: 화면단에서 turnIndex 전달 권장
  const turnIndex = params.turnIndex ?? Date.now(); // 임시(충돌 적음). 운영은 Tx나 CF로 보정 추천.

  const ref = await addDoc(collection(db, `sessions/${sessionId}/turns`), {
    id: '',                // 채우기용(읽기편의), 생성 후 setDoc로 덮어씀
    sessionId,
    uid,
    turnIndex,
    ts: nowFS(),
    userMessage: {
      content: params.userText,
      timestamp: nowFS(),
      metadata: params.userMeta ?? { inputMethod: 'text' },
    },
    conversationState: params.conversationState,
  } as Partial<ConversationTurn>);

  // 문서 id를 필드에도 적재(쿼리 편의)
  await updateDoc(ref, { id: ref.id });

  // 세션 메타 갱신(마지막 상태/턴수) - ⚠️ MVP용 임시 구현
  await updateDoc(doc(db, 'sessions', sessionId), {
    lastTurnId: ref.id,
    lastPhase: params.conversationState,
    turnCount: Date.now(), // ⚠️ 임시: 실제 카운터가 아닌 타임스탬프 (지표용)
  } as any);

  console.log('🔥 Firestore 턴 생성:', ref.id, 'turnIndex:', turnIndex);
  return { sessionId, turnId: ref.id, turnIndex };
}

/** 턴 일부 업데이트(일반 패치) */
export async function fsUpdateTurn(sessionId: string, turnId: string, patch: Partial<ConversationTurn>) {
  await updateDoc(doc(db, `sessions/${sessionId}/turns/${turnId}`), patch as any);
}

/** AI A/B 응답 텔레메트리 기록(요약) */
export async function fsAppendABTelemetry(sessionId: string, turnId: string, data: {
  textAI_A?: string;
  textAI_B?: string;
  ab?: {
    totalLatencyMs?: number;
    fasterModel?: string;
    a?: { ok?: boolean; tokens?: { prompt?: number|null; completion?: number|null; total?: number|null }; preview?: string|null; };
    b?: { ok?: boolean; tokens?: { prompt?: number|null; completion?: number|null; total?: number|null }; preview?: string|null; };
  };
}) {
  await updateDoc(doc(db, `sessions/${sessionId}/turns/${turnId}`), {
    aiResponse: {
      timestamp: nowFS(),
      metadata: {}, // 세부 모델은 개별 필드에 저장했으니 생략 가능
    },
    textAI_A: data.textAI_A ?? null,
    textAI_B: data.textAI_B ?? null,
    ab: data.ab ?? null,
  } as any);
  console.log('🤖 A/B 텔레메트리 저장:', turnId, 'faster:', data.ab?.fasterModel);
}

/** 턴 단위 SUDS 기록 (pre/post 중 필요한 쪽만) */
export async function fsSetTurnSUDS(sessionId: string, turnId: string, patch: {
  sudsPre?: number; sudsPost?: number; topEmotion?: string;
}) {
  if (!auth.currentUser?.uid) {
    console.warn('⚠️ Firestore SUDS 저장 건너뜀: 인증된 사용자가 없습니다.');
    return;
  }

  await updateDoc(doc(db, `sessions/${sessionId}/turns/${turnId}`), patch as any);
  console.log('📊 턴 SUDS 저장:', turnId, patch);
}

/** 세션 단위 SUDS 요약 기록 (delta 자동 계산해서 넣기 권장) */
export async function fsSetSessionSUDS(sessionId: string, args: {
  pre?: number; post?: number; preNotes?: string; postNotes?: string;
}) {
  if (!auth.currentUser?.uid) {
    console.warn('⚠️ Firestore 세션 SUDS 저장 건너뜀: 인증된 사용자가 없습니다.');
    return;
  }

  const sRef = doc(db, 'sessions', sessionId);
  const snap = await getDoc(sRef);
  const cur = (snap.data()?.suds ?? {}) as EFTSession['suds'];

  const pre = args.pre ?? cur?.pre;
  const post = args.post ?? cur?.post;
  const delta = (typeof pre === 'number' && typeof post === 'number') ? (pre - post) : cur?.delta;

  await updateDoc(sRef, {
    suds: {
      pre: pre ?? null,
      post: post ?? null,
      preNotes: args.preNotes ?? cur?.preNotes ?? null,
      postNotes: args.postNotes ?? cur?.postNotes ?? null,
      delta: typeof delta === 'number' ? delta : null,
    }
  } as any);
  console.log('📊 세션 SUDS 저장:', sessionId, { pre, post, delta });
}

// 설문/통찰 --------------------------------------------------

/** 200문항 완료 저장 */
export async function fsSaveQuestionnaire200(result: {
  responses: Record<string,string>;
  analysis: { scores: Record<string, number>; summary: string; deltaMean?: number; };
}) {
  const uid = assertUID();
  await setDoc(doc(db, 'questionnaire_200', uid), {
    uid,
    completedAt: nowFS(),
    responses: result.responses,
    analysis: result.analysis,
  }, { merge: true });
  console.log('📝 200문항 결과 저장:', uid);
}

/** 통찰 언락 기록: insights_unlock/{uid}/{unlockId} */
export async function fsUnlockInsight(unlockId: string, payload: Omit<InsightUnlock, 'unlockedAt'|'uid'>) {
  const uid = assertUID();
  await setDoc(doc(db, `insights_unlock/${uid}/${unlockId}`), {
    ...payload,
    uid,
    unlockedAt: nowFS(),
  }, { merge: true });
  console.log('🔮 통찰 언락:', unlockId, 'level:', payload.level);
}

// 조회/구독 --------------------------------------------------

/** 집계 문서 단건 조회 (insight_agg/{uid}) */
export async function fsGetInsightAgg(): Promise<InsightAggregation | null> {
  const uid = assertUID();
  const snap = await getDoc(doc(db, 'insight_agg', uid));
  return (snap.exists() ? (snap.data() as InsightAggregation) : null);
}

/** 언락 목록 구독 (리스트 변경 실시간 반영) */
export function observeInsightUnlocks(
  onChange: (docs: Array<{ id: string; data: InsightUnlock }>) => void
): Unsubscribe {
  const uid = assertUID();
  const col = collection(db, `insights_unlock/${uid}`);
  return onSnapshot(col, (qs) => {
    const arr = qs.docs.map(d => ({ id: d.id, data: d.data() as InsightUnlock }));
    onChange(arr);
  });
}