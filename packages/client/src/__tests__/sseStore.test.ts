import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useOrgStore } from '@/stores/orgStore';
import { useSseStore } from '@/stores/sseStore';
import type { Employee, Organization, Scenario } from '@/types';

vi.mock('@/api/employees', () => ({
  getEmployees: vi.fn().mockResolvedValue([]),
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
  deleteEmployee: vi.fn(),
  moveEmployee: vi.fn(),
  bulkCreateEmployees: vi.fn(),
}));
vi.mock('@/api/orgs', () => ({
  getOrgs: vi.fn().mockResolvedValue([]),
  createOrg: vi.fn(),
  updateOrg: vi.fn(),
  deleteOrg: vi.fn(),
}));
vi.mock('@/api/scenarios', () => ({
  getScenarios: vi.fn().mockResolvedValue([]),
  createScenario: vi.fn(),
  cloneScenario: vi.fn(),
  deleteScenario: vi.fn(),
  diffScenarios: vi.fn(),
}));

const SCENARIO_ID = 'scenario-1';
const ORG_ID = 'org-1';
const OTHER_SCENARIO_ID = 'scenario-other';

const mockOrg = {
  _id: ORG_ID,
  name: 'Test Org',
  ownerId: 'user-1',
  memberIds: ['user-1'],
} as Organization;

const mockScenario = {
  _id: SCENARIO_ID,
  orgId: ORG_ID,
  name: 'Baseline',
  createdBy: 'user-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as Scenario;

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    _id: 'emp-new',
    scenarioId: SCENARIO_ID,
    name: 'Alice',
    title: 'Engineer',
    department: 'Engineering',
    level: 'IC3',
    location: 'Remote',
    employmentType: 'FTE',
    status: 'Active',
    order: 0,
    managerId: null,
    ...overrides,
  };
}

function resetStores(initialEmployees: Employee[] = []) {
  useOrgStore.setState({
    orgs: [mockOrg],
    currentOrg: mockOrg,
    scenarios: [mockScenario],
    currentScenario: mockScenario,
    employees: initialEmployees,
    selectedEmployee: null,
    loading: false,
  });
  useSseStore.setState({
    status: 'idle',
    orgId: null,
    lastEventTs: null,
    retryCount: 0,
    lastSeq: null,
  });
}

