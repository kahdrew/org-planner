import type { Request, Response } from "express";
import mongoose from "mongoose";
import { eventBus } from "../sse/eventBus";
import { checkOrgMembership } from "../middleware/authorization";

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
 * Auth: session cookie. Browser EventSource sends cookies automatically on
 * same-origin requests (and, when opened with `withCredentials: true`, on
 * cross-origin requests as well).
 * Authz: user must be a member or owner of `orgId`.
 */
export async function streamOrgEvents(req: Request, res: Response): Promise<void> {
  const orgId = req.params.orgId;

  // 1. Authenticate via session cookie.
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
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

/**
 * GET /api/orgs/:orgId/events/poll?since_seq=N
 *
 * Polling fallback for environments (e.g., Vercel serverless) that cannot
 * hold a long-lived SSE connection. Returns a JSON array of buffered
 * events with `seq > since_seq` from the in-memory ring buffer.
 *
 * Auth: session cookie (same as SSE endpoint).
 * Authz: user must be a member or owner of `orgId`.
 */
export async function pollOrgEvents(req: Request, res: Response): Promise<void> {
  const orgId = req.params.orgId;

  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  if (!mongoose.Types.ObjectId.isValid(orgId)) {
    res.status(400).json({ error: "Invalid organization ID" });
    return;
  }

  const isMember = await checkOrgMembership(orgId, userId);
  if (!isMember) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const rawSince = req.query.since_seq;
  const parsedSince =
    typeof rawSince === "string" && rawSince.length > 0
      ? Number(rawSince)
      : 0;
  const sinceSeq = Number.isFinite(parsedSince) ? parsedSince : 0;

  const events = eventBus.getEventsSince(orgId, sinceSeq);
  res.status(200).json(events);
}
