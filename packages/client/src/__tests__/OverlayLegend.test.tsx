import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OverlayLegend from '@/components/panels/OverlayLegend';
import { useOverlayStore } from '@/stores/overlayStore';
import type { Employee } from '@/types';

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

vi.mock('@/stores/orgStore', () => ({
  useOrgStore: Object.assign(
    (selector?: (s: { employees: Employee[] }) => unknown) => {
      const state = { employees: employeesValue };
      return selector ? selector(state) : state;
    },
    {
      getState: vi.fn(() => ({ employees: employeesValue })),
      setState: vi.fn(),
    },
  ),
}));

describe('OverlayLegend', () => {
  beforeEach(() => {
    useOverlayStore.setState({ mode: 'none' });
    employeesValue = [
      makeEmployee({ _id: '1', salary: 100000, department: 'Engineering', employmentType: 'FTE', status: 'Active' }),
      makeEmployee({ _id: '2', salary: 200000, department: 'Sales', employmentType: 'Contractor', status: 'Planned' }),
    ];
  });

  it('renders nothing when mode is "none"', () => {
    const { container } = render(<OverlayLegend />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the salary gradient legend', () => {
    useOverlayStore.setState({ mode: 'salary' });
    render(<OverlayLegend />);
    expect(screen.getByTestId('overlay-legend')).toBeInTheDocument();
    expect(screen.getByTestId('overlay-legend-title')).toHaveTextContent('Salary Band');
    expect(screen.getByTestId('overlay-legend-gradient')).toBeInTheDocument();
    expect(screen.getByTestId('overlay-legend-min').textContent).toContain('$100,000');
    expect(screen.getByTestId('overlay-legend-max').textContent).toContain('$200,000');
  });

  it('shows the department categorical legend with one entry per dept', () => {
    useOverlayStore.setState({ mode: 'department' });
    render(<OverlayLegend />);
    const categorical = screen.getByTestId('overlay-legend-categorical');
    expect(categorical).toBeInTheDocument();
    expect(categorical.textContent).toContain('Engineering');
    expect(categorical.textContent).toContain('Sales');
  });

  it('shows the fixed employment type legend with all three types', () => {
    useOverlayStore.setState({ mode: 'employmentType' });
    render(<OverlayLegend />);
    const text = screen.getByTestId('overlay-legend-categorical').textContent ?? '';
    expect(text).toContain('FTE');
    expect(text).toContain('Contractor');
    expect(text).toContain('Intern');
  });

  it('shows the status legend with all four statuses', () => {
    useOverlayStore.setState({ mode: 'status' });
    render(<OverlayLegend />);
    const text = screen.getByTestId('overlay-legend-categorical').textContent ?? '';
    expect(text).toContain('Active');
    expect(text).toContain('Planned');
    expect(text).toContain('Open Req');
    expect(text).toContain('Backfill');
  });

  it('close button turns the overlay off', () => {
    useOverlayStore.setState({ mode: 'salary' });
    render(<OverlayLegend />);
    fireEvent.click(screen.getByTestId('overlay-legend-close'));
    expect(useOverlayStore.getState().mode).toBe('none');
  });
});
