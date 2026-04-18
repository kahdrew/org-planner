import { create } from 'zustand';
import { streamAiQuery, type AiStreamError } from '@/api/ai';

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** True while the assistant message is still streaming. */
  streaming?: boolean;
  /** When the assistant failed mid-stream, the error attached to the message. */
  error?: AiStreamError | null;
}

interface AiChatState {
  /** Whether the chat panel drawer is visible. */
  isOpen: boolean;
  /** Full conversation for the UI. */
  messages: AiChatMessage[];
  /** True while awaiting / receiving a response. */
  streaming: boolean;
  /** Last top-level error (for missing API key etc.). */
  error: AiStreamError | null;
  /** Abort controller for the in-flight request (null when idle). */
  _abortController: AbortController | null;

  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  clearConversation: () => void;
  /**
   * Send a new user query. Streams the assistant reply into the messages
   * list. Safe to call even while a previous query is streaming — the
   * previous one is aborted first.
   */
  sendQuery: (scenarioId: string, query: string) => Promise<void>;
  /** Abort the in-flight stream if any. */
  cancel: () => void;
}

let messageSeq = 0;
function nextId(): string {
  messageSeq += 1;
  return `msg-${Date.now()}-${messageSeq}`;
}

export const useAiChatStore = create<AiChatState>((set, get) => ({
  isOpen: false,
  messages: [],
  streaming: false,
  error: null,
  _abortController: null,

  openPanel: () => set({ isOpen: true }),
  closePanel: () => {
    // Closing while streaming cancels the in-flight request.
    get().cancel();
    set({ isOpen: false });
  },
  togglePanel: () => set((s) => ({ isOpen: !s.isOpen })),

  clearConversation: () => {
    get().cancel();
    set({ messages: [], error: null });
  },

  cancel: () => {
    const ctrl = get()._abortController;
    if (ctrl) {
      try {
        ctrl.abort();
      } catch {
        /* ignore */
      }
    }
    set({ _abortController: null, streaming: false });
  },

  sendQuery: async (scenarioId, query) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    // Abort any in-flight request before starting a new one.
    get().cancel();

    const userMessage: AiChatMessage = {
      id: nextId(),
      role: 'user',
      content: trimmed,
    };
    const assistantMessage: AiChatMessage = {
      id: nextId(),
      role: 'assistant',
      content: '',
      streaming: true,
    };

    set((s) => ({
      messages: [...s.messages, userMessage, assistantMessage],
      error: null,
      streaming: true,
    }));

    const controller = new AbortController();
    set({ _abortController: controller });

    const history = get()
      .messages // historical messages up to (but excluding) the new pair
      .filter((m) => m.id !== assistantMessage.id && m.id !== userMessage.id)
      // Skip failed assistant turns whose content never streamed in — sending
      // empty assistant messages to the API causes Anthropic to reject the
      // whole request ("messages: assistant content blocks must be non-empty").
      .filter((m) => !(m.role === 'assistant' && m.content.trim().length === 0))
      .map((m) => ({ role: m.role, content: m.content }));

    await streamAiQuery(
      scenarioId,
      trimmed,
      history,
      {
        signal: controller.signal,
        onChunk: (text) => {
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === assistantMessage.id
                ? { ...m, content: m.content + text }
                : m,
            ),
          }));
        },
        onDone: () => {
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === assistantMessage.id
                ? { ...m, streaming: false }
                : m,
            ),
            streaming: false,
            _abortController: null,
          }));
        },
        onError: (err) => {
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === assistantMessage.id
                ? { ...m, streaming: false, error: err, content: m.content || '' }
                : m,
            ),
            streaming: false,
            error: err,
            _abortController: null,
          }));
        },
      },
    );
  },
}));
