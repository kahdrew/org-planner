import { create } from 'zustand';
import type { Employee } from '@/types';
import { useOrgStore } from './orgStore';

/**
 * Connection state machine for the SSE subscription.
 *
 *   idle ──connect()──▶ connecting ──open──▶ connected
 *          ▲                                  │
 *          │                                  error
 *          └── disconnect() ────┐             │
 *                                ▼            ▼
 *                          disconnected ◀─ reconnecting
 */
export type SseConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

/** Messages the server may emit. Mirrors `SseEventType` in the server. */
export type SseServerEventType =
  | 'connected'
  | 'ping'
  | 'employee.created'
  | 'employee.updated'
  | 'employee.deleted'
  | 'employee.moved'
  | 'employee.bulk_created'
  | 'scenario.created'
  | 'scenario.updated'
  | 'scenario.deleted';

export interface SseServerEvent {
  type: SseServerEventType;
  scenarioId?: string;
  payload?: unknown;
  seq?: number;
  ts?: number;
}

interface SseState {
  status: SseConnectionStatus;
  /** orgId the current connection is scoped to, or null. */
  orgId: string | null;
  /** Last server event timestamp received (ms since epoch). */
  lastEventTs: number | null;
  /** How many unrecoverable errors we've seen for the current connection. */
  retryCount: number;
  /** Sequence of the last event we successfully processed. */
  lastSeq: number | null;

  /** Connect to SSE for the given org. No-ops if already connected to it. */
  connect: (orgId: string) => void;
  /** Close the connection and reset state to `idle`. */
  disconnect: () => void;
  /**
   * Test-only hook used by the test suite to inject a synthetic server
   * event without a live network connection.
   */
  _handleEvent: (event: SseServerEvent) => void;
  /** Test-only hook to set status manually. */
  _setStatus: (status: SseConnectionStatus) => void;
}

/**
 * Internal module-level handles. Kept outside the Zustand state so they
 * don't trigger React re-renders on each assignment.
 */
let eventSource: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let currentOrgId: string | null = null;

/** Maximum reconnect delay (ms). */
const MAX_RECONNECT_MS = 30_000;
/** Initial reconnect delay (ms). */
const BASE_RECONNECT_MS = 500;

function computeBackoff(retryCount: number): number {
  return Math.min(MAX_RECONNECT_MS, BASE_RECONNECT_MS * 2 ** retryCount);
}

function resolveAccessToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem('token');
}

