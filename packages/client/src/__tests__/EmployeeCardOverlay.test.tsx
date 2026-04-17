import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { Employee } from '@/types';
import EmployeeCard from '@/components/nodes/EmployeeCard';
import { useOverlayStore } from '@/stores/overlayStore';
import { STATUS_COLORS, EMPLOYMENT_TYPE_COLORS } from '@/utils/overlayColors';

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

let employeesValue: Employee[] = [];
let selectedEmployeeValue: Employee | null = null;

// ---- mocks ----
vi.mock('@/stores/orgStore', () => {
  const updateEmployee = vi.fn();
  return {
    useOrgStore: Object.assign(
      (selector?: (s: Record<string, unknown>) => unknown) => {
        const state = {
          employees: employeesValue,
          updateEmployee,
          selectedEmployee: selectedEmployeeValue,
        };
        return selector ? selector(state) : state;
      },
      {
        setState: vi.fn((partial: Record<string, unknown>) => {
          if ('selectedEmployee' in partial) {
            selectedEmployeeValue = partial.selectedEmployee as Employee | null;
          }
        }),
        getState: vi.fn(() => ({
          employees: employeesValue,
          updateEmployee,
          selectedEmployee: selectedEmployeeValue,
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

describe('EmployeeCard with overlay', () => {
  beforeEach(() => {
    useOverlayStore.setState({ mode: 'none' });
    selectedEmployeeValue = null;
    employeesValue = [
      makeEmployee({ _id: '1', salary: 100000 }),
      makeEmployee({ _id: '2', salary: 200000 }),
      makeEmployee({ _id: '3', salary: 150000 }),
    ];
  });

  it('has no overlay color attribute when mode is "none"', () => {
    renderCard(employeesValue[0]);
    const card = screen.getByTestId('employee-card-1');
    expect(card.getAttribute('data-overlay-mode')).toBe('none');
    expect(card.getAttribute('data-overlay-color')).toBe('');
  });

  it('applies status color when mode is "status"', () => {
    useOverlayStore.setState({ mode: 'status' });
    const active = makeEmployee({ _id: 'a', status: 'Active' });
    employeesValue = [active];
    renderCard(active);
    const card = screen.getByTestId('employee-card-a');
    expect(card.getAttribute('data-overlay-mode')).toBe('status');
    expect(card.getAttribute('data-overlay-color')).toBe(STATUS_COLORS.Active);
  });

  it('applies distinct employment type colors', () => {
    useOverlayStore.setState({ mode: 'employmentType' });
    const fte = makeEmployee({ _id: 'a', employmentType: 'FTE' });
    const contractor = makeEmployee({ _id: 'b', employmentType: 'Contractor' });
    employeesValue = [fte, contractor];

    const { unmount } = renderCard(fte);
    expect(screen.getByTestId('employee-card-a').getAttribute('data-overlay-color')).toBe(
      EMPLOYMENT_TYPE_COLORS.FTE,
    );
    unmount();

    renderCard(contractor);
    expect(screen.getByTestId('employee-card-b').getAttribute('data-overlay-color')).toBe(
      EMPLOYMENT_TYPE_COLORS.Contractor,
    );
  });

  it('applies gradient color for salary mode (low → green, high → red)', () => {
    useOverlayStore.setState({ mode: 'salary' });
    const lowest = makeEmployee({ _id: 'lo', salary: 100000 });
    const highest = makeEmployee({ _id: 'hi', salary: 200000 });
    employeesValue = [lowest, highest];

    const { unmount } = renderCard(lowest);
    expect(
      screen.getByTestId('employee-card-lo').getAttribute('data-overlay-color')?.toLowerCase(),
    ).toBe('#22c55e');
    unmount();

    renderCard(highest);
    expect(
      screen.getByTestId('employee-card-hi').getAttribute('data-overlay-color')?.toLowerCase(),
    ).toBe('#ef4444');
  });

  it('falls back to neutral color when salary is missing', () => {
    useOverlayStore.setState({ mode: 'salary' });
    const noSalary = makeEmployee({ _id: 'ns', salary: undefined });
    employeesValue = [noSalary, makeEmployee({ _id: 'x', salary: 100000 })];
    renderCard(noSalary);
    expect(
      screen.getByTestId('employee-card-ns').getAttribute('data-overlay-color')?.toLowerCase(),
    ).toBe('#d1d5db');
  });

  it('clicking the card still opens the detail panel (selectedEmployee set)', () => {
    useOverlayStore.setState({ mode: 'department' });
    const emp = makeEmployee({ _id: 'click-me' });
    employeesValue = [emp];
    renderCard(emp);

    fireEvent.click(screen.getByTestId('employee-card-click-me'));
    expect(selectedEmployeeValue).toEqual(emp);
  });
});
