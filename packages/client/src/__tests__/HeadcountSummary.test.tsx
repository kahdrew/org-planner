import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import HeadcountSummary from '@/components/panels/HeadcountSummary';
import { useOrgStore } from '@/stores/orgStore';
import { useTimelineStore } from '@/stores/timelineStore';
import type { Employee } from '@/types';

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    _id: 'emp-' + Math.random().toString(36).slice(2, 9),
    scenarioId: 'scen-1',
    name: 'Alice',
    title: 'Engineer',
    department: 'Engineering',
    level: 'IC3',
    location: 'NYC',
    employmentType: 'FTE',
    status: 'Active',
    order: 0,
    managerId: null,
    salary: 100_000,
    equity: 20_000,
    ...overrides,
  };
}

function resetStores() {
  useOrgStore.setState({ employees: [] });
  useTimelineStore.setState({
    events: [],
    futureMarkers: [],
    granularity: 'day',
    scrubDate: null,
    historicalEmployees: null,
    loadingTimeline: false,
    loadingHistory: false,
    loadedScenarioId: null,
  });
}

describe('HeadcountSummary', () => {
  beforeEach(() => {
    resetStores();
  });

  it('reflects the live org store employees when no timeline scrub is active', () => {
    useOrgStore.setState({
      employees: [
        makeEmployee({ _id: 'e1', employmentType: 'FTE', status: 'Active', salary: 100_000 }),
        makeEmployee({ _id: 'e2', employmentType: 'Contractor', status: 'Active', salary: 80_000 }),
        makeEmployee({ _id: 'e3', employmentType: 'FTE', status: 'Open Req', salary: 0 }),
      ],
    });

    render(<HeadcountSummary />);

    // Total pill shows 3
    expect(screen.getByText('Total').parentElement).toHaveTextContent('3');
    // FTE pill shows 2
    expect(screen.getByText('FTE').parentElement).toHaveTextContent('2');
    // Contractor pill shows 1
    expect(screen.getByText('Contractors').parentElement).toHaveTextContent('1');
    // Open reqs pill shows 1
    expect(screen.getByText('Open Reqs').parentElement).toHaveTextContent('1');
  });

  it('reflects the historical snapshot while timeline scrub is active (VAL-AV-003)', () => {
    // Live roster has 5 employees — this should NOT be reflected while
    // the user is scrubbing the timeline.
    useOrgStore.setState({
      employees: [
        makeEmployee({ _id: 'live-1' }),
        makeEmployee({ _id: 'live-2' }),
        makeEmployee({ _id: 'live-3' }),
        makeEmployee({ _id: 'live-4' }),
        makeEmployee({ _id: 'live-5' }),
      ],
    });

    // Historical snapshot (e.g. before later hires) has 2 employees —
    // that's what the pills must display.
    useTimelineStore.setState({
      scrubDate: '2026-02-01T00:00:00Z',
      historicalEmployees: [
        makeEmployee({
          _id: 'hist-1',
          employmentType: 'FTE',
          status: 'Active',
          salary: 120_000,
        }),
        makeEmployee({
          _id: 'hist-2',
          employmentType: 'Contractor',
          status: 'Active',
          salary: 60_000,
        }),
      ],
    });

    render(<HeadcountSummary />);

    expect(screen.getByText('Total').parentElement).toHaveTextContent('2');
    expect(screen.getByText('FTE').parentElement).toHaveTextContent('1');
    expect(screen.getByText('Contractors').parentElement).toHaveTextContent('1');
  });

  it('returns to live counts when the timeline scrub is cleared', () => {
    useOrgStore.setState({
      employees: [
        makeEmployee({ _id: 'e1' }),
        makeEmployee({ _id: 'e2' }),
        makeEmployee({ _id: 'e3' }),
      ],
    });

    // Start with a scrub active showing 1 historical employee.
    useTimelineStore.setState({
      scrubDate: '2026-02-01T00:00:00Z',
      historicalEmployees: [makeEmployee({ _id: 'hist-only' })],
    });

    const { rerender } = render(<HeadcountSummary />);
    expect(screen.getByText('Total').parentElement).toHaveTextContent('1');

    // User jumps back to current — store clears scrub state.
    act(() => {
      useTimelineStore.setState({ scrubDate: null, historicalEmployees: null });
    });
    rerender(<HeadcountSummary />);
    expect(screen.getByText('Total').parentElement).toHaveTextContent('3');
  });

  it('shows an empty historical set as zero headcount (VAL-AV-003 edge)', () => {
    // Live employees exist but the user scrubs to a date before any were hired.
    useOrgStore.setState({
      employees: [makeEmployee({ _id: 'live-1' }), makeEmployee({ _id: 'live-2' })],
    });
    useTimelineStore.setState({
      scrubDate: '2020-01-01T00:00:00Z',
      historicalEmployees: [],
    });

    render(<HeadcountSummary />);
    expect(screen.getByText('Total').parentElement).toHaveTextContent('0');
    expect(screen.getByText('FTE').parentElement).toHaveTextContent('0');
  });
});
