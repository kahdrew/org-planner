import { useEffect, useMemo, useState } from 'react';
import { X, Send, AlertCircle, UserPlus, DollarSign } from 'lucide-react';
import { useOrgStore } from '@/stores/orgStore';
import { useApprovalStore } from '@/stores/approvalStore';
import { useBudgetStore } from '@/stores/budgetStore';
import type {
  Employee,
  HeadcountRequestEmployeeData,
  HeadcountRequestType,
} from '@/types';
import BudgetImpactCard from './BudgetImpactCard';
import { cn } from '@/utils/cn';

interface HeadcountRequestDialogProps {
  /** Optional seed data (e.g., from an existing open req). */
  seed?: Partial<HeadcountRequestEmployeeData>;
  /** Initial mode (defaults to 'new_hire'). Useful when launched for a
   *  specific employee's comp change. */
  initialMode?: HeadcountRequestType;
  /** If provided, the dialog is pre-seeded for a comp change for this employee. */
  initialTargetEmployee?: Employee;
  onClose: () => void;
  onSubmitted?: () => void;
}

const DEPARTMENTS = [
  'Engineering',
  'Product',
  'Design',
  'Marketing',
  'Sales',
  'Finance',
  'HR',
  'Legal',
  'Operations',
  'Customer Success',
  'Data',
  'Security',
  'IT',
  'Executive',
] as const;

const EMPLOYMENT_TYPES: HeadcountRequestEmployeeData['employmentType'][] = [
  'FTE',
  'Contractor',
  'Intern',
];

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function formatDelta(n: number): string {
  const sign = n >= 0 ? '+' : '-';
  return `${sign}${currencyFormatter.format(Math.abs(n))}`;
}

