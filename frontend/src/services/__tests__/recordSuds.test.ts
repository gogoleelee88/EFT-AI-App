import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordSuds } from '../serverAI';

describe('recordSuds', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends POST payload and returns normalized start_eftar action', async () => {
    const responseBody = {
      ok: true,
      actions: [
        {
          type: 'start_eftar',
          payload: { route: '/eftar', script: 'standard_relief', suds: 7 },
        },
      ],
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(responseBody),
    } as Response);

    vi.stubGlobal('fetch', fetchMock);
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const result = await recordSuds({ score: 7, contextId: 'ctx-123', source: 'compare' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [RequestInfo, RequestInit];
    expect(url).toBe('/api/suds/record');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('include');
    expect(init?.cache).toBe('no-store');
    expect(init?.redirect).toBe('follow');
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
    expect(typeof init?.body).toBe('string');
    expect(init?.body).toBe(JSON.stringify({ score: 7, source: 'compare', context_id: 'ctx-123' }));

    expect(result.ok).toBe(true);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.type).toBe('start_eftar');

    debugSpy.mockRestore();
  });

  it('returns ok false when backend replies with an error status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 405,
      statusText: 'Method Not Allowed',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify({ error: 'Method Not Allowed' }),
    } as Response);

    vi.stubGlobal('fetch', fetchMock);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await recordSuds({ score: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.actions).toHaveLength(0);
    expect(result.error).toContain('HTTP 405');

    errorSpy.mockRestore();
  });
});
