/**
 * 로컬 테스트용 시나리오 토글 유틸리티
 *
 * 사용법 (브라우저 콘솔):
 * - window.setScenario('eft')  → EFT 분기 테스트
 * - window.setScenario('breath') → 호흡 분기 테스트
 * - window.getScenario() → 현재 시나리오 확인
 */

export type TestScenario = 'eft' | 'breath';

export function setScenario(scenario: TestScenario): void {
  localStorage.setItem('mt_scenario', scenario);
  console.log(`🧪 Test scenario set to: ${scenario}`);
  console.log('🔄 Reload page to apply changes');
}

export function getScenario(): TestScenario {
  const scenario = localStorage.getItem('mt_scenario');
  return (scenario === 'breath' ? 'breath' : 'eft') as TestScenario;
}

export function clearScenario(): void {
  localStorage.removeItem('mt_scenario');
  console.log('🧹 Test scenario cleared (default: EFT)');
}

// 브라우저 콘솔에서 사용할 수 있도록 전역 노출 (개발 모드만)
if (import.meta.env.DEV) {
  (window as any).setScenario = setScenario;
  (window as any).getScenario = getScenario;
  (window as any).clearScenario = clearScenario;

  console.log('🧪 Test scenario utils loaded:');
  console.log('  - setScenario("eft"|"breath")');
  console.log('  - getScenario()');
  console.log('  - clearScenario()');
}
