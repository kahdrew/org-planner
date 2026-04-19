import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { streamAiQuery } from '@/api/ai';

/**
 * Unit tests for the streaming parser in `api/ai.ts`. We stub `fetch`
 * with a ReadableStream built in-memory and assert the callback
 * sequence.
 */

const originalFetch = globalThis.fetch;

function streamFromStrings(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= frames.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(frames[i++]));
    },
  });
}

function mockOkStream(frames: string[]) {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(streamFromStrings(frames), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }),
  ) as unknown as typeof fetch;
}

function mockErrorJson(status: number, body: unknown) {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  ) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('streamAiQuery — SSE parsing', () => {
  it('calls onChunk in order and ends with onDone', async () => {
    mockOkStream([
      'event: chunk\ndata: {"type":"chunk","text":"Hello "}\n\n',
      'event: chunk\ndata: {"type":"chunk","text":"world"}\n\n',
      'event: done\ndata: {"type":"done"}\n\n',
    ]);
    const chunks: string[] = [];
    const onDone = vi.fn();
    const onError = vi.fn();
    await streamAiQuery('scen1', 'hi', [], {
      onChunk: (t) => chunks.push(t),
      onDone,
      onError,
    });
    expect(chunks).toEqual(['Hello ', 'world']);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('handles frames split across chunks', async () => {
    mockOkStream([
      'event: chunk\n',
      'data: {"type":"chunk","text":"A"}\n\n',
      'event: chunk\ndata: {"type":"chunk","',
      'text":"B"}\n\nevent: done\ndata: {"type":"done"}\n\n',
    ]);
    const chunks: string[] = [];
    const onDone = vi.fn();
    const onError = vi.fn();
    await streamAiQuery('scen1', 'hi', [], {
      onChunk: (t) => chunks.push(t),
      onDone,
      onError,
    });
    expect(chunks).toEqual(['A', 'B']);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('surfaces error frames via onError (rate_limited)', async () => {
    mockOkStream([
      'event: error\ndata: {"type":"error","code":"rate_limited","message":"slow down"}\n\n',
    ]);
    const onChunk = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();
    await streamAiQuery('scen1', 'hi', [], { onChunk, onDone, onError });
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'rate_limited', message: 'slow down' }),
    );
    expect(onDone).not.toHaveBeenCalled();
  });

  it('returns structured missing_api_key error on 503 JSON body', async () => {
    mockErrorJson(503, {
      error: 'AI is not configured.',
      code: 'missing_api_key',
      setupInstructions: 'Set ANTHROPIC_API_KEY in packages/server/.env',
    });
    const onError = vi.fn();
    await streamAiQuery('scen1', 'hi', [], {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError,
    });
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'missing_api_key',
        setupInstructions: expect.stringContaining('ANTHROPIC_API_KEY'),
      }),
    );
  });

  it('returns forbidden on HTTP 403', async () => {
    mockErrorJson(403, { error: 'Forbidden' });
    const onError = vi.fn();
    await streamAiQuery('scen1', 'hi', [], {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError,
    });
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'forbidden', status: 403 }),
    );
  });

  it('returns auth_failed on HTTP 401', async () => {
    mockErrorJson(401, { error: 'No token' });
    const onError = vi.fn();
    await streamAiQuery('scen1', 'hi', [], {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError,
    });
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'auth_failed', status: 401 }),
    );
  });

  it('sends credentials: include and JSON body with query+history', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        streamFromStrings(['event: done\ndata: {"type":"done"}\n\n']),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await streamAiQuery(
      'scen1',
      'hello',
      [{ role: 'user', content: 'prev' }],
      {
        onChunk: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/scenarios/scen1/ai/query');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    const headers = init.headers as Record<string, string>;
    // No Authorization header — auth is carried by the session cookie.
    expect(headers.Authorization).toBeUndefined();
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body as string) as {
      query: string;
      history: unknown[];
    };
    expect(body.query).toBe('hello');
    expect(body.history).toEqual([{ role: 'user', content: 'prev' }]);
  });
});
