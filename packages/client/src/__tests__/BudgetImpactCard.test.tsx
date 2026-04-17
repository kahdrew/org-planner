import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BudgetImpactCard from '@/components/panels/BudgetImpactCard';
import type { BudgetEnvelope, Employee } from '@/types';

const envelope: BudgetEnvelope = {
  _id: 'env-1',
  orgId: 'org-1',
  scenarioId: 'scn-1',
  department: 'Engineering',
  totalBudget: 1_000_000,
  headcountCap: 10,
  createdBy: 'u1',
  createdAt: '',
  updatedAt: '',
};

function makeEmployee(
  overrides: Partial<Employee>,
  id = Math.random().toString(36).slice(2),
): Employee {
  return {
    _id: id,
    scenarioId: 'scn-1',
    name: 'Test',
    title: 'Engineer',
    department: 'Engineering',
    level: 'IC3',
    location: 'Remote',
    salary: 100_000,
    equity: 0,
    employmentType: 'FTE',
    status: 'Active',
    managerId: null,
    order: 0,
    ...overrides,
  };
}

describe('BudgetImpactCard (VAL-APPROVAL-003)', () => {
  it('shows current spend, projected, remaining, and utilization', () => {
    const employees = [
      makeEmployee({ salary: 200_000 }),
      makeEmployee({ salary: 300_000, equity: 50_000 }),
    ];
    render(
      <BudgetImpactCard
        department="Engineering"
        employees={employees}
        envelopes={[envelope]}
        additionalCost={150_000}
      />,
    );
    // Current spend = 200k + 350k = 550k
    expect(screen.getByTestId('budget-impact-current').textContent).toMatch(
      /\$550,000/,
    );
    // Projected = 550k + 150k = 700k
    expect(screen.getByTestId('budget-impact-projected').textContent).toMatch(
      /\$700,000/,
    );
    // Remaining = 1M - 700k = 300k
    expect(screen.getByTestId('budget-impact-remaining').textContent).toMatch(
      /\$300,000/,
    );
  });

  it('shows a warning badge when projected crosses 80% utilization', () => {
    const employees = [makeEmployee({ salary: 700_000 })];
    render(
      <BudgetImpactCard
        department="Engineering"
        employees={employees}
        envelopes={[envelope]}
        additionalCost={100_000}
      />,
    );
    // 800k / 1M = 80% => warning
    expect(screen.getByTestId('budget-impact-warning')).toBeInTheDocument();
  });

  it('shows exceeded badge when projected is over 100%', () => {
    const employees = [makeEmployee({ salary: 900_000 })];
    render(
      <BudgetImpactCard
        department="Engineering"
        employees={employees}
        envelopes={[envelope]}
        additionalCost={200_000}
      />,
    );
    // 1.1M / 1M = exceeded
    expect(screen.getByTestId('budget-impact-warning')).toBeInTheDocument();
    expect(screen.getByText(/over budget/i)).toBeInTheDocument();
  });

  it('shows "no envelope set" when the department has no envelope', () => {
    render(
      <BudgetImpactCard
        department="Marketing"
        employees={[]}
        envelopes={[envelope]}
        additionalCost={100_000}
      />,
    );
    expect(
      screen.getByTestId('budget-impact-no-envelope'),
    ).toBeInTheDocument();
  });

  it('excludeEmployeeId removes an employee from the current baseline (comp change)', () => {
    const target = makeEmployee({ salary: 100_000 }, 'e-target');
    const other = makeEmployee({ salary: 200_000 });
    render(
      <BudgetImpactCard
        department="Engineering"
        employees={[target, other]}
        envelopes={[envelope]}
        additionalCost={50_000}
        additionalHeadcount={0}
        excludeEmployeeId="e-target"
      />,
    );
    // Current (excl. target) = 200k; projected = 200k + 50k = 250k
    expect(screen.getByTestId('budget-impact-current').textContent).toMatch(
      /\$200,000/,
    );
    expect(screen.getByTestId('budget-impact-projected').textContent).toMatch(
      /\$250,000/,
    );
  });
});
