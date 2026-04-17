import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import type { Employee, Scenario } from '@/types';
import DashboardView from '@/components/views/DashboardView';

// --- Mock recharts to avoid jsdom ResizeObserver/SVG sizing issues ---
// We stub every component used by DashboardView with minimal wrappers so tests
// can verify layout, data wiring, and interaction without rendering real SVG.
vi.mock('recharts', () => {
  const Noop = ({ children }: { children?: ReactNode }) =>
    createElement('div', { 'data-testid': 'recharts-stub' }, children);
  const Line = () => null;
  const Bar = () => null;
  const Pie = ({ data }: { data: unknown[] }) =>
    createElement('div', {
      'data-testid': 'recharts-pie',
      'data-points': JSON.stringify(data),
    });
  return {
    ResponsiveContainer: Noop,
    LineChart: Noop,
    Line,
    BarChart: Noop,
    Bar,
    PieChart: Noop,
    Pie,
    Cell: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
  };
});

// --- Mocked orgStore ---
let employeesValue: Employee[] = [];
let currentScenarioValue: Scenario | null = null;
vi.mock('@/stores/orgStore', () => {
  return {
    useOrgStore: (selector?: (s: Record<string, unknown>) => unknown) => {
      const state = {
        employees: employeesValue,
        currentScenario: currentScenarioValue,
      };
      return selector ? selector(state) : state;
    },
  };
});

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

const SCEN: Scenario = {
  _id: 'scen-1',
  orgId: 'org-1',
  name: 'Baseline FY26',
  createdBy: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardView />
    </MemoryRouter>,
  );
}

describe('DashboardView', () => {
  beforeEach(() => {
    employeesValue = [];
    currentScenarioValue = null;
  });

  it('shows a no-scenario prompt when no scenario is selected', () => {
    currentScenarioValue = null;
    employeesValue = [];
    renderDashboard();
    expect(screen.getByTestId('dashboard-no-scenario')).toBeInTheDocument();
  });

  it('shows the empty state when a scenario is selected but has no employees', () => {
    currentScenarioValue = SCEN;
    employeesValue = [];
    renderDashboard();
    expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-empty-state')).toBeInTheDocument();
  });

  it('renders all five widgets when employees exist', () => {
    currentScenarioValue = SCEN;
    employeesValue = [
      makeEmployee({ _id: 'a', startDate: '2026-01-15T00:00:00Z' }),
      makeEmployee({ _id: 'b', startDate: '2026-03-10T00:00:00Z' }),
    ];
    renderDashboard();
    expect(screen.getByTestId('widget-headcount-trends')).toBeInTheDocument();
    expect(screen.getByTestId('widget-cost-breakdown')).toBeInTheDocument();
    expect(screen.getByTestId('widget-employment-distribution')).toBeInTheDocument();
    expect(screen.getByTestId('widget-open-positions')).toBeInTheDocument();
    expect(screen.getByTestId('widget-hiring-velocity')).toBeInTheDocument();
  });

  it('shows headcount matching the employee count in the summary tile', () => {
    currentScenarioValue = SCEN;
    employeesValue = [
      makeEmployee({ _id: 'a' }),
      makeEmployee({ _id: 'b' }),
      makeEmployee({ _id: 'c' }),
    ];
    renderDashboard();
    const tile = screen.getByTestId('summary-headcount');
    expect(tile).toHaveTextContent('3');
  });

  it('shows Open Req and Backfill counts and lists open positions', () => {
    currentScenarioValue = SCEN;
    employeesValue = [
      makeEmployee({ _id: 'a', status: 'Active' }),
      makeEmployee({ _id: 'o1', name: 'Req One', status: 'Open Req' }),
      makeEmployee({ _id: 'o2', name: 'Req Two', status: 'Open Req' }),
      makeEmployee({ _id: 'b1', name: 'BF One', status: 'Backfill' }),
    ];
    renderDashboard();
    expect(screen.getByTestId('open-positions-open-req')).toHaveTextContent(
      'Open Req: 2',
    );
    expect(screen.getByTestId('open-positions-backfill')).toHaveTextContent(
      'Backfill: 1',
    );
    expect(screen.getByTestId('open-positions-total')).toHaveTextContent('3');
    // List entries present for both open req and backfill
    expect(screen.getByTestId('open-position-o1')).toBeInTheDocument();
    expect(screen.getByTestId('open-position-b1')).toBeInTheDocument();
  });

  it('summary total comp matches sum of salary + equity across employees', () => {
    currentScenarioValue = SCEN;
    employeesValue = [
      makeEmployee({ salary: 100_000, equity: 20_000 }),
      makeEmployee({ salary: 150_000, equity: 30_000 }),
    ];
    renderDashboard();
    // 300,000 total
    const tile = screen.getByTestId('summary-total-comp');
    expect(tile).toHaveTextContent('$300,000');
  });

  it('employment distribution shows counts per type', () => {
    currentScenarioValue = SCEN;
    employeesValue = [
      makeEmployee({ employmentType: 'FTE' }),
      makeEmployee({ employmentType: 'FTE' }),
      makeEmployee({ employmentType: 'Contractor' }),
      makeEmployee({ employmentType: 'Intern' }),
    ];
    renderDashboard();
    expect(screen.getByTestId('distribution-row-FTE')).toHaveTextContent('2');
    expect(screen.getByTestId('distribution-row-Contractor')).toHaveTextContent('1');
    expect(screen.getByTestId('distribution-row-Intern')).toHaveTextContent('1');
  });

  it('cost breakdown dimension selector updates aggregation', () => {
    currentScenarioValue = SCEN;
    employeesValue = [
      makeEmployee({ department: 'Eng', level: 'IC3', location: 'NYC', salary: 100 }),
      makeEmployee({ department: 'Eng', level: 'IC4', location: 'NYC', salary: 200 }),
      makeEmployee({ department: 'Sales', level: 'IC3', location: 'SF', salary: 50 }),
    ];
    renderDashboard();
    const select = screen.getByTestId('cost-breakdown-dimension') as HTMLSelectElement;
    expect(select.value).toBe('department');
    fireEvent.change(select, { target: { value: 'level' } });
    expect(select.value).toBe('level');
    fireEvent.change(select, { target: { value: 'location' } });
    expect(select.value).toBe('location');
  });

  it('shows the current scenario name in the heading', () => {
    currentScenarioValue = SCEN;
    employeesValue = [makeEmployee()];
    renderDashboard();
    const view = screen.getByTestId('dashboard-view');
    expect(within(view).getByText(/Baseline FY26/)).toBeInTheDocument();
  });

  it('summary hires count equals the number of employees within the 12-month window', () => {
    currentScenarioValue = SCEN;
    const now = new Date();
    const withinDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    employeesValue = [
      makeEmployee({ _id: 'a', startDate: withinDate }),
      makeEmployee({ _id: 'b', startDate: withinDate }),
      // No startDate — should not count in velocity
      makeEmployee({ _id: 'c', startDate: undefined }),
    ];
    renderDashboard();
    expect(screen.getByTestId('summary-hires')).toHaveTextContent('2');
  });
});