export default function HeadcountRequestDialog({
  seed,
  initialMode = 'new_hire',
  initialTargetEmployee,
  onClose,
  onSubmitted,
}: HeadcountRequestDialogProps) {
  const currentScenario = useOrgStore((s) => s.currentScenario);
  const employees = useOrgStore((s) => s.employees ?? []);
  const submitRequest = useApprovalStore((s) => s.submitRequest);
  const chains = useApprovalStore((s) => s.chains);
  const envelopes = useBudgetStore((s) => s.envelopes) ?? [];
  const fetchEnvelopes = useBudgetStore((s) => s.fetchEnvelopes);

  // Ensure envelopes are loaded for accurate budget impact.
  useEffect(() => {
    if (currentScenario && envelopes.length === 0) {
      fetchEnvelopes(currentScenario._id).catch(() => {});
    }
  }, [currentScenario, envelopes.length, fetchEnvelopes]);

  const [mode, setMode] = useState<HeadcountRequestType>(
    initialTargetEmployee ? 'comp_change' : initialMode,
  );
  const [targetEmployeeId, setTargetEmployeeId] = useState<string>(
    initialTargetEmployee?._id ?? '',
  );

  // Build form based on selected mode.
  // For comp_change: form fields represent the NEW values; we compare against
  // the current employee values for the delta preview.
  const targetEmployee = useMemo<Employee | null>(() => {
    if (!targetEmployeeId) return null;
    return employees.find((e) => e._id === targetEmployeeId) ?? null;
  }, [targetEmployeeId, employees]);

  const [form, setForm] = useState({
    name: seed?.name ?? '',
    title: seed?.title ?? '',
    department: seed?.department ?? '',
    level: seed?.level ?? '',
    location: seed?.location ?? 'Remote',
    employmentType: seed?.employmentType ?? 'FTE',
    salary: seed?.salary !== undefined ? String(seed.salary) : '',
    equity: seed?.equity !== undefined ? String(seed.equity) : '',
    justification: seed?.justification ?? '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When target employee changes in comp_change mode, prefill current values.
  useEffect(() => {
    if (mode === 'comp_change' && targetEmployee) {
      setForm((f) => ({
        ...f,
        name: targetEmployee.name,
        title: targetEmployee.title,
        department: targetEmployee.department,
        level: targetEmployee.level,
        location: targetEmployee.location ?? f.location,
        employmentType: targetEmployee.employmentType,
        salary:
          targetEmployee.salary !== undefined
            ? String(targetEmployee.salary)
            : '',
        equity:
          targetEmployee.equity !== undefined
            ? String(targetEmployee.equity)
            : '',
      }));
    }
  }, [mode, targetEmployee]);

  const newSalary = Number(form.salary) || 0;
  const newEquity = Number(form.equity) || 0;
  const newTotal = newSalary + newEquity;

  const currentSalary = targetEmployee?.salary ?? 0;
  const currentEquity = targetEmployee?.equity ?? 0;
  const currentTotal = currentSalary + currentEquity;

  // Additional cost to add to budget for impact preview:
  //  - new_hire: the full new comp
  //  - comp_change: delta (new - current); can be negative
  const additionalCost =
    mode === 'comp_change' && targetEmployee
      ? newTotal - currentTotal
      : newTotal;

  // For new_hire we add 1 headcount; comp_change doesn't add headcount.
  const additionalHeadcount = mode === 'comp_change' ? 0 : 1;

  const matchedChain = useMemo(() => {
    if (chains.length === 0) return null;
    const matching = chains.filter((c) => {
      const hasLevel = !!c.conditions?.minLevel;
      const hasCost = typeof c.conditions?.minCost === 'number';
      if (!hasLevel && !hasCost) return false;
      const costOk = !hasCost || newTotal >= (c.conditions?.minCost ?? 0);
      const levelOk =
        !hasLevel ||
        form.level.toLowerCase().includes(
          (c.conditions?.minLevel ?? '').toLowerCase(),
        );
      return levelOk && costOk;
    });
    if (matching.length > 0) {
      matching.sort((a, b) => b.priority - a.priority);
      return matching[0];
    }
    return chains.find((c) => c.isDefault) ?? chains[0] ?? null;
  }, [chains, newTotal, form.level]);

  const baseValid =
    form.name.trim() &&
    form.title.trim() &&
    form.department.trim() &&
    form.level.trim() &&
    form.location.trim() &&
    !submitting &&
    !!currentScenario;
  const compValid = mode === 'comp_change' ? !!targetEmployeeId : true;
  const canSubmit = baseValid && compValid;

  const handleSubmit = async () => {
    if (!currentScenario || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: HeadcountRequestEmployeeData = {
        name: form.name.trim(),
        title: form.title.trim(),
        department: form.department.trim(),
        level: form.level.trim(),
        location: form.location.trim(),
        employmentType: form.employmentType,
        ...(form.salary ? { salary: newSalary } : {}),
        ...(form.equity ? { equity: newEquity } : {}),
        ...(form.justification.trim()
          ? { justification: form.justification.trim() }
          : {}),
        status: 'Planned',
      };
      await submitRequest(currentScenario._id, {
        employeeData: payload,
        requestType: mode,
        ...(mode === 'comp_change' && targetEmployeeId
          ? { targetEmployeeId }
          : {}),
      });
      onSubmitted?.();
      onClose();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ??
        (err as Error)?.message ??
        'Failed to submit request';
      setError(typeof msg === 'string' ? msg : 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const titleCopy =
    mode === 'comp_change'
      ? 'Submit Compensation Change Request'
      : 'Submit Headcount Request';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        data-testid="headcount-request-dialog"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-gray-900">{titleCopy}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm">
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle size={14} className="mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Mode toggle */}
          <div
            className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5 text-xs"
            role="tablist"
            aria-label="Request type"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'new_hire'}
              data-testid="mode-new-hire"
              onClick={() => setMode('new_hire')}
              className={cn(
                'flex items-center gap-1 rounded px-3 py-1 font-medium',
                mode === 'new_hire'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900',
              )}
            >
              <UserPlus size={12} /> New Hire
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'comp_change'}
              data-testid="mode-comp-change"
              onClick={() => setMode('comp_change')}
              className={cn(
                'flex items-center gap-1 rounded px-3 py-1 font-medium',
                mode === 'comp_change'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900',
              )}
            >
              <DollarSign size={12} /> Comp Change
            </button>
          </div>

          {mode === 'comp_change' && (
            <Field label="Employee">
              <select
                value={targetEmployeeId}
                onChange={(e) => setTargetEmployeeId(e.target.value)}
                className="input"
                data-testid="comp-change-employee-select"
              >
                <option value="">Select an employee...</option>
                {employees.map((emp) => (
                  <option key={emp._id} value={emp._id}>
                    {emp.name} — {emp.title}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field
            label={
              mode === 'comp_change' ? 'Employee / Role Name' : 'Candidate / Role Name'
            }
          >
            <input
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
              className="input"
              placeholder="e.g. Senior Engineer, or candidate name"
              disabled={mode === 'comp_change'}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title">
              <input
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                className="input"
              />
            </Field>
            <Field label="Level">
              <input
                value={form.level}
                onChange={(e) =>
                  setForm((f) => ({ ...f, level: e.target.value }))
                }
                className="input"
                placeholder="e.g. IC4, Director"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Department">
              <select
                value={form.department}
                onChange={(e) =>
                  setForm((f) => ({ ...f, department: e.target.value }))
                }
                className="input"
              >
                <option value="">Select...</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Location">
              <input
                value={form.location}
                onChange={(e) =>
                  setForm((f) => ({ ...f, location: e.target.value }))
                }
                className="input"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Employment Type">
              <select
                value={form.employmentType}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    employmentType: e.target
                      .value as HeadcountRequestEmployeeData['employmentType'],
                  }))
                }
                className="input"
                disabled={mode === 'comp_change'}
              >
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Salary (annual)">
              <input
                type="number"
                min={0}
                value={form.salary}
                onChange={(e) =>
                  setForm((f) => ({ ...f, salary: e.target.value }))
                }
                className="input"
                placeholder="120000"
              />
            </Field>
            <Field label="Equity (annual)">
              <input
                type="number"
                min={0}
                value={form.equity}
                onChange={(e) =>
                  setForm((f) => ({ ...f, equity: e.target.value }))
                }
                className="input"
                placeholder="25000"
              />
            </Field>
          </div>

          {/* Compensation Change Delta */}
          {mode === 'comp_change' && targetEmployee && (
            <div
              className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900"
              data-testid="comp-change-delta"
            >
              <div className="mb-2 font-medium">Proposed Compensation Change</div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-[10px] uppercase text-blue-700">
                    Current
                  </div>
                  <div className="font-semibold text-blue-900">
                    {currencyFormatter.format(currentTotal)}
                  </div>
                  <div className="text-[11px] text-blue-700">
                    {currencyFormatter.format(currentSalary)} salary ·{' '}
                    {currencyFormatter.format(currentEquity)} equity
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-blue-700">
                    Proposed
                  </div>
                  <div className="font-semibold text-blue-900">
                    {currencyFormatter.format(newTotal)}
                  </div>
                  <div className="text-[11px] text-blue-700">
                    {currencyFormatter.format(newSalary)} salary ·{' '}
                    {currencyFormatter.format(newEquity)} equity
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-blue-700">
                    Delta
                  </div>
                  <div
                    className={cn(
                      'font-bold',
                      newTotal - currentTotal > 0
                        ? 'text-green-700'
                        : newTotal - currentTotal < 0
                          ? 'text-red-700'
                          : 'text-blue-900',
                    )}
                    data-testid="comp-change-delta-total"
                  >
                    {formatDelta(newTotal - currentTotal)}
                  </div>
                  {targetEmployee.title !== form.title && (
                    <div className="text-[11px] text-blue-700">
                      Title: {targetEmployee.title} → {form.title}
                    </div>
                  )}
                  {targetEmployee.level !== form.level && (
                    <div className="text-[11px] text-blue-700">
                      Level: {targetEmployee.level} → {form.level}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <Field label="Justification">
            <textarea
              value={form.justification}
              onChange={(e) =>
                setForm((f) => ({ ...f, justification: e.target.value }))
              }
              className="input"
              rows={3}
              placeholder="Why is this change needed?"
            />
          </Field>

          {/* Budget Impact */}
          {form.department && (
            <BudgetImpactCard
              department={form.department}
              employees={employees}
              envelopes={envelopes}
              additionalCost={additionalCost}
              additionalHeadcount={additionalHeadcount}
              variant="detailed"
            />
          )}

          <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
            <div>
              Projected total cost:{' '}
              <span className="font-semibold">
                {currencyFormatter.format(newTotal)}
              </span>
              {mode === 'comp_change' && targetEmployee && (
                <span className="ml-2 text-gray-500">
                  (delta {formatDelta(newTotal - currentTotal)})
                </span>
              )}
            </div>
            {matchedChain && (
              <div className="mt-1 text-gray-600">
                Routed to approval chain:{' '}
                <span className="font-medium">{matchedChain.name}</span> (
                {matchedChain.steps.length} step
                {matchedChain.steps.length === 1 ? '' : 's'})
              </div>
            )}
            {chains.length === 0 && (
              <div className="mt-1 text-red-600">
                No approval chain configured. Ask an admin to create one.
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || chains.length === 0}
            className="flex items-center gap-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="submit-request-btn"
          >
            <Send size={14} /> {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </div>
      <style>{`.input { width: 100%; border: 1px solid rgb(209 213 219); padding: 0.5rem 0.75rem; border-radius: 0.375rem; font-size: 0.875rem; } .input:disabled { background-color: rgb(243 244 246); color: rgb(107 114 128); }`}</style>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-700">
        {label}
      </span>
      {children}
    </label>
  );
}
