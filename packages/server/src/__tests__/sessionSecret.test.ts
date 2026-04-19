/**
 * Unit tests for buildSessionMiddleware() fail-fast secret handling.
 *
 * Verifies:
 *   1. If neither SESSION_SECRET nor JWT_SECRET is set, buildSessionMiddleware
 *      throws (no hardcoded/default secret is silently used).
 *   2. Setting SESSION_SECRET allows construction.
 *   3. Setting only JWT_SECRET (legacy fallback) also allows construction.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildSessionMiddleware } from "../middleware/session";

describe("buildSessionMiddleware — secret handling", () => {
  const originalSession = process.env.SESSION_SECRET;
  const originalJwt = process.env.JWT_SECRET;

  beforeEach(() => {
    delete process.env.SESSION_SECRET;
    delete process.env.JWT_SECRET;
  });

  afterEach(() => {
    if (originalSession === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSession;
    }
    if (originalJwt === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwt;
    }
  });

  it("throws when neither SESSION_SECRET nor JWT_SECRET is set", () => {
    expect(() => buildSessionMiddleware()).toThrow(/SESSION_SECRET/);
  });

  it("constructs successfully when SESSION_SECRET is set", () => {
    process.env.SESSION_SECRET = "test-secret";
    expect(() => buildSessionMiddleware()).not.toThrow();
  });

  it("constructs successfully when only JWT_SECRET is set (legacy fallback)", () => {
    process.env.JWT_SECRET = "legacy-secret";
    expect(() => buildSessionMiddleware()).not.toThrow();
  });
});