function parseEventData(raw: string): SseServerEvent | null {
  try {
    const parsed = JSON.parse(raw) as SseServerEvent;
    if (typeof parsed === 'object' && parsed && typeof parsed.type === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Apply an org-scoped SSE event to the orgStore so UI subscribed to it
 * re-renders automatically.
 *
 * The server always emits full serialized Employee documents (via
 * `serializeEmployee`), so we can drop them directly into the store.
 */
function applyServerEvent(event: SseServerEvent): void {
  const org = useOrgStore.getState();
  const currentScenarioId = org.currentScenario?._id ?? null;

  switch (event.type) {
    case 'employee.created': {
      const payload = event.payload as { employee?: Employee } | undefined;
      const emp = payload?.employee;
      if (!emp || !emp._id) return;
      // Only apply if this event is for the scenario the user is viewing
      if (currentScenarioId && emp.scenarioId !== currentScenarioId) return;
      useOrgStore.setState((state) => {
        if (state.employees.some((e) => e._id === emp._id)) return state;
        return { employees: [...state.employees, emp] };
      });
      break;
    }
    case 'employee.updated': {
      const payload = event.payload as { employee?: Employee } | undefined;
      const emp = payload?.employee;
      if (!emp || !emp._id) return;
      if (currentScenarioId && emp.scenarioId !== currentScenarioId) return;
      useOrgStore.setState((state) => ({
        employees: state.employees.map((e) => (e._id === emp._id ? emp : e)),
        selectedEmployee:
          state.selectedEmployee?._id === emp._id ? emp : state.selectedEmployee,
      }));
      break;
    }
    case 'employee.moved': {
      const payload = event.payload as { employee?: Employee } | undefined;
      const emp = payload?.employee;
      if (!emp || !emp._id) return;
      if (currentScenarioId && emp.scenarioId !== currentScenarioId) return;
      useOrgStore.setState((state) => ({
        employees: state.employees.map((e) => (e._id === emp._id ? emp : e)),
      }));
      break;
    }
    case 'employee.deleted': {
      const payload = event.payload as
        | { employeeId?: string; affectedReportIds?: string[] }
        | undefined;
      const employeeId = payload?.employeeId;
      if (!employeeId) return;
      const affected = new Set(payload?.affectedReportIds ?? []);
      useOrgStore.setState((state) => ({
        employees: state.employees
          .filter((e) => e._id !== employeeId)
          .map((e) =>
            affected.has(e._id) || e.managerId === employeeId
              ? { ...e, managerId: null }
              : e,
          ),
        selectedEmployee:
          state.selectedEmployee?._id === employeeId
            ? null
            : state.selectedEmployee,
      }));
      break;
    }
    case 'employee.bulk_created': {
      const payload = event.payload as { employees?: Employee[] } | undefined;
      const emps = payload?.employees ?? [];
      if (emps.length === 0) return;
      const firstScenario = emps[0]?.scenarioId;
      if (currentScenarioId && firstScenario !== currentScenarioId) return;
      useOrgStore.setState((state) => {
        const known = new Set(state.employees.map((e) => e._id));
        const additions = emps.filter((e) => !known.has(e._id));
        return additions.length > 0
          ? { employees: [...state.employees, ...additions] }
          : state;
      });
      break;
    }
    case 'scenario.created':
    case 'scenario.deleted':
    case 'scenario.updated': {
      // The user's org changed scenarios — refresh the scenario list so
      // the sidebar dropdown stays consistent. Fire-and-forget.
      const current = useOrgStore.getState().currentOrg;
      if (current) {
        useOrgStore.getState().fetchScenarios(current._id).catch(() => {
          /* ignore */
        });
      }
      break;
    }
    case 'connected':
    case 'ping':
    default:
      break;
  }
}

/**
 * Fetch the latest full employee list for the active scenario. Used
 * after a reconnect so we never miss events that fired while we were
 * disconnected.
 */
async function syncMissedChanges(): Promise<void> {
  const org = useOrgStore.getState();
  if (!org.currentScenario) return;
  try {
    await org.fetchEmployees(org.currentScenario._id);
  } catch {
    /* swallow — UI will still work with stale data */
  }
}

function openConnection(orgId: string): void {
  if (typeof window === 'undefined') return;
  const token = resolveAccessToken();
  if (!token) {
    useSseStore.setState({ status: 'disconnected', orgId });
    return;
  }

  // Browser EventSource cannot send Authorization headers, so we pass the
  // JWT as a query-string parameter. The server accepts either form.
  const url = `/api/orgs/${encodeURIComponent(orgId)}/events?access_token=${encodeURIComponent(token)}`;

  const prior = useSseStore.getState();
  useSseStore.setState({
    status: prior.status === 'connected' ? 'reconnecting' : 'connecting',
    orgId,
  });

  let es: EventSource;
  try {
    es = new EventSource(url);
  } catch {
    useSseStore.setState({ status: 'disconnected', orgId });
    scheduleReconnect(orgId);
    return;
  }
  eventSource = es;

  es.onopen = () => {
    const wasReconnecting = useSseStore.getState().status === 'reconnecting';
    useSseStore.setState({ status: 'connected', retryCount: 0 });
    if (wasReconnecting) {
      // We may have missed events while the connection was down —
      // re-fetch the authoritative state.
      void syncMissedChanges();
    }
  };

  const handler = (msg: MessageEvent) => {
    const parsed = parseEventData(msg.data);
    if (!parsed) return;
    const state = useSseStore.getState();
    useSseStore.setState({
      lastEventTs: parsed.ts ?? Date.now(),
      lastSeq: parsed.seq ?? state.lastSeq,
    });
    applyServerEvent(parsed);
  };

  // Listen to all named events. EventSource routes events by `event:` line.
  const namedEvents: SseServerEventType[] = [
    'connected',
    'ping',
    'employee.created',
    'employee.updated',
    'employee.deleted',
    'employee.moved',
    'employee.bulk_created',
    'scenario.created',
    'scenario.updated',
    'scenario.deleted',
  ];
  for (const name of namedEvents) {
    es.addEventListener(name, handler);
  }
  // Also catch the default `message` type as a fallback.
  es.onmessage = handler;

  es.onerror = () => {
    // readyState === CLOSED (2) means the browser gave up or auth failed;
    // CONNECTING (0) means it will auto-retry on its own. We close and
    // schedule our own reconnect for deterministic backoff.
    const stillCurrent = currentOrgId === orgId;
    try {
      es.close();
    } catch {
      /* ignore */
    }
    if (eventSource === es) eventSource = null;
    if (!stillCurrent) return;
    useSseStore.setState((s) => ({
      status: 'reconnecting',
      retryCount: s.retryCount + 1,
    }));
    scheduleReconnect(orgId);
  };
}

function scheduleReconnect(orgId: string): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  const retryCount = useSseStore.getState().retryCount;
  const delay = computeBackoff(retryCount);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (currentOrgId === orgId) {
      openConnection(orgId);
    }
  }, delay);
}

export const useSseStore = create<SseState>((set) => ({
  status: 'idle',
  orgId: null,
  lastEventTs: null,
  retryCount: 0,
  lastSeq: null,

  connect: (orgId: string) => {
    if (!orgId) return;
    // If we're already connected to the same org, do nothing.
    if (currentOrgId === orgId && eventSource) return;
    // Tear down any existing connection before opening a new one.
    if (eventSource) {
      try {
        eventSource.close();
      } catch {
        /* ignore */
      }
      eventSource = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    currentOrgId = orgId;
    set({ orgId, retryCount: 0, lastSeq: null });
    openConnection(orgId);
  },

  disconnect: () => {
    currentOrgId = null;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (eventSource) {
      try {
        eventSource.close();
      } catch {
        /* ignore */
      }
      eventSource = null;
    }
    set({
      status: 'idle',
      orgId: null,
      retryCount: 0,
      lastEventTs: null,
      lastSeq: null,
    });
  },

  _handleEvent: (event: SseServerEvent) => {
    applyServerEvent(event);
    set((s) => ({
      lastEventTs: event.ts ?? Date.now(),
      lastSeq: event.seq ?? s.lastSeq,
    }));
  },

  _setStatus: (status: SseConnectionStatus) => set({ status }),
}));