describe('sseStore._handleEvent — applies events to orgStore', () => {
  beforeEach(() => {
    resetStores();
  });

  it('applies employee.created to append the new employee', () => {
    const emp = makeEmployee({ _id: 'created-1', name: 'NewPerson' });
    useSseStore.getState()._handleEvent({
      type: 'employee.created',
      scenarioId: SCENARIO_ID,
      payload: { employee: emp },
      seq: 1,
      ts: Date.now(),
    });
    expect(useOrgStore.getState().employees).toHaveLength(1);
    expect(useOrgStore.getState().employees[0]._id).toBe('created-1');
  });

  it('is idempotent on duplicate employee.created events', () => {
    const emp = makeEmployee({ _id: 'dup-1', name: 'Idempotent' });
    const eventBus = useSseStore.getState();
    eventBus._handleEvent({
      type: 'employee.created',
      scenarioId: SCENARIO_ID,
      payload: { employee: emp },
    });
    eventBus._handleEvent({
      type: 'employee.created',
      scenarioId: SCENARIO_ID,
      payload: { employee: emp },
    });
    expect(useOrgStore.getState().employees).toHaveLength(1);
  });

  it('ignores employee.created for a different scenario', () => {
    const emp = makeEmployee({
      _id: 'cross-scenario',
      scenarioId: OTHER_SCENARIO_ID,
    });
    useSseStore.getState()._handleEvent({
      type: 'employee.created',
      scenarioId: OTHER_SCENARIO_ID,
      payload: { employee: emp },
    });
    expect(useOrgStore.getState().employees).toHaveLength(0);
  });

  it('applies employee.updated to replace the existing employee', () => {
    const existing = makeEmployee({ _id: 'u1', title: 'Engineer' });
    resetStores([existing]);
    const updated = { ...existing, title: 'Staff Engineer' };
    useSseStore.getState()._handleEvent({
      type: 'employee.updated',
      scenarioId: SCENARIO_ID,
      payload: { employee: updated },
    });
    expect(useOrgStore.getState().employees[0].title).toBe('Staff Engineer');
  });

  it('applies employee.updated to selectedEmployee as well', () => {
    const existing = makeEmployee({ _id: 'sel-1', title: 'Engineer' });
    resetStores([existing]);
    useOrgStore.setState({ selectedEmployee: existing });
    const updated = { ...existing, title: 'Principal' };
    useSseStore.getState()._handleEvent({
      type: 'employee.updated',
      scenarioId: SCENARIO_ID,
      payload: { employee: updated },
    });
    expect(useOrgStore.getState().selectedEmployee?.title).toBe('Principal');
  });

  it('applies employee.moved to replace the managerId', () => {
    const existing = makeEmployee({ _id: 'mv-1', managerId: null });
    resetStores([existing]);
    const moved = { ...existing, managerId: 'mgr-xyz' };
    useSseStore.getState()._handleEvent({
      type: 'employee.moved',
      scenarioId: SCENARIO_ID,
      payload: { employee: moved },
    });
    expect(useOrgStore.getState().employees[0].managerId).toBe('mgr-xyz');
  });

  it('applies employee.deleted by filtering and cascading manager refs', () => {
    const manager = makeEmployee({ _id: 'mgr', name: 'Boss' });
    const report = makeEmployee({
      _id: 'report',
      name: 'Report',
      managerId: 'mgr',
    });
    resetStores([manager, report]);
    useSseStore.getState()._handleEvent({
      type: 'employee.deleted',
      scenarioId: SCENARIO_ID,
      payload: { employeeId: 'mgr', affectedReportIds: ['report'] },
    });
    const emps = useOrgStore.getState().employees;
    expect(emps.find((e) => e._id === 'mgr')).toBeUndefined();
    expect(emps.find((e) => e._id === 'report')?.managerId).toBeNull();
  });

  it('clears selectedEmployee if it was the deleted employee', () => {
    const emp = makeEmployee({ _id: 'del-me' });
    resetStores([emp]);
    useOrgStore.setState({ selectedEmployee: emp });
    useSseStore.getState()._handleEvent({
      type: 'employee.deleted',
      scenarioId: SCENARIO_ID,
      payload: { employeeId: 'del-me', affectedReportIds: [] },
    });
    expect(useOrgStore.getState().selectedEmployee).toBeNull();
  });

  it('applies employee.bulk_created for the current scenario', () => {
    const e1 = makeEmployee({ _id: 'b1', name: 'Bulk1' });
    const e2 = makeEmployee({ _id: 'b2', name: 'Bulk2' });
    useSseStore.getState()._handleEvent({
      type: 'employee.bulk_created',
      scenarioId: SCENARIO_ID,
      payload: { employees: [e1, e2] },
    });
    expect(useOrgStore.getState().employees).toHaveLength(2);
  });

  it('ignores employee.bulk_created for a different scenario', () => {
    const e1 = makeEmployee({ _id: 'other-b1', scenarioId: OTHER_SCENARIO_ID });
    useSseStore.getState()._handleEvent({
      type: 'employee.bulk_created',
      scenarioId: OTHER_SCENARIO_ID,
      payload: { employees: [e1] },
    });
    expect(useOrgStore.getState().employees).toHaveLength(0);
  });

  it('updates lastEventTs and lastSeq', () => {
    useSseStore.getState()._handleEvent({
      type: 'ping',
      seq: 42,
      ts: 1234567890,
    });
    expect(useSseStore.getState().lastEventTs).toBe(1234567890);
    expect(useSseStore.getState().lastSeq).toBe(42);
  });
});

