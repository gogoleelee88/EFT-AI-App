import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordSuds } from '../serverAI';

describe('recordSuds', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends POST payload to /suds and returns normalized start_eftar action', async () => {
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
    expect(url).toBe('/suds');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('include');
    expect(init?.cache).toBe('no-store');
    expect(init?.redirect).toBe('follow');
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
    expect(typeof init?.body).toBe('string');
    expect(init?.body).toBe(JSON.stringify({ type: 'manual', score: 7 }));

    expect(result.ok).toBe(true);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.type).toBe('start_eftar');

    debugSpy.mockRestore();
  });

  it('falls back to legacy endpoint once when /suds returns 404', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => JSON.stringify({ error: 'Not Found' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({ ok: true, actions: [{ type: 'start_eftar', payload: {} }] }),
      } as Response);

    vi.stubGlobal('fetch', fetchMock);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const result = await recordSuds({ score: 5, source: 'compare' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstCall = fetchMock.mock.calls[0] as [RequestInfo, RequestInit];
    expect(firstCall[0]).toBe('/suds');
    const secondCall = fetchMock.mock.calls[1] as [RequestInfo, RequestInit];
    expect(secondCall[0]).toBe('/api/suds/record');
    expect(secondCall[1]?.method).toBe('POST');
    expect(secondCall[1]?.body).toBe(JSON.stringify({ value: 5, score: 5, source: 'compare' }));

    expect(result.ok).toBe(true);
    expect(result.actions[0]?.type).toBe('start_eftar');

    warnSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it('falls back to legacy endpoint when /suds returns 308 redirect', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 308,
        statusText: 'Permanent Redirect',
        text: async () => '',
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({ ok: true, actions: [{ type: 'start_eftar', payload: {} }] }),
      } as Response);

    vi.stubGlobal('fetch', fetchMock);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const result = await recordSuds({ score: 6, source: 'compare' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0] as [RequestInfo, RequestInit])[0]).toBe('/suds');
    expect((fetchMock.mock.calls[1] as [RequestInfo, RequestInit])[0]).toBe('/api/suds/record');
    expect(result.ok).toBe(true);

    warnSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it('returns ok false when backend replies with a non-recoverable error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => JSON.stringify({ error: 'Internal Server Error' }),
    } as Response);

    vi.stubGlobal('fetch', fetchMock);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await recordSuds({ score: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.actions).toHaveLength(0);
    expect(result.error).toContain('HTTP 500');
    expect(result.error).toContain('Internal Server Error');

    errorSpy.mockRestore();
  });
});
