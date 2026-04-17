import { useMemo, useState } from 'react';
import { X, Send, DollarSign, AlertCircle } from 'lucide-react';
import { useOrgStore } from '@/stores/orgStore';
import { useApprovalStore } from '@/stores/approvalStore';
import type { HeadcountRequestEmployeeData } from '@/types';

interface HeadcountRequestDialogProps {
  /** Optional seed data (e.g., from an existing open req). */
  seed?: Partial<HeadcountRequestEmployeeData>;
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

export default function HeadcountRequestDialog({
  seed,
  onClose,
  onSubmitted,
}: HeadcountRequestDialogProps) {
  const { currentScenario } = useOrgStore();
  const submitRequest = useApprovalStore((s) => s.submitRequest);
  const chains = useApprovalStore((s) => s.chains);

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

  const totalCost = useMemo(() => {
    return (Number(form.salary) || 0) + (Number(form.equity) || 0);
  }, [form.salary, form.equity]);

  const matchedChain = useMemo(() => {
    // Simple client-side preview mimicking server's selectChainForRequest:
    // prefer chains whose conditions are satisfied, else first default.
    if (chains.length === 0) return null;
    const matching = chains.filter((c) => {
      const hasLevel = !!c.conditions?.minLevel;
      const hasCost = typeof c.conditions?.minCost === 'number';
      if (!hasLevel && !hasCost) return false;
      const costOk =
        !hasCost || totalCost >= (c.conditions?.minCost ?? 0);
      // Treat level matching as text equality or contains — server uses rank.
      const levelOk =
        !hasLevel || form.level.toLowerCase().includes(
          (c.conditions?.minLevel ?? '').toLowerCase(),
        );
      return levelOk && costOk;
    });
    if (matching.length > 0) {
      matching.sort((a, b) => b.priority - a.priority);
      return matching[0];
    }
    return chains.find((c) => c.isDefault) ?? chains[0] ?? null;
  }, [chains, totalCost, form.level]);

  const canSubmit =
    form.name.trim() &&
    form.title.trim() &&
    form.department.trim() &&
    form.level.trim() &&
    form.location.trim() &&
    !submitting &&
    !!currentScenario;

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
        ...(form.salary ? { salary: Number(form.salary) } : {}),
        ...(form.equity ? { equity: Number(form.equity) } : {}),
        ...(form.justification.trim()
          ? { justification: form.justification.trim() }
          : {}),
        status: 'Planned',
      };
      await submitRequest(currentScenario._id, { employeeData: payload });
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        data-testid="headcount-request-dialog"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Submit Headcount Request
          </h3>
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
          <Field label="Candidate / Role Name">
            <input
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
              className="input"
              placeholder="e.g. Senior Engineer, or candidate name"
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

          <Field label="Justification">
            <textarea
              value={form.justification}
              onChange={(e) =>
                setForm((f) => ({ ...f, justification: e.target.value }))
              }
              className="input"
              rows={3}
              placeholder="Why is this headcount needed?"
            />
          </Field>

          <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
            <div className="mb-1 flex items-center gap-1 font-medium">
              <DollarSign size={12} /> Budget Impact
            </div>
            <div>
              Projected total cost:{' '}
              <span className="font-semibold">
                {currencyFormatter.format(totalCost)}
              </span>
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
      <style>{`.input { width: 100%; border: 1px solid rgb(209 213 219); padding: 0.5rem 0.75rem; border-radius: 0.375rem; font-size: 0.875rem; }`}</style>
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
