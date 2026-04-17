/**
 * Regression test for the analytics scrutiny finding:
 *   "Span-of-control warning badges on EmployeeCard compute from live
 *    employees instead of the rendered dataset"
 *
 * When the org chart is rendering a historical/filtered snapshot (e.g.
 * the user is scrubbing the timeline), OrgChartView passes that dataset
 * into each node via `data._chartEmployees`. The card should compute
 * span flags from that list so the badges match what the user sees on
 * screen — not the live scenario store.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { Employee } from '@/types';
import EmployeeCard from '@/components/nodes/EmployeeCard';
import { useOverlayStore } from '@/stores/overlayStore';

const makeEmployee = (overrides: Partial<Employee> = {}): Employee => ({
  _id: 'emp-1',
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
  ...overrides,
});

function managerWithReports(
  managerId: string,
  name: string,
  reportCount: number,
): Employee[] {
  const manager = makeEmployee({ _id: managerId, name });
  const reports: Employee[] = [];
  for (let i = 0; i < reportCount; i++) {
    reports.push(
      makeEmployee({
        _id: `${managerId}-r${i}`,
        name: `${name} Report ${i + 1}`,
        managerId,
      }),
    );
  }
  return [manager, ...reports];
}

// Live store values — representative of the scenario's "real" roster.
let storeEmployeesValue: Employee[] = [];

vi.mock('@/stores/orgStore', () => {
  const updateEmployee = vi.fn();
  return {
    useOrgStore: Object.assign(
      (selector?: (s: Record<string, unknown>) => unknown) => {
        const state = {
          employees: storeEmployeesValue,
          updateEmployee,
          selectedEmployee: null,
        };
        return selector ? selector(state) : state;
      },
      {
        setState: vi.fn(),
        getState: vi.fn(() => ({
          employees: storeEmployeesValue,
          updateEmployee,
          selectedEmployee: null,
        })),
      },
    ),
  };
});

vi.mock('@/stores/selectionStore', () => {
  const toggleSelect = vi.fn();
  return {
    useSelectionStore: Object.assign(
      (selector?: (s: Record<string, unknown>) => unknown) => {
        const state = { isSelected: () => false, toggleSelect };
        return selector ? selector(state) : state;
      },
      {
        setState: vi.fn(),
        getState: vi.fn(() => ({ isSelected: () => false, toggleSelect })),
      },
    ),
  };
});

vi.mock('@/stores/scheduledChangeStore', () => ({
  useScheduledChangeStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = { hasPendingChanges: () => false };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/stores/invitationStore', () => ({
  useInvitationStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = { currentRole: 'admin' };
    return selector ? selector(state) : state;
  },
}));

interface CardDataWithChart extends Employee {
  _chartEmployees?: Employee[];
}

function renderCard(employee: Employee, data?: CardDataWithChart) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CardAny = EmployeeCard as unknown as (props: any) => JSX.Element;
  return render(
    <ReactFlowProvider>
      <CardAny
        id={employee._id}
        type="employee"
        data={data ?? employee}
        selected={false}
        dragging={false}
        zIndex={0}
        isConnectable
        xPos={0}
        yPos={0}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        draggable
        selectable
        deletable
      />
    </ReactFlowProvider>,
  );
}

describe('EmployeeCard span badges use the rendered dataset', () => {
  beforeEach(() => {
    useOverlayStore.setState({ mode: 'none' });
    storeEmployeesValue = [];
  });

  it('shows overloaded warning based on _chartEmployees (historical snapshot) when store is empty', () => {
    // Live store looks empty (simulating stale/unrelated scenario data)
    storeEmployeesValue = [];
    // The chart is rendering a historical snapshot with 9 reports.
    const chartEmployees = managerWithReports('mgr-1', 'Manager', 9);
    const manager = chartEmployees[0];

    renderCard(manager, { ...manager, _chartEmployees: chartEmployees });

    const badge = screen.getByTestId('span-warning-overloaded');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toContain('9');
  });

  it('does NOT show the live-store count when the rendered dataset differs', () => {
    // Live store claims manager has 10 reports (overloaded).
    storeEmployeesValue = managerWithReports('mgr-1', 'Manager', 10);
    // But the chart is rendering a historical dataset where the manager
    // had only 1 report (underutilized).
    const chartEmployees = managerWithReports('mgr-1', 'Manager', 1);
    const manager = chartEmployees[0];

    renderCard(manager, { ...manager, _chartEmployees: chartEmployees });

    // Underutilized badge from the rendered dataset wins.
    const badge = screen.getByTestId('span-warning-underutilized');
    expect(badge).toBeInTheDocument();
    // The overloaded (live-store) badge must NOT appear.
    expect(
      screen.queryByTestId('span-warning-overloaded'),
    ).not.toBeInTheDocument();
  });

  it('falls back to the store when _chartEmployees is not provided', () => {
    // No _chartEmployees on the node data — legacy callers still work.
    storeEmployeesValue = managerWithReports('mgr-1', 'Manager', 1);
    const manager = storeEmployeesValue[0];

    renderCard(manager); // no extra data passed

    expect(
      screen.getByTestId('span-warning-underutilized'),
    ).toBeInTheDocument();
  });

  it('hides warning badges when the rendered dataset shows a healthy count', () => {
    // Live store is overloaded, but chart shows a healthy subset.
    storeEmployeesValue = managerWithReports('mgr-1', 'Manager', 10);
    const chartEmployees = managerWithReports('mgr-1', 'Manager', 4);
    const manager = chartEmployees[0];

    renderCard(manager, { ...manager, _chartEmployees: chartEmployees });

    expect(
      screen.queryByTestId('span-warning-overloaded'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('span-warning-underutilized'),
    ).not.toBeInTheDocument();
  });
});
