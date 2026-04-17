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

class EventBus {
  /** Map from orgId → Set of active clients. */
  private clients = new Map<string, Set<SseClient>>();

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
   * Emit an event to every client connected to the specified org.
   * Clients on other orgs are unaffected.
   */
  emit(orgId: string, event: SseEvent): void {
    const set = this.clients.get(orgId);
    if (!set || set.size === 0) return;

    const enriched: SseEvent = {
      ...event,
      seq: ++this.seq,
      ts: event.ts ?? Date.now(),
    };
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
    this.seq = 0;
  }
}

export const eventBus = new EventBus();
