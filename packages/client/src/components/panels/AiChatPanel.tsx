import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, X, Sparkles, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { useAiChatStore } from '@/stores/aiChatStore';
import { useOrgStore } from '@/stores/orgStore';
import { cn } from '@/utils/cn';

const EXAMPLE_QUERIES = [
  'How many employees are in Engineering?',
  'Who reports to each manager?',
  'What is the cost impact of promoting all Senior Engineers to Staff?',
  'What happens if we merge Platform and Infrastructure teams?',
];

export interface AiChatPanelProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Slide-out AI chat panel. Read-only: it never mutates org data, only
 * renders the streaming conversation.
 */
export default function AiChatPanel({ open, onClose }: AiChatPanelProps) {
  const messages = useAiChatStore((s) => s.messages);
  const streaming = useAiChatStore((s) => s.streaming);
  const error = useAiChatStore((s) => s.error);
  const sendQuery = useAiChatStore((s) => s.sendQuery);
  const clearConversation = useAiChatStore((s) => s.clearConversation);
  const cancel = useAiChatStore((s) => s.cancel);

  const currentScenario = useOrgStore((s) => s.currentScenario);

  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keep the conversation scrolled to the bottom as new chunks arrive.
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  // Autofocus input when the panel opens.
  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 80);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  const canSubmit = Boolean(
    input.trim().length > 0 && currentScenario && !streaming,
  );

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit || !currentScenario) return;
    const text = input.trim();
    setInput('');
    await sendQuery(currentScenario._id, text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const primaryError = useMemo(() => {
    if (!error) return null;
    if (error.code === 'missing_api_key') {
      return {
        title: 'AI is not configured',
        body:
          error.setupInstructions ??
          'Set ANTHROPIC_API_KEY in packages/server/.env to enable the AI assistant.',
      };
    }
    if (error.code === 'rate_limited') {
      return {
        title: 'Rate limited',
        body: error.message,
      };
    }
    if (error.code === 'auth_failed') {
      return {
        title: 'Authentication failed',
        body: error.message,
      };
    }
    return {
      title: 'AI error',
      body: error.message,
    };
  }, [error]);

  if (!open) return null;

  return (
    <div
      data-testid="ai-chat-panel"
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-xl"
      role="dialog"
      aria-label="AI planning assistant"
    >
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-blue-500" />
          <div>
            <h2 className="text-sm font-semibold text-gray-900">AI Planning Assistant</h2>
            <p className="text-xs text-gray-500">
              Read-only insights & what-if analysis
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={clearConversation}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            title="Clear conversation"
            data-testid="ai-chat-clear"
          >
            <Trash2 size={16} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            title="Close"
            data-testid="ai-chat-close"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      <div
        ref={listRef}
        className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
        data-testid="ai-chat-messages"
      >
        {messages.length === 0 && !primaryError && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Ask a natural-language question about the current scenario. The
              assistant can summarize teams, estimate cost impact of changes,
              and answer data queries. It never modifies your org data —
              every recommendation is a suggestion only.
            </p>
            <div
              className="space-y-1"
              data-testid="ai-chat-examples"
            >
              {EXAMPLE_QUERIES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setInput(q)}
                  className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-left text-xs text-gray-700 transition-colors hover:border-blue-300 hover:bg-blue-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            data-testid={m.role === 'user' ? 'ai-msg-user' : 'ai-msg-assistant'}
            data-streaming={m.streaming ? 'true' : 'false'}
            className={cn(
              'rounded-lg px-3 py-2 text-sm leading-relaxed',
              m.role === 'user'
                ? 'ml-6 bg-blue-600 text-white'
                : 'mr-6 border border-gray-200 bg-gray-50 text-gray-800',
            )}
          >
            {m.role === 'assistant' && (
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                <Sparkles size={11} />
                Assistant
                {m.streaming && (
                  <Loader2
                    size={11}
                    className="ml-1 animate-spin text-blue-500"
                    data-testid="ai-msg-spinner"
                  />
                )}
              </div>
            )}
            <div className="whitespace-pre-wrap">
              {m.content}
              {m.role === 'assistant' && m.streaming && m.content.length === 0 && (
                <span className="text-gray-400">Thinking…</span>
              )}
            </div>
            {m.error && (
              <div
                className="mt-2 flex items-start gap-1.5 rounded-md bg-red-50 p-2 text-xs text-red-700"
                data-testid="ai-msg-error"
              >
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">{m.error.message}</div>
                  {m.error.setupInstructions && (
                    <div className="mt-1 text-[11px] text-red-600">
                      {m.error.setupInstructions}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {primaryError && messages.length === 0 && (
          <div
            className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
            data-testid="ai-chat-primary-error"
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">{primaryError.title}</div>
              <div className="mt-1 text-xs">{primaryError.body}</div>
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-gray-200 bg-white px-3 py-3"
      >
        {!currentScenario && (
          <div className="mb-2 text-xs text-gray-500">
            Select a scenario to start chatting.
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder={
              currentScenario
                ? 'Ask about this scenario…'
                : 'Select a scenario to enable chat'
            }
            disabled={!currentScenario}
            className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            data-testid="ai-chat-input"
          />
          {streaming ? (
            <button
              type="button"
              onClick={cancel}
              className="rounded-md bg-gray-800 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
              data-testid="ai-chat-stop"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSubmit}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-white transition-colors',
                canSubmit
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'cursor-not-allowed bg-gray-300',
              )}
              data-testid="ai-chat-send"
            >
              <Send size={14} />
              Ask
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          AI responses may be inaccurate. Suggestions only — no org data is
          modified.
        </p>
      </form>
    </div>
  );
}
