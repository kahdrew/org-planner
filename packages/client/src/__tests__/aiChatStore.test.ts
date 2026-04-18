import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Mock the api/ai module so we never touch the network. Each test can
 * configure the mock implementation to emit chunks / done / error in a
 * deterministic order.
 */
const streamAiQueryMock = vi.fn();

vi.mock('@/api/ai', () => ({
  streamAiQuery: (...args: unknown[]) => streamAiQueryMock(...args),
}));

import { useAiChatStore } from '@/stores/aiChatStore';
import type { AiStreamCallbacks } from '@/api/ai';

function resetStore() {
  useAiChatStore.setState({
    isOpen: false,
    messages: [],
    streaming: false,
    error: null,
    _abortController: null,
  });
}

beforeEach(() => {
  streamAiQueryMock.mockReset();
  resetStore();
});

afterEach(() => {
  resetStore();
});

describe('aiChatStore — panel open/close', () => {
  it('togglePanel flips isOpen', () => {
    expect(useAiChatStore.getState().isOpen).toBe(false);
    useAiChatStore.getState().togglePanel();
    expect(useAiChatStore.getState().isOpen).toBe(true);
    useAiChatStore.getState().togglePanel();
    expect(useAiChatStore.getState().isOpen).toBe(false);
  });

  it('openPanel and closePanel set explicit state', () => {
    useAiChatStore.getState().openPanel();
    expect(useAiChatStore.getState().isOpen).toBe(true);
    useAiChatStore.getState().closePanel();
    expect(useAiChatStore.getState().isOpen).toBe(false);
  });
});

describe('aiChatStore — sendQuery streaming', () => {
  it('appends user + assistant messages and streams chunks', async () => {
    streamAiQueryMock.mockImplementation(
      async (_scenarioId: string, _query: string, _history: unknown[], cb: AiStreamCallbacks) => {
        cb.onChunk('Hello ');
        cb.onChunk('world');
        cb.onDone();
      },
    );

    await useAiChatStore.getState().sendQuery('scen1', 'Hi there');
    const { messages, streaming, error } = useAiChatStore.getState();
    expect(streaming).toBe(false);
    expect(error).toBeNull();
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'user', content: 'Hi there' });
    expect(messages[1]).toMatchObject({
      role: 'assistant',
      content: 'Hello world',
      streaming: false,
    });
  });

  it('ignores blank queries (no messages appended)', async () => {
    await useAiChatStore.getState().sendQuery('scen1', '   ');
    expect(useAiChatStore.getState().messages).toHaveLength(0);
    expect(streamAiQueryMock).not.toHaveBeenCalled();
  });

  it('records missing-api-key error on the assistant message', async () => {
    streamAiQueryMock.mockImplementation(
      async (_s: string, _q: string, _h: unknown[], cb: AiStreamCallbacks) => {
        cb.onError({
          code: 'missing_api_key',
          message: 'AI is not configured.',
          setupInstructions: 'Set ANTHROPIC_API_KEY.',
        });
      },
    );

    await useAiChatStore.getState().sendQuery('scen1', 'test');
    const { messages, error, streaming } = useAiChatStore.getState();
    expect(streaming).toBe(false);
    expect(error).toMatchObject({ code: 'missing_api_key' });
    expect(messages).toHaveLength(2);
    expect(messages[1].error).toMatchObject({ code: 'missing_api_key' });
    expect(messages[1].streaming).toBe(false);
  });

  it('forwards prior conversation as history', async () => {
    let capturedHistory: unknown[] | null = null;
    streamAiQueryMock.mockImplementation(
      async (
        _s: string,
        _q: string,
        history: unknown[],
        cb: AiStreamCallbacks,
      ) => {
        capturedHistory = history;
        cb.onDone();
      },
    );

    // Pre-populate conversation: a user + assistant pair.
    useAiChatStore.setState({
      messages: [
        { id: 'a', role: 'user', content: 'Prior Q' },
        { id: 'b', role: 'assistant', content: 'Prior A' },
      ],
    });

    await useAiChatStore.getState().sendQuery('scen1', 'follow up');
    expect(capturedHistory).toEqual([
      { role: 'user', content: 'Prior Q' },
      { role: 'assistant', content: 'Prior A' },
    ]);
  });

  it('filters empty assistant messages out of forwarded history', async () => {
    // Simulate the aftermath of a failed assistant turn: an empty assistant
    // message with an error attached. Anthropic's API rejects requests that
    // include empty assistant content blocks, so the store should drop
    // these from the history it forwards on the next query.
    let capturedHistory: unknown[] | null = null;
    streamAiQueryMock.mockImplementation(
      async (
        _s: string,
        _q: string,
        history: unknown[],
        cb: AiStreamCallbacks,
      ) => {
        capturedHistory = history;
        cb.onDone();
      },
    );

    useAiChatStore.setState({
      messages: [
        { id: 'u1', role: 'user', content: 'Broken question' },
        {
          id: 'a1',
          role: 'assistant',
          content: '',
          error: {
            code: 'network',
            message: 'stream failed',
          },
        },
        { id: 'u2', role: 'user', content: 'Good follow up' },
        { id: 'a2', role: 'assistant', content: 'Good answer' },
      ],
    });

    await useAiChatStore.getState().sendQuery('scen1', 'retry');
    // The empty assistant message must NOT appear in the forwarded
    // history, while preceding/following messages are preserved.
    expect(capturedHistory).toEqual([
      { role: 'user', content: 'Broken question' },
      { role: 'user', content: 'Good follow up' },
      { role: 'assistant', content: 'Good answer' },
    ]);
  });

  it('filters whitespace-only assistant messages out of forwarded history', async () => {
    let capturedHistory: unknown[] | null = null;
    streamAiQueryMock.mockImplementation(
      async (
        _s: string,
        _q: string,
        history: unknown[],
        cb: AiStreamCallbacks,
      ) => {
        capturedHistory = history;
        cb.onDone();
      },
    );

    useAiChatStore.setState({
      messages: [
        { id: 'u1', role: 'user', content: 'Hi' },
        { id: 'a1', role: 'assistant', content: '   \n   \t  ' },
      ],
    });

    await useAiChatStore.getState().sendQuery('scen1', 'next');
    expect(capturedHistory).toEqual([{ role: 'user', content: 'Hi' }]);
  });

  it('clearConversation drops all messages', async () => {
    streamAiQueryMock.mockImplementation(
      async (_s: string, _q: string, _h: unknown[], cb: AiStreamCallbacks) => {
        cb.onChunk('hi');
        cb.onDone();
      },
    );
    await useAiChatStore.getState().sendQuery('s', 'x');
    expect(useAiChatStore.getState().messages).toHaveLength(2);
    useAiChatStore.getState().clearConversation();
    expect(useAiChatStore.getState().messages).toHaveLength(0);
    expect(useAiChatStore.getState().error).toBeNull();
  });
});
