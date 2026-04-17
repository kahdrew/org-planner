import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { eventBus } from "../sse/eventBus";
import { checkOrgMembership } from "../middleware/authorization";

/**
 * Extract a JWT from either the Authorization header (Bearer <token>) or
 * an `?access_token=` query param. Browser EventSource cannot set custom
 * headers, so we support the query-param form specifically for SSE.
 */
function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length);
  }
  const raw = req.query.access_token;
  if (typeof raw === "string" && raw.length > 0) return raw;
  return null;
}

/**
 * Keepalive interval (ms). Some proxies drop idle HTTP connections at
 * ~30s, so we send a heartbeat comment a little more often than that.
 */
const KEEPALIVE_MS = 25_000;

/**
 * GET /api/orgs/:orgId/events
 *
 * Opens a long-lived text/event-stream response for the authenticated user.
 * The client will receive org-scoped events (employee CRUD/move, scenario
 * changes) for the lifetime of the connection.
 *
 * Auth: accepts JWT via `Authorization: Bearer ...` or `?access_token=...`.
 * Authz: user must be a member or owner of `orgId`.
 */
export async function streamOrgEvents(req: Request, res: Response): Promise<void> {
  const orgId = req.params.orgId;

  // 1. Authenticate: token must be present and valid.
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  let userId: string;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    userId = decoded.userId;
  } catch {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  // 2. Validate orgId shape early so malformed IDs don't leak existence info.
  if (!mongoose.Types.ObjectId.isValid(orgId)) {
    res.status(400).json({ error: "Invalid organization ID" });
    return;
  }

  // 3. Authorize: require org membership (owner or member).
  const isMember = await checkOrgMembership(orgId, userId);
  if (!isMember) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // 4. Write SSE headers. The `X-Accel-Buffering: no` hint asks reverse
  //    proxies not to buffer the stream, which would otherwise batch events
  //    and defeat realtime delivery.
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  // Flush headers so the client sees an open stream immediately.
  if (typeof (res as Response & { flushHeaders?: () => void }).flushHeaders === "function") {
    (res as Response & { flushHeaders?: () => void }).flushHeaders!();
  }

  // 5. Register the client with the event bus so subsequent `emit(orgId, ...)`
  //    writes its payload into this response.
  const client = eventBus.addClient(orgId, res);

  // 6. Send an initial hello event so clients can detect "connected" state
  //    without waiting for the first mutation.
  const hello = `event: connected\ndata: ${JSON.stringify({
    type: "connected",
    orgId,
    ts: Date.now(),
  })}\n\n`;
  res.write(hello);

  // 7. Keepalive: periodically write a comment line to keep the connection
  //    alive through proxies and load balancers.
  const keepalive = setInterval(() => {
    try {
      res.write(`: keepalive ${Date.now()}\n\n`);
    } catch {
      /* connection is likely dead; cleanup handled below */
    }
  }, KEEPALIVE_MS);

  // 8. Clean up on disconnect. This is the primary way clients leave —
  //    Express fires `close` when the socket is terminated.
  const cleanup = () => {
    clearInterval(keepalive);
    eventBus.removeClient(client);
    try {
      res.end();
    } catch {
      /* ignore */
    }
  };
  req.on("close", cleanup);
  req.on("aborted", cleanup);
  res.on("close", cleanup);
}
