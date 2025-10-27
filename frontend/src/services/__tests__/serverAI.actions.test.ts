import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import ServerAI from '../serverAI';

const createMockResponse = (body: any) => {
  return {
    ok: true,
    headers: new Headers({
      'Content-Type': 'application/json',
      'X-Debug-Actions': 'suggest_eft,ask_suds',
      'X-Actions-Hash': 'abc123',
    }),
    json: async () => body,
  } as Response;
};

describe('ServerAI.chatCompare actions handling', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns normalized actions array from backend response', async () => {
    const actions = [
      { type: 'suggest_eft', payload: { reason: 'negative_emotion_detected' } },
      { type: 'ask_suds', payload: { ui: 'banner' } },
    ];

    const payload = {
      llama3_response: {
        model: 'engine-a',
        response: '긴장을 완화할 수 있는 방법을 안내드릴게요.',
        processing_time: 0.42,
        success: true,
      },
      qwen25_response: {
        model: 'engine-b',
        response: '마음이 많이 무거우시군요.',
        processing_time: 0.55,
        success: true,
      },
      comparison_time: 0.99,
      faster_model: 'llama3',
      timestamp: '2024-01-01T00:00:00.000Z',
      actions,
    };

    const fetchMock = vi.fn().mockResolvedValue(createMockResponse(payload));
    vi.stubGlobal('fetch', fetchMock);

    const server = new ServerAI();
    const result = await server.chatCompare('불안하고 스트레스받아요', {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.actions).toHaveLength(2);
    expect(result.actions?.[0]?.type).toBe('suggest_eft');
    expect(result.actions?.[1]?.type).toBe('ask_suds');
  });
});
