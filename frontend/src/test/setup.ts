import "@testing-library/jest-dom";

// Vitest globals 설정
import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// 각 테스트 후 DOM 정리
afterEach(() => {
  cleanup();
});

// 전역 객체 설정 (필요한 경우)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// MediaPipe 관련 모킹 (AR 테스트 시 필요)
global.HTMLCanvasElement.prototype.getContext = vi.fn();
global.HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined);