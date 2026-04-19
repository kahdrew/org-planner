/**
 * In-memory event bus for Server-Sent Events (SSE).
 *
 * Connections are grouped by organization. Any mutation scoped to an org
 * (employee CRUD/move, scenario changes) calls `eventBus.emit(orgId, event)`
 * and every connected client for that org receives a message over their
 * open text/event-stream response.
 *
 * Events are strictly scoped to `orgId` — a client listening on Org A will
 * never receive events emitted for Org B.
 */

import type { Response } from "express";

export type SseEventType =
  | "connected"
  | "ping"
  | "employee.created"
  | "employee.updated"
  | "employee.deleted"
  | "employee.moved"
  | "employee.bulk_created"
  | "scenario.created"
  | "scenario.updated"
  | "scenario.deleted";

export interface SseEvent {
  type: SseEventType;
  /** Optional originating scenario for employee-level events. */
  scenarioId?: string;
  /** Payload body — shape depends on `type`. */
  payload?: unknown;
  /** Monotonically increasing event sequence for debugging/ordering. */
  seq?: number;
  /** Server-side timestamp (ms since epoch). */
  ts?: number;
}

export interface SseClient {
  id: string;
  res: Response;
  orgId: string;
}

/** Maximum number of events retained in the ring buffer per org. */
const RING_BUFFER_SIZE = 100;

class EventBus {
  /** Map from orgId → Set of active clients. */
  private clients = new Map<string, Set<SseClient>>();

  /**
   * Ring buffer of the last `RING_BUFFER_SIZE` events emitted per org.
   * Backs the polling fallback endpoint so clients that cannot hold a
   * long-lived SSE connection (e.g., Vercel serverless) can still catch
   * up on recent mutations.
   */
  private buffer = new Map<string, SseEvent[]>();

  /** Monotonic event counter to aid debugging/ordering. */
  private seq = 0;

  /**
   * Register a new client on the given org. Returns the SseClient handle
   * so callers can later call `removeClient(...)`.
   */
  addClient(orgId: string, res: Response): SseClient {
    const client: SseClient = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      res,
      orgId,
    };
    const set = this.clients.get(orgId) ?? new Set<SseClient>();
    set.add(client);
    this.clients.set(orgId, set);
    return client;
  }

  /**
   * Deregister a client. Safe to call multiple times.
   */
  removeClient(client: SseClient): void {
    const set = this.clients.get(client.orgId);
    if (!set) return;
    set.delete(client);
    if (set.size === 0) {
      this.clients.delete(client.orgId);
    }
  }

  /**
   * Emit an event to every client connected to the specified org and
   * retain it in the per-org ring buffer for the polling fallback.
   * Clients on other orgs are unaffected.
   */
  emit(orgId: string, event: SseEvent): void {
    const enriched: SseEvent = {
      ...event,
      seq: ++this.seq,
      ts: event.ts ?? Date.now(),
    };

    // Buffer the event first so pollers can recover it even when no live
    // SSE clients are connected (the common case on Vercel serverless).
    const buf = this.buffer.get(orgId) ?? [];
    buf.push(enriched);
    if (buf.length > RING_BUFFER_SIZE) {
      buf.splice(0, buf.length - RING_BUFFER_SIZE);
    }
    this.buffer.set(orgId, buf);

    const set = this.clients.get(orgId);
    if (!set || set.size === 0) return;

    const payload = `event: ${enriched.type}\ndata: ${JSON.stringify(enriched)}\n\n`;

    for (const client of set) {
      try {
        client.res.write(payload);
      } catch {
        // If writing fails the client is likely dead; drop it so we don't
        // keep trying on a broken pipe.
        this.removeClient(client);
      }
    }
  }

  /**
   * Return buffered events for an org with `seq > sinceSeq`, in
   * chronological order. Used by the polling fallback endpoint.
   */
  getEventsSince(orgId: string, sinceSeq: number): SseEvent[] {
    const buf = this.buffer.get(orgId);
    if (!buf || buf.length === 0) return [];
    const threshold = Number.isFinite(sinceSeq) ? sinceSeq : 0;
    return buf.filter((e) => (e.seq ?? 0) > threshold);
  }

  /**
   * Test/diagnostic helper — current size of the org's ring buffer.
   */
  bufferSize(orgId: string): number {
    return this.buffer.get(orgId)?.length ?? 0;
  }

  /**
   * Return the current number of connected clients for an org. Intended
   * for tests and diagnostics.
   */
  clientCount(orgId: string): number {
    return this.clients.get(orgId)?.size ?? 0;
  }

  /**
   * Close and remove every active client. Useful for tests that want a
   * clean slate between runs.
   */
  reset(): void {
    for (const set of this.clients.values()) {
      for (const client of set) {
        try {
          client.res.end();
        } catch {
          /* ignore */
        }
      }
    }
    this.clients.clear();
    this.buffer.clear();
    this.seq = 0;
  }
}

export const eventBus = new EventBus();