describe('sseStore connection status transitions', () => {
  beforeEach(() => {
    resetStores();
  });

  it('starts in idle state and exposes _setStatus for tests', () => {
    expect(useSseStore.getState().status).toBe('idle');
    useSseStore.getState()._setStatus('connected');
    expect(useSseStore.getState().status).toBe('connected');
    useSseStore.getState()._setStatus('reconnecting');
    expect(useSseStore.getState().status).toBe('reconnecting');
  });

  it('supports the polling status value', () => {
    useSseStore.getState()._setStatus('polling');
    expect(useSseStore.getState().status).toBe('polling');
  });

  it('disconnect() resets the full state', () => {
    useSseStore.setState({
      status: 'connected',
      orgId: ORG_ID,
      lastEventTs: 123,
      retryCount: 5,
      lastSeq: 10,
    });
    useSseStore.getState().disconnect();
    const s = useSseStore.getState();
    expect(s.status).toBe('idle');
    expect(s.orgId).toBeNull();
    expect(s.retryCount).toBe(0);
    expect(s.lastEventTs).toBeNull();
    expect(s.lastSeq).toBeNull();
  });
});

/**
 * Polling fallback: after three consecutive failed EventSource
 * connection attempts we stop opening streams and poll /events/poll.
 * These tests inject a fake EventSource that always errors so we can
 * exercise the fallback path deterministically.
 */
describe('sseStore polling fallback', () => {
  const originalEventSource = (globalThis as { EventSource?: unknown })
    .EventSource;
  const originalFetch = (globalThis as { fetch?: unknown }).fetch;
  const instances: FakeEventSource[] = [];

  class FakeEventSource {
    url: string;
    withCredentials: boolean;
    onopen: ((ev: Event) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;
    onmessage: ((ev: MessageEvent) => void) | null = null;
    readyState = 0;
    closed = false;
    constructor(url: string, init?: EventSourceInit) {
      this.url = url;
      this.withCredentials = init?.withCredentials ?? false;
      instances.push(this);
      // Schedule the error synchronously on the next microtask so the
      // test can deterministically drive the store through each retry.
      queueMicrotask(() => {
        if (this.closed) return;
        this.onerror?.(new Event('error'));
      });
    }
    addEventListener(_: string, __: (ev: MessageEvent) => void) {
      /* not invoked in this test */
    }
    close() {
      this.closed = true;
      this.readyState = 2;
    }
  }

  beforeEach(() => {
    resetStores();
    instances.length = 0;
    (globalThis as { EventSource?: unknown }).EventSource =
      FakeEventSource as unknown;
    (globalThis as { fetch?: unknown }).fetch = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => [],
      });
  });

  afterEach(() => {
    useSseStore.getState().disconnect();
    (globalThis as { EventSource?: unknown }).EventSource =
      originalEventSource as unknown;
    (globalThis as { fetch?: unknown }).fetch = originalFetch as unknown;
  });

  it('transitions to polling after 3 consecutive SSE failures and issues a poll request', async () => {
    vi.useFakeTimers();
    try {
      useSseStore.getState().connect(ORG_ID);

      // Drive three consecutive onerror firings. The store schedules a
      // reconnect via setTimeout after each failure.
      for (let i = 0; i < 3; i += 1) {
        // Let the current microtask queue run so onerror fires for the
        // most-recently-opened FakeEventSource.
        await Promise.resolve();
        await Promise.resolve();
        // Advance the reconnect timer so a new EventSource is created.
        vi.advanceTimersByTime(60_000);
      }
      // Allow any trailing microtasks (e.g., the final onerror) to run.
      await Promise.resolve();
      await Promise.resolve();

      expect(useSseStore.getState().status).toBe('polling');
      expect(useSseStore.getState().retryCount).toBeGreaterThanOrEqual(3);

      const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
      // The initial poll is kicked off immediately when startPolling runs.
      // Flush any pending promises before asserting.
      await Promise.resolve();
      expect(fetchMock).toHaveBeenCalled();
      const firstCall = fetchMock.mock.calls[0][0] as string;
      expect(firstCall).toContain('/api/orgs/');
      expect(firstCall).toContain('/events/poll');
      expect(firstCall).toContain('since_seq=');
    } finally {
      vi.useRealTimers();
    }
  });
});
