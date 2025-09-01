/**
 * 🛠️ 디버깅 유틸리티 시스템
 * React Ref 검증, 로깅, 타입 체크를 위한 공통 유틸리티
 */

import React from 'react';

const DEBUG = process.env.NODE_ENV === 'development';

export type RefEntry = { name: string; ref: React.RefObject<any> };

/**
 * ✅ Ref 유효성 검증
 */
export const validateRefs = (refs: RefEntry[]): boolean => {
  return refs.every(({ ref }) => !!ref.current);
};

/**
 * 📊 Ref 상태 요약 로그
 */
export const logRefsSummary = (refs: RefEntry[]) => {
  if (!DEBUG) return;
  console.table(
    refs.map(({ name, ref }) => ({
      Name: name,
      Status: ref.current ? '✅ Ready' : '❌ Missing',
      Type: ref.current
        ? ref.current.constructor?.name ?? typeof ref.current
        : 'undefined',
    }))
  );
};

/**
 * 🔄 검증 + 요약 출력 한번에 실행
 */
export const checkAndLogRefs = (refs: RefEntry[]): boolean => {
  const valid = validateRefs(refs);
  if (valid) logRefsSummary(refs);
  return valid;
};

/**
 * 🧩 초기화 시퀀스 검증 (사용자 메시지 + 기술 로그 분리)
 */
export const validateInitializationSequence = (
  refs: RefEntry[],
  onError: (userMsg: string, techMsg: string) => void
): boolean => {
  const missing = refs.filter(({ ref }) => !ref.current);
  if (missing.length > 0) {
    const names = missing.map((m) => m.name).join(', ');
    onError(
      `일부 필수 요소(${names})를 불러오지 못했습니다.`,
      `Missing refs: ${names}`
    );
    return false;
  }
  logRefsSummary(refs);
  return true;
};

/**
 * 🔍 Ref 타입 강제 (제네릭)
 */
export function assertRefType<T extends HTMLElement>(
  name: string,
  ref: React.RefObject<any>,
  expectedType: { new (...args: any[]): T }
): ref is React.RefObject<T> {
  if (ref.current instanceof expectedType) {
    return true;
  }
  console.error(
    `❌ [${name}] expected ${expectedType.name}, but got:`,
    ref.current
  );
  return false;
}

/**
 * 🙋 사용자 친화적인 에러 메시지 생성기
 */
export const createUserFriendlyError = (context: string, details: string) =>
  `${context} 중 오류가 발생했습니다. (${details})`;

/**
 * 🚀 통합 Ref 검증 파이프라인
 * - 존재 여부 검증
 * - 타입 체크
 * - 로그 출력
 * - 에러 처리
 */
export function validateAndAssertRefs<T extends HTMLElement>(
  refs: { name: string; ref: React.RefObject<any>; type?: { new (...args: any[]): T } }[],
  onError: (userMsg: string, techMsg: string) => void
): boolean {
  // Step 1: 존재 여부 체크
  const missing = refs.filter(({ ref }) => !ref.current);
  if (missing.length > 0) {
    const names = missing.map((m) => m.name).join(', ');
    onError(
      `필수 요소(${names})가 준비되지 않았습니다.`,
      `Missing refs: ${names}`
    );
    return false;
  }

  // Step 2: 타입 체크
  for (const { name, ref, type } of refs) {
    if (type && !(ref.current instanceof type)) {
      onError(
        `${name} 요소 타입이 올바르지 않습니다.`,
        `❌ [${name}] expected ${type.name}, got: ${ref.current?.constructor?.name}`
      );
      return false;
    }
  }

  // Step 3: 요약 출력
  logRefsSummary(refs);

  return true;
}