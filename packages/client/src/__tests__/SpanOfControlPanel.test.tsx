import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import type { Employee } from '@/types';
import SpanOfControlPanel from '@/components/panels/SpanOfControlPanel';

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
  overrides: Partial<Employee> = {},
): Employee[] {
  const manager = makeEmployee({
    _id: managerId,
    name,
    title: `${name} Title`,
    ...overrides,
  });
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

// ---- Mocks ----
let employeesValue: Employee[] = [];
const selectEmployeeMock = vi.fn();
const singleSelectMock = vi.fn();

vi.mock('@/stores/orgStore', () => {
  return {
    useOrgStore: (selector?: (s: Record<string, unknown>) => unknown) => {
      const state = {
        employees: employeesValue,
        selectEmployee: selectEmployeeMock,
      };
      return selector ? selector(state) : state;
    },
  };
});

vi.mock('@/stores/selectionStore', () => ({
  useSelectionStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = { singleSelect: singleSelectMock };
    return selector ? selector(state) : state;
  },
}));

// Spy on useNavigate without losing the rest of react-router-dom
const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

function renderPanel(open = true, onClose = vi.fn()) {
  return render(
    <MemoryRouter>
      <SpanOfControlPanel open={open} onClose={onClose} />
    </MemoryRouter>,
  );
}

describe('SpanOfControlPanel', () => {
  beforeEach(() => {
    employeesValue = [];
    selectEmployeeMock.mockReset();
    singleSelectMock.mockReset();
    navigateMock.mockReset();
  });

  it('does not render when open is false', () => {
    employeesValue = managerWithReports('m', 'Manager', 3);
    renderPanel(false);
    expect(screen.queryByTestId('span-of-control-panel')).not.toBeInTheDocument();
  });

  it('renders the panel header when open', () => {
    employeesValue = managerWithReports('m', 'Manager', 3);
    renderPanel(true);
    expect(screen.getByTestId('span-of-control-panel')).toBeInTheDocument();
    expect(screen.getByText('Span of Control')).toBeInTheDocument();
  });

  it('shows empty state when there are no managers', () => {
    employeesValue = [makeEmployee({ _id: 'ic' })];
    renderPanel(true);
    expect(screen.getByTestId('span-of-control-empty')).toBeInTheDocument();
    expect(screen.getByText(/No managers yet/i)).toBeInTheDocument();
  });

  it('lists all managers sorted by report count descending', () => {
    employeesValue = [
      ...managerWithReports('big', 'Big Boss', 9),
      ...managerWithReports('med', 'Med', 4),
      ...managerWithReports('small', 'Small', 1),
    ];
    renderPanel(true);

    const list = screen.getByTestId('span-of-control-list');
    const rows = within(list).getAllByTestId(/^span-row-[a-z]+$/);
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'span-row-big',
      'span-row-med',
      'span-row-small',
    ]);
  });

  it('excludes IC employees (no reports) from the list', () => {
    employeesValue = [
      makeEmployee({ _id: 'ceo', name: 'CEO' }),
      makeEmployee({ _id: 'ic1', name: 'IC One', managerId: 'ceo' }),
      makeEmployee({ _id: 'ic2', name: 'IC Two', managerId: 'ceo' }),
    ];
    renderPanel(true);
    expect(screen.getByTestId('span-row-ceo')).toBeInTheDocument();
    // ICs without reports should be absent.
    expect(screen.queryByTestId('span-row-ic1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('span-row-ic2')).not.toBeInTheDocument();
  });

  it('flags overloaded managers (>8 reports) with red "Overloaded" badge', () => {
    employeesValue = managerWithReports('over', 'Overloaded', 9);
    renderPanel(true);
    const row = screen.getByTestId('span-row-over');
    expect(row.getAttribute('data-flag')).toBe('overloaded');
    expect(screen.getByTestId('span-row-flag-over')).toHaveTextContent(/overloaded/i);
  });

  it('flags underutilized managers (<2 reports) with "Underutilized" badge', () => {
    employeesValue = managerWithReports('under', 'Underutilized', 1);
    renderPanel(true);
    const row = screen.getByTestId('span-row-under');
    expect(row.getAttribute('data-flag')).toBe('underutilized');
    expect(screen.getByTestId('span-row-flag-under')).toHaveTextContent(/underutilized/i);
  });

  it('marks healthy managers with a "Healthy" badge and no recommendation', () => {
    employeesValue = managerWithReports('healthy', 'Healthy', 4);
    renderPanel(true);
    const row = screen.getByTestId('span-row-healthy');
    expect(row.getAttribute('data-flag')).toBe('healthy');
    expect(screen.queryByTestId('span-row-recommendation-healthy')).not.toBeInTheDocument();
  });

  it('shows a split-team recommendation for overloaded managers', () => {
    employeesValue = managerWithReports('over', 'Overloaded', 12);
    renderPanel(true);
    const rec = screen.getByTestId('span-row-recommendation-over');
    expect(rec.textContent?.toLowerCase()).toContain('split');
    expect(rec.textContent).toContain('12');
  });

  it('displays the summary tile counts (total / overloaded / underutilized)', () => {
    employeesValue = [
      ...managerWithReports('over', 'Over', 9),
      ...managerWithReports('under', 'Under', 1),
      ...managerWithReports('ok', 'Ok', 3),
    ];
    renderPanel(true);
    expect(screen.getByTestId('span-summary-total')).toHaveTextContent('3');
    expect(screen.getByTestId('span-summary-overloaded')).toHaveTextContent('1');
    expect(screen.getByTestId('span-summary-underutilized')).toHaveTextContent('1');
  });

  it('clicking a manager row navigates to org chart, selects the employee, and closes the panel', () => {
    employeesValue = managerWithReports('target', 'Target', 3);
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <SpanOfControlPanel open onClose={onClose} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId('span-row-target'));

    // selectEmployee called with the clicked manager
    expect(selectEmployeeMock).toHaveBeenCalledTimes(1);
    const passedEmployee = selectEmployeeMock.mock.calls[0][0] as Employee;
    expect(passedEmployee._id).toBe('target');
    // singleSelect called with the manager id
    expect(singleSelectMock).toHaveBeenCalledWith('target');
    // navigated to the org chart route
    expect(navigateMock).toHaveBeenCalledWith('/');
    // panel was closed
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking the close button invokes onClose', () => {
    employeesValue = managerWithReports('m', 'M', 2);
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <SpanOfControlPanel open onClose={onClose} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('span-of-control-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// Silence unused-import warning — useNavigate is mocked above and not
// referenced in this file otherwise.
void useNavigate;
