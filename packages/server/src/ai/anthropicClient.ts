/**
 * Thin factory around the Anthropic SDK client.
 *
 * Centralized so tests can mock it with `vi.mock("../ai/anthropicClient")`
 * and production code keeps a single place that understands how to read
 * the API key and construct the client.
 */

import Anthropic from "@anthropic-ai/sdk";

/**
 * Well-known placeholder value that ships in `.env.example` and development
 * defaults. Treat it as "no key configured" so we can show setup
 * instructions instead of leaking a 401 from the upstream API.
 */
const PLACEHOLDER_KEYS = new Set(["", "placeholder-key-for-development"]);

export interface AnthropicKeyStatus {
  configured: boolean;
  reason?: "missing" | "placeholder";
}

/**
 * Report whether a usable Anthropic API key is configured.
 */
export function getAnthropicKeyStatus(): AnthropicKeyStatus {
  const raw = process.env.ANTHROPIC_API_KEY;
  if (!raw || raw.trim().length === 0) {
    return { configured: false, reason: "missing" };
  }
  if (PLACEHOLDER_KEYS.has(raw.trim())) {
    return { configured: false, reason: "placeholder" };
  }
  return { configured: true };
}

/**
 * Construct an Anthropic SDK client. Callers should verify
 * `getAnthropicKeyStatus().configured` first; this function assumes the
 * caller has already gated on a valid key.
 */
export function createAnthropicClient(): Anthropic {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  });
}

/**
 * Default model. Kept as a constant so tests and config can override it
 * without reaching into the controller.
 */
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest";

export default createAnthropicClient;
