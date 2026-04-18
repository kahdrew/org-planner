import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';

const streamAiQueryMock = vi.fn();
vi.mock('@/api/ai', () => ({
  streamAiQuery: (...args: unknown[]) => streamAiQueryMock(...args),
}));

import AiChatPanel from '@/components/panels/AiChatPanel';
import { useAiChatStore } from '@/stores/aiChatStore';
import { useOrgStore } from '@/stores/orgStore';
import type { AiStreamCallbacks } from '@/api/ai';

function resetStores() {
  useAiChatStore.setState({
    isOpen: true,
    messages: [],
    streaming: false,
    error: null,
    _abortController: null,
  });
  useOrgStore.setState({
    currentScenario: {
      _id: 'scen1',
      orgId: 'org1',
      name: 'Main Scenario',
      createdBy: 'u',
      createdAt: '',
      updatedAt: '',
    },
  });
}

beforeEach(() => {
  streamAiQueryMock.mockReset();
  resetStores();
});

afterEach(() => {
  cleanup();
  useAiChatStore.setState({
    isOpen: false,
    messages: [],
    streaming: false,
    error: null,
    _abortController: null,
  });
});

describe('<AiChatPanel />', () => {
  it('renders nothing when closed', () => {
    useAiChatStore.setState({ isOpen: false });
    const { container } = render(<AiChatPanel open={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the panel header, input and example prompts', () => {
    render(<AiChatPanel open={true} onClose={() => {}} />);
    expect(screen.getByTestId('ai-chat-panel')).toBeInTheDocument();
    expect(screen.getByTestId('ai-chat-input')).toBeInTheDocument();
    expect(screen.getByTestId('ai-chat-examples')).toBeInTheDocument();
    expect(screen.getByTestId('ai-chat-send')).toBeInTheDocument();
  });

  it('submitting the form appends user message and streams assistant chunks', async () => {
    streamAiQueryMock.mockImplementation(
      async (_s: string, _q: string, _h: unknown[], cb: AiStreamCallbacks) => {
        cb.onChunk('Hello ');
        cb.onChunk('Ada.');
        cb.onDone();
      },
    );

    render(<AiChatPanel open={true} onClose={() => {}} />);
    const input = screen.getByTestId('ai-chat-input') as HTMLTextAreaElement;

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Who is Ada?' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-chat-send'));
    });

    await waitFor(() => {
      const user = screen.getByTestId('ai-msg-user');
      expect(user.textContent).toContain('Who is Ada?');
    });
    const assistant = screen.getByTestId('ai-msg-assistant');
    expect(assistant.textContent).toContain('Hello Ada.');
    // Streaming flag toggled off after done.
    expect(assistant.getAttribute('data-streaming')).toBe('false');
    expect(streamAiQueryMock).toHaveBeenCalledWith(
      'scen1',
      'Who is Ada?',
      [],
      expect.any(Object),
    );
  });

  it('renders a missing-api-key error with setup instructions', async () => {
    streamAiQueryMock.mockImplementation(
      async (_s: string, _q: string, _h: unknown[], cb: AiStreamCallbacks) => {
        cb.onError({
          code: 'missing_api_key',
          message: 'AI is not configured.',
          setupInstructions: 'Set ANTHROPIC_API_KEY in packages/server/.env.',
        });
      },
    );

    render(<AiChatPanel open={true} onClose={() => {}} />);
    const input = screen.getByTestId('ai-chat-input') as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'anything' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-chat-send'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('ai-msg-error')).toBeInTheDocument();
    });
    const err = screen.getByTestId('ai-msg-error');
    expect(err.textContent).toContain('AI is not configured');
    expect(err.textContent).toContain('ANTHROPIC_API_KEY');
  });

  it('disables the send button when the input is empty', () => {
    render(<AiChatPanel open={true} onClose={() => {}} />);
    const btn = screen.getByTestId('ai-chat-send') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('disables the input when no scenario is selected', () => {
    useOrgStore.setState({ currentScenario: null });
    render(<AiChatPanel open={true} onClose={() => {}} />);
    const input = screen.getByTestId('ai-chat-input') as HTMLTextAreaElement;
    expect(input.disabled).toBe(true);
  });

  it('clicking close invokes onClose', () => {
    const onClose = vi.fn();
    render(<AiChatPanel open={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('ai-chat-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking clear empties the conversation', async () => {
    useAiChatStore.setState({
      messages: [
        { id: 'u1', role: 'user', content: 'q' },
        { id: 'a1', role: 'assistant', content: 'a' },
      ],
    });
    render(<AiChatPanel open={true} onClose={() => {}} />);
    expect(screen.getByTestId('ai-msg-user')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('ai-chat-clear'));
    await waitFor(() => {
      expect(screen.queryByTestId('ai-msg-user')).not.toBeInTheDocument();
    });
  });

  it('while streaming, a Stop button is visible', async () => {
    // Simulate a stream that never completes to observe streaming state.
    streamAiQueryMock.mockImplementation(
      (_s: string, _q: string, _h: unknown[], _cb: AiStreamCallbacks) => {
        return new Promise<void>(() => {
          /* never resolves */
        });
      },
    );
    render(<AiChatPanel open={true} onClose={() => {}} />);
    const input = screen.getByTestId('ai-chat-input') as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'wait' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-chat-send'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('ai-chat-stop')).toBeInTheDocument();
    });
  });
});
