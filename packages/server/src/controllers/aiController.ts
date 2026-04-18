import type { Response } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import type Anthropic from "@anthropic-ai/sdk";
import { AuthRequest } from "../middleware/auth";
import Scenario from "../models/Scenario";
import Organization from "../models/Organization";
import Employee from "../models/Employee";
import {
  buildEmployeeContext,
  buildSystemPrompt,
} from "../ai/orgContext";
import {
  ANTHROPIC_MODEL,
  createAnthropicClient,
  getAnthropicKeyStatus,
} from "../ai/anthropicClient";

/**
 * Reasonable ceiling on history to keep prompt size bounded. The UI can
 * send the full conversation but we only forward the most recent N turns.
 */
const MAX_HISTORY_TURNS = 20;

/**
 * Output token cap for the streamed response. Long enough for a detailed
 * what-if analysis, short enough to avoid runaway costs on a hostile query.
 */
const MAX_OUTPUT_TOKENS = 1024;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(16_000),
});

const querySchema = z.object({
  query: z.string().min(1).max(4_000),
  history: z.array(messageSchema).max(200).optional(),
});

/**
 * Event types emitted on the SSE stream consumed by the client.
 *
 * - `chunk` — partial text to append to the in-progress assistant message.
 * - `done`  — stream finished successfully. No more frames will arrive.
 * - `error` — terminal error. Stream ends immediately after.
 */
type AiEventType = "chunk" | "done" | "error";

interface AiErrorDetails {
  code:
    | "missing_api_key"
    | "placeholder_api_key"
    | "rate_limited"
    | "auth_failed"
    | "model_error"
    | "unknown";
  message: string;
}

function writeSse(
  res: Response,
  event: AiEventType,
  data: Record<string, unknown>,
): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`);
}

/**
 * Map an Anthropic SDK error to a user-friendly code/message pair. Unknown
 * errors fall through to a generic "model_error" so the UI never sees a
 * raw stack trace.
 */
function classifyAnthropicError(err: unknown): AiErrorDetails {
  const anyErr = err as { status?: number; message?: string };
  if (anyErr && typeof anyErr === "object") {
    const status = anyErr.status;
    if (status === 429) {
      return {
        code: "rate_limited",
        message:
          "The AI service is rate-limited right now. Please try again in a few moments.",
      };
    }
    if (status === 401 || status === 403) {
      return {
        code: "auth_failed",
        message:
          "The configured ANTHROPIC_API_KEY was rejected. Please verify the key in packages/server/.env.",
      };
    }
  }
  return {
    code: "model_error",
    message: "The AI service returned an unexpected error. Please try again.",
  };
}

/**
 * POST /api/scenarios/:id/ai/query
 *
 * Streams an SSE response containing the model's answer. The controller:
 *  1. Authorizes access via scenario→org membership (handled upstream by
 *     `requireScenarioAccess`).
 *  2. Builds a system prompt from the scenario's employees.
 *  3. Calls Anthropic's streaming messages API.
 *  4. Forwards content-delta chunks to the client as `chunk` frames, then
 *     a terminal `done` (or `error`) frame.
 *
 * The stream is read-only: this controller never mutates org data.
 */
export async function queryAi(req: AuthRequest, res: Response): Promise<void> {
  const scenarioId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(scenarioId)) {
    res.status(400).json({ error: "Invalid scenario ID" });
    return;
  }

  // Parse & validate body before we commit to an SSE response so we can
  // return a plain JSON 400 when the body is malformed.
  let parsed: z.infer<typeof querySchema>;
  try {
    parsed = querySchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  // Gate on API key configuration up-front. Return a structured JSON 503
  // so the UI can show setup instructions instead of a generic failure.
  const keyStatus = getAnthropicKeyStatus();
  if (!keyStatus.configured) {
    res.status(503).json({
      error: "AI is not configured.",
      code: "missing_api_key",
      setupInstructions:
        "Set ANTHROPIC_API_KEY in packages/server/.env to a valid Anthropic API key and restart the server.",
    });
    return;
  }

  // Load scenario + org for the prompt meta block.
  const scenario = await Scenario.findById(scenarioId);
  if (!scenario) {
    res.status(404).json({ error: "Scenario not found" });
    return;
  }
  const org = await Organization.findById(scenario.orgId);
  const employees = await Employee.find({ scenarioId }).lean();

  const employeeContext = buildEmployeeContext(employees as never);
  const systemPrompt = buildSystemPrompt(employeeContext, {
    scenarioName: scenario.name,
    orgName: org?.name,
  });

  // Build the chat history (trimmed to the most recent N turns).
  const history = (parsed.history ?? []).slice(-MAX_HISTORY_TURNS);
  const userMessages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...history,
    { role: "user", content: parsed.query },
  ];

  // Commit to SSE headers. Any error after this point must be delivered
  // as an `error` event frame, not a non-2xx status.
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof (res as Response & { flushHeaders?: () => void }).flushHeaders === "function") {
    (res as Response & { flushHeaders?: () => void }).flushHeaders!();
  }

  let client: Anthropic;
  try {
    client = createAnthropicClient();
  } catch {
    writeSse(res, "error", {
      code: "unknown",
      message: "Failed to initialize the AI client.",
    });
    res.end();
    return;
  }

  // Abort the upstream stream if the browser closes the connection so we
  // don't keep paying for tokens no one will see.
  const abortController = new AbortController();
  req.on("close", () => abortController.abort());

  try {
    const stream = await client.messages.stream(
      {
        model: ANTHROPIC_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: systemPrompt,
        messages: userMessages,
      },
      { signal: abortController.signal },
    );

    for await (const event of stream) {
      // Anthropic emits structured events; we only care about text deltas.
      if (
        event.type === "content_block_delta" &&
        event.delta &&
        (event.delta as { type?: string }).type === "text_delta"
      ) {
        const text = (event.delta as { text?: string }).text ?? "";
        if (text) {
          writeSse(res, "chunk", { text });
        }
      }
    }

    writeSse(res, "done", {});
    res.end();
  } catch (err) {
    if (abortController.signal.aborted) {
      // Client already left — don't try to write. `res.end()` may also
      // fail, so we swallow silently.
      try {
        res.end();
      } catch {
        /* ignore */
      }
      return;
    }
    const classified = classifyAnthropicError(err);
    writeSse(res, "error", { ...classified });
    res.end();
  }
}
