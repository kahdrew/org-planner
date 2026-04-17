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

let employeesValue: Employee[] = [];

vi.mock('@/stores/orgStore', () => {
  const updateEmployee = vi.fn();
  return {
    useOrgStore: Object.assign(
      (selector?: (s: Record<string, unknown>) => unknown) => {
        const state = {
          employees: employeesValue,
          updateEmployee,
          selectedEmployee: null,
        };
        return selector ? selector(state) : state;
      },
      {
        setState: vi.fn(),
        getState: vi.fn(() => ({
          employees: employeesValue,
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
        const state = {
          isSelected: () => false,
          toggleSelect,
        };
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

function renderCard(employee: Employee) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CardAny = EmployeeCard as unknown as (props: any) => JSX.Element;
  return render(
    <ReactFlowProvider>
      <CardAny
        id={employee._id}
        type="employee"
        data={employee}
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

describe('EmployeeCard span-of-control warning badges', () => {
  beforeEach(() => {
    useOverlayStore.setState({ mode: 'none' });
    employeesValue = [];
  });

  it('shows overloaded warning badge when manager has >8 direct reports', () => {
    employeesValue = managerWithReports('mgr', 'Manager', 9);
    renderCard(employeesValue[0]);
    const badge = screen.getByTestId('span-warning-overloaded');
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute('data-span-flag')).toBe('overloaded');
    expect(badge.textContent).toContain('9');
    expect(screen.queryByTestId('span-warning-underutilized')).not.toBeInTheDocument();
  });

  it('shows underutilized warning badge when manager has 1 direct report', () => {
    employeesValue = managerWithReports('mgr', 'Manager', 1);
    renderCard(employeesValue[0]);
    const badge = screen.getByTestId('span-warning-underutilized');
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute('data-span-flag')).toBe('underutilized');
    expect(badge.textContent).toContain('1');
    expect(screen.queryByTestId('span-warning-overloaded')).not.toBeInTheDocument();
  });

  it('does not show any warning badge when manager has a healthy report count', () => {
    employeesValue = managerWithReports('mgr', 'Manager', 4);
    renderCard(employeesValue[0]);
    expect(screen.queryByTestId('span-warning-overloaded')).not.toBeInTheDocument();
    expect(screen.queryByTestId('span-warning-underutilized')).not.toBeInTheDocument();
  });

  it('does not show any warning badge for IC employees (0 reports)', () => {
    const ic = makeEmployee({ _id: 'ic', name: 'IC Only' });
    employeesValue = [ic];
    renderCard(ic);
    expect(screen.queryByTestId('span-warning-overloaded')).not.toBeInTheDocument();
    expect(screen.queryByTestId('span-warning-underutilized')).not.toBeInTheDocument();
  });

  it('switches from underutilized to overloaded as the team grows', () => {
    // Underutilized initial state: 1 report
    employeesValue = managerWithReports('mgr', 'Manager', 1);
    const { unmount } = renderCard(employeesValue[0]);
    expect(screen.getByTestId('span-warning-underutilized')).toBeInTheDocument();
    unmount();

    // Overloaded state: 10 reports
    employeesValue = managerWithReports('mgr', 'Manager', 10);
    renderCard(employeesValue[0]);
    expect(screen.getByTestId('span-warning-overloaded')).toBeInTheDocument();
    expect(screen.queryByTestId('span-warning-underutilized')).not.toBeInTheDocument();
  });
});
