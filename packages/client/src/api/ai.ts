/**
 * AI query client.
 *
 * The AI endpoint streams SSE-framed events (`chunk`, `done`, `error`)
 * instead of returning a single JSON body. Axios doesn't play nicely
 * with streaming fetch, so this module uses the raw `fetch` API and
 * parses SSE frames manually.
 */

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiStreamCallbacks {
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (err: AiStreamError) => void;
  /** Optional abort signal for the caller to cancel mid-stream. */
  signal?: AbortSignal;
}

export interface AiStreamError {
  /**
   * Stable error code. `missing_api_key` is returned as a JSON 503 by the
   * server; `rate_limited`, `auth_failed`, and `model_error` arrive as
   * `error` frames on the SSE stream.
   */
  code:
    | 'missing_api_key'
    | 'placeholder_api_key'
    | 'rate_limited'
    | 'auth_failed'
    | 'model_error'
    | 'forbidden'
    | 'network'
    | 'unknown';
  message: string;
  /** Populated when code === 'missing_api_key'. */
  setupInstructions?: string;
  /** Populated for non-OK HTTP responses. */
  status?: number;
}

/**
 * Parse a single SSE frame in the form:
 *
 *   event: chunk
 *   data: {"type":"chunk","text":"Hello"}
 *
 * Returns the event name and the decoded data payload. Comment-only
 * frames (those starting with ':' keepalives) are returned with a null
 * event name so callers can filter them out.
 */
function parseFrame(
  raw: string,
): { event: string | null; data: string | null } {
  let event: string | null = null;
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }
  return {
    event,
    data: dataLines.length ? dataLines.join('\n') : null,
  };
}

/**
 * Stream a natural-language query against the AI endpoint. Emits chunks
 * via `callbacks.onChunk`, then exactly one of `onDone` / `onError`.
 *
 * Returns a Promise that resolves when the stream terminates (either
 * done or error). Callers may pass `signal` to abort mid-stream; aborts
 * are silent and do not call onError.
 */
export async function streamAiQuery(
  scenarioId: string,
  query: string,
  history: AiChatMessage[],
  callbacks: AiStreamCallbacks,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`/api/scenarios/${encodeURIComponent(scenarioId)}/ai/query`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ query, history }),
      signal: callbacks.signal,
    });
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') return;
    callbacks.onError({
      code: 'network',
      message: 'Could not reach the AI service. Check your connection and try again.',
    });
    return;
  }

  // Non-streaming error responses are returned as JSON — most commonly the
  // 503 for an unconfigured API key. Parse and surface via onError.
  if (!response.ok) {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = (await response.json()) as Record<string, unknown>;
    } catch {
      /* ignore */
    }
    if (response.status === 503 && parsed.code === 'missing_api_key') {
      callbacks.onError({
        code: 'missing_api_key',
        message:
          (parsed.error as string | undefined) ??
          'The AI assistant is not configured.',
        setupInstructions: parsed.setupInstructions as string | undefined,
        status: response.status,
      });
      return;
    }
    if (response.status === 401) {
      callbacks.onError({
        code: 'auth_failed',
        message: 'Your session has expired. Please sign in again.',
        status: 401,
      });
      return;
    }
    if (response.status === 403) {
      callbacks.onError({
        code: 'forbidden',
        message: 'You do not have access to this scenario.',
        status: 403,
      });
      return;
    }
    callbacks.onError({
      code: 'unknown',
      message:
        (typeof parsed.error === 'string' && parsed.error) ||
        `AI service returned HTTP ${response.status}.`,
      status: response.status,
    });
    return;
  }

  // 200 OK — consume the SSE stream.
  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onError({
      code: 'network',
      message: 'AI response had no body.',
    });
    return;
  }
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Parse complete frames (separated by blank lines).
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const { event, data } = parseFrame(raw);
        if (!event || !data) continue;

        let parsedData: Record<string, unknown> | null = null;
        try {
          parsedData = JSON.parse(data) as Record<string, unknown>;
        } catch {
          continue;
        }

        if (event === 'chunk' && typeof parsedData.text === 'string') {
          callbacks.onChunk(parsedData.text);
        } else if (event === 'done') {
          callbacks.onDone();
          return;
        } else if (event === 'error') {
          callbacks.onError({
            code: (parsedData.code as AiStreamError['code']) ?? 'unknown',
            message:
              (parsedData.message as string | undefined) ??
              'The AI service failed to produce a response.',
          });
          return;
        }
      }
    }
    // Stream ended without an explicit `done` — treat as done.
    callbacks.onDone();
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') return;
    callbacks.onError({
      code: 'network',
      message: 'The AI stream was interrupted. Please try again.',
    });
  }
}
