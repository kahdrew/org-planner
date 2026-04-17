import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useOrgStore } from '@/stores/orgStore';
import { useBudgetStore } from '@/stores/budgetStore';
import { useInvitationStore } from '@/stores/invitationStore';
import {
  computeBudgetSummary,
  computeCostProjection,
  WARNING_THRESHOLD_PCT,
} from '@/utils/budgetMetrics';
import { cn } from '@/utils/cn';
import type { BudgetEnvelope, DepartmentBudgetSummary } from '@/types';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const compactCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 1,
  notation: 'compact',
});

interface BudgetPanelProps {
  open: boolean;
  onClose: () => void;
}

type Section = 'envelopes' | 'comparison' | 'projection';

function statusBarColor(status: DepartmentBudgetSummary['budgetStatus']): string {
  switch (status) {
    case 'exceeded':
      return 'bg-red-500';
    case 'warning':
      return 'bg-amber-500';
    case 'under':
      return 'bg-emerald-500';
    default:
      return 'bg-gray-400';
  }
}

function statusTextColor(status: DepartmentBudgetSummary['budgetStatus']): string {
  switch (status) {
    case 'exceeded':
      return 'text-red-600';
    case 'warning':
      return 'text-amber-600';
    case 'under':
      return 'text-emerald-600';
    default:
      return 'text-gray-500';
  }
}

function statusBadge(status: DepartmentBudgetSummary['budgetStatus']) {
  if (!status) return null;
  const base =
    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold';
  if (status === 'exceeded') {
    return (
      <span
        className={cn(base, 'bg-red-100 text-red-700')}
        data-testid="budget-status-exceeded"
      >
        <AlertCircle size={10} />
        Over budget
      </span>
    );
  }
  if (status === 'warning') {
    return (
      <span
        className={cn(base, 'bg-amber-100 text-amber-700')}
        data-testid="budget-status-warning"
      >
        <AlertTriangle size={10} />
        &gt;{WARNING_THRESHOLD_PCT}% used
      </span>
    );
  }
  return (
    <span
      className={cn(base, 'bg-emerald-100 text-emerald-700')}
      data-testid="budget-status-under"
    >
      <CheckCircle2 size={10} />
      On track
    </span>
  );
}

interface EnvelopeFormState {
  department: string;
  totalBudget: string;
  headcountCap: string;
}

const emptyForm: EnvelopeFormState = {
  department: '',
  totalBudget: '',
  headcountCap: '',
};

interface EnvelopeFormProps {
  initial?: Partial<EnvelopeFormState>;
  existingDepartments: string[];
  onSubmit: (data: {
    department: string;
    totalBudget: number;
    headcountCap: number;
  }) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  testIdPrefix: string;
}

function EnvelopeForm({
  initial,
  existingDepartments,
  onSubmit,
  onCancel,
  submitLabel,
  testIdPrefix,
}: EnvelopeFormProps) {
  const [form, setForm] = useState<EnvelopeFormState>({
    department: initial?.department ?? '',
    totalBudget: initial?.totalBudget ?? '',
    headcountCap: initial?.headcountCap ?? '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const dept = form.department.trim();
    const budget = Number(form.totalBudget);
    const cap = Number(form.headcountCap);
    if (!dept) {
      setErr('Department is required');
      return;
    }
    if (!Number.isFinite(budget) || budget < 0) {
      setErr('Budget must be a non-negative number');
      return;
    }
    if (!Number.isFinite(cap) || cap < 0 || !Number.isInteger(cap)) {
      setErr('Headcount cap must be a non-negative integer');
      return;
    }
    setErr(null);
    setSubmitting(true);
    try {
      await onSubmit({ department: dept, totalBudget: budget, headcountCap: cap });
    } catch (submitErr) {
      const msg =
        submitErr && typeof submitErr === 'object' && 'response' in submitErr
          ? (submitErr as { response?: { data?: { error?: string } } }).response
              ?.data?.error ?? 'Failed to save envelope'
          : 'Failed to save envelope';
      setErr(typeof msg === 'string' ? msg : 'Failed to save envelope');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      className="space-y-2 rounded-md border border-blue-200 bg-blue-50 p-3"
      onSubmit={handleSubmit}
      data-testid={`${testIdPrefix}-form`}
    >
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-600">
          Department
        </span>
        <input
          type="text"
          list="dept-suggestions"
          value={form.department}
          onChange={(e) => setForm({ ...form, department: e.target.value })}
          placeholder="e.g. Engineering"
          className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          required
          data-testid={`${testIdPrefix}-input-department`}
        />
        <datalist id="dept-suggestions">
          {existingDepartments.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-600">
            Total Budget ($)
          </span>
          <input
            type="number"
            min={0}
            step={1000}
            value={form.totalBudget}
            onChange={(e) => setForm({ ...form, totalBudget: e.target.value })}
            placeholder="500000"
            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            required
            data-testid={`${testIdPrefix}-input-budget`}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-600">
            Headcount Cap
          </span>
          <input
            type="number"
            min={0}
            step={1}
            value={form.headcountCap}
            onChange={(e) => setForm({ ...form, headcountCap: e.target.value })}
            placeholder="10"
            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            required
            data-testid={`${testIdPrefix}-input-headcount`}
          />
        </label>
      </div>
      {err && (
        <div
          className="rounded-md bg-red-100 px-2 py-1 text-xs text-red-700"
          data-testid={`${testIdPrefix}-error`}
        >
          {err}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          data-testid={`${testIdPrefix}-cancel`}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          data-testid={`${testIdPrefix}-submit`}
        >
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

interface CollapsibleProps {
  title: string;
  icon: React.ReactNode;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  testId?: string;
}

function Collapsible({
  title,
  icon,
  rightSlot,
  children,
  defaultOpen = true,
  testId,
}: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      className="border-b border-gray-100 last:border-b-0"
      data-testid={testId}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="text-blue-500">{icon}</span>
        <span>{title}</span>
        <span className="ml-auto">{rightSlot}</span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}

export default function BudgetPanel({ open, onClose }: BudgetPanelProps) {
  const employees = useOrgStore((s) => s.employees);
  const currentScenario = useOrgStore((s) => s.currentScenario);

  const envelopes = useBudgetStore((s) => s.envelopes);
  const fetchEnvelopes = useBudgetStore((s) => s.fetchEnvelopes);
  const createEnvelope = useBudgetStore((s) => s.createEnvelope);
  const updateEnvelope = useBudgetStore((s) => s.updateEnvelope);
  const deleteEnvelope = useBudgetStore((s) => s.deleteEnvelope);
  const clearEnvelopes = useBudgetStore((s) => s.clearEnvelopes);

  const currentRole = useInvitationStore((s) => s.currentRole);
  const canEdit = currentRole === 'owner' || currentRole === 'admin';

  const [activeSection, setActiveSection] = useState<Section>('envelopes');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Load envelopes when opened or scenario changes
  useEffect(() => {
    if (open && currentScenario?._id) {
      fetchEnvelopes(currentScenario._id);
    }
  }, [open, currentScenario?._id, fetchEnvelopes]);

  // Clear envelopes when scenario changes away
  useEffect(() => {
    if (!currentScenario) {
      clearEnvelopes();
    }
  }, [currentScenario, clearEnvelopes]);

  const summary = useMemo(
    () => computeBudgetSummary(envelopes, employees),
    [envelopes, employees],
  );

  const projection = useMemo(
    () => computeCostProjection(employees, 12),
    [employees],
  );

  const existingDepartments = useMemo(() => {
    const set = new Set<string>();
    for (const e of employees) {
      if (e.department?.trim()) set.add(e.department);
    }
    for (const env of envelopes) set.add(env.department);
    return Array.from(set).sort();
  }, [employees, envelopes]);

  if (!open) return null;

  const handleCreate = async (data: {
    department: string;
    totalBudget: number;
    headcountCap: number;
  }) => {
    if (!currentScenario?._id) return;
    await createEnvelope(currentScenario._id, data);
    setShowAddForm(false);
  };

  const handleUpdate = async (
    env: BudgetEnvelope,
    data: { department: string; totalBudget: number; headcountCap: number },
  ) => {
    if (!currentScenario?._id) return;
    await updateEnvelope(currentScenario._id, env._id, data);
    setEditingId(null);
  };

  const handleDelete = async (env: BudgetEnvelope) => {
    if (!currentScenario?._id) return;
    if (!confirm(`Delete budget envelope for "${env.department}"?`)) return;
    await deleteEnvelope(currentScenario._id, env._id);
  };

  const alertCount = summary.departments.filter(
    (d) => d.budgetStatus === 'warning' || d.budgetStatus === 'exceeded',
  ).length;

  const chartData = summary.departments
    .filter((d) => d.totalBudget !== null)
    .map((d) => ({
      department: d.department,
      Budget: d.totalBudget ?? 0,
      Actual: d.actualSpend,
      status: d.budgetStatus,
    }));

  return (
    <div
      className="fixed inset-y-0 right-0 z-30 flex w-[28rem] flex-col border-l border-gray-200 bg-white shadow-xl"
      data-testid="budget-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <DollarSign size={18} className="text-green-600" />
          <h2 className="text-lg font-semibold text-gray-800">Budget Planning</h2>
          {alertCount > 0 && (
            <span
              className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
              data-testid="budget-alert-count"
            >
              <AlertTriangle size={10} />
              {alertCount} alert{alertCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close budget panel"
        >
          <X size={20} />
        </button>
      </div>

      {/* Tab strip */}
      <div className="flex items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1 text-xs">
        {(
          [
            { key: 'envelopes', label: 'Envelopes' },
            { key: 'comparison', label: 'vs Actual' },
            { key: 'projection', label: 'Projection' },
          ] as { key: Section; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveSection(t.key)}
            className={cn(
              'rounded-md px-3 py-1 font-medium transition-colors',
              activeSection === t.key
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:bg-white',
            )}
            data-testid={`budget-tab-${t.key}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeSection === 'envelopes' && (
          <div data-testid="budget-envelopes-section">
            <Collapsible
              title="Org-wide Overview"
              icon={<DollarSign size={14} />}
              defaultOpen
              testId="budget-overview"
              rightSlot={
                <span className="text-xs text-gray-500">
                  {summary.departments.length} departments
                </span>
              }
            >
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md bg-gray-50 px-3 py-2" data-testid="overview-total-budget">
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">
                    Total Budget
                  </div>
                  <div className="text-sm font-semibold text-gray-900">
                    {currencyFormatter.format(summary.totals.totalBudget)}
                  </div>
                </div>
                <div className="rounded-md bg-gray-50 px-3 py-2" data-testid="overview-total-spend">
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">
                    Actual Spend
                  </div>
                  <div className="text-sm font-semibold text-gray-900">
                    {currencyFormatter.format(summary.totals.actualSpend)}
                  </div>
                </div>
                <div className="rounded-md bg-gray-50 px-3 py-2" data-testid="overview-remaining">
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">
                    Remaining
                  </div>
                  <div
                    className={cn(
                      'text-sm font-semibold',
                      summary.totals.remainingBudget < 0
                        ? 'text-red-600'
                        : 'text-gray-900',
                    )}
                  >
                    {currencyFormatter.format(summary.totals.remainingBudget)}
                  </div>
                </div>
                <div className="rounded-md bg-gray-50 px-3 py-2" data-testid="overview-headcount">
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">
                    Headcount
                  </div>
                  <div className="text-sm font-semibold text-gray-900">
                    {summary.totals.actualHeadcount}
                    {summary.totals.headcountCap > 0 && (
                      <span className="text-gray-500">
                        {' '}
                        / {summary.totals.headcountCap}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {summary.totals.utilizationPct !== null && (
                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-gray-500">
                    <span>Org utilization</span>
                    <span
                      className={cn('font-semibold', {
                        'text-red-600':
                          summary.totals.utilizationPct >= 100,
                        'text-amber-600':
                          summary.totals.utilizationPct >= 80 &&
                          summary.totals.utilizationPct < 100,
                        'text-emerald-600':
                          summary.totals.utilizationPct < 80,
                      })}
                      data-testid="overview-utilization"
                    >
                      {summary.totals.utilizationPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        summary.totals.utilizationPct >= 100
                          ? 'bg-red-500'
                          : summary.totals.utilizationPct >= 80
                            ? 'bg-amber-500'
                            : 'bg-emerald-500',
                      )}
                      style={{
                        width: `${Math.min(100, Math.max(summary.totals.utilizationPct, 1))}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </Collapsible>

            <Collapsible
              title="Department Envelopes"
              icon={<Users size={14} />}
              defaultOpen
              testId="budget-envelopes-list"
              rightSlot={
                canEdit &&
                !showAddForm && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAddForm(true);
                      setEditingId(null);
                    }}
                    className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-blue-700"
                    data-testid="add-envelope-button"
                  >
                    <Plus size={12} />
                    Add
                  </button>
                )
              }
            >
              {showAddForm && canEdit && (
                <div className="mb-3">
                  <EnvelopeForm
                    existingDepartments={existingDepartments}
                    onSubmit={handleCreate}
                    onCancel={() => setShowAddForm(false)}
                    submitLabel="Create envelope"
                    testIdPrefix="new-envelope"
                  />
                </div>
              )}

              {summary.departments.length === 0 && (
                <p className="text-xs text-gray-500">
                  No departments yet. Add employees or create a budget envelope.
                </p>
              )}

              <ul className="space-y-2" data-testid="department-list">
                {summary.departments.map((dept) => {
                  const envelope = envelopes.find(
                    (e) => e._id === dept.envelopeId,
                  );
                  const isEditing = editingId === dept.envelopeId;

                  return (
                    <li
                      key={dept.department}
                      className={cn(
                        'rounded-md border p-3 transition-colors',
                        dept.budgetStatus === 'exceeded'
                          ? 'border-red-200 bg-red-50'
                          : dept.budgetStatus === 'warning'
                            ? 'border-amber-200 bg-amber-50'
                            : 'border-gray-200 bg-white',
                      )}
                      data-testid={`department-row-${dept.department}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex-1 truncate text-sm font-semibold text-gray-800">
                          {dept.department}
                        </span>
                        {statusBadge(dept.budgetStatus)}
                        {canEdit && envelope && !isEditing && (
                          <>
                            <button
                              onClick={() => {
                                setEditingId(envelope._id);
                                setShowAddForm(false);
                              }}
                              className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                              title="Edit envelope"
                              data-testid={`edit-envelope-${dept.department}`}
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={() => handleDelete(envelope)}
                              className="rounded-md p-1 text-gray-500 hover:bg-red-100 hover:text-red-700"
                              title="Delete envelope"
                              data-testid={`delete-envelope-${dept.department}`}
                            >
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}
                      </div>

                      {isEditing && envelope ? (
                        <div className="mt-2">
                          <EnvelopeForm
                            initial={{
                              department: envelope.department,
                              totalBudget: String(envelope.totalBudget),
                              headcountCap: String(envelope.headcountCap),
                            }}
                            existingDepartments={existingDepartments}
                            onSubmit={(d) => handleUpdate(envelope, d)}
                            onCancel={() => setEditingId(null)}
                            submitLabel="Save"
                            testIdPrefix={`edit-${dept.department}`}
                          />
                        </div>
                      ) : (
                        <>
                          {/* Spend row */}
                          <div className="mt-2 flex items-baseline justify-between text-xs">
                            <span className="text-gray-500">Spend</span>
                            <span className="text-gray-800">
                              {currencyFormatter.format(dept.actualSpend)}
                              {dept.totalBudget !== null && (
                                <span className="text-gray-500">
                                  {' '}
                                  / {currencyFormatter.format(dept.totalBudget)}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all',
                                statusBarColor(dept.budgetStatus),
                              )}
                              style={{
                                width:
                                  dept.utilizationPct === null
                                    ? '0%'
                                    : `${Math.min(100, Math.max(dept.utilizationPct, 2))}%`,
                              }}
                              data-testid={`budget-bar-${dept.department}`}
                            />
                          </div>

                          {/* Headcount row */}
                          <div className="mt-2 flex items-baseline justify-between text-xs">
                            <span className="text-gray-500">Headcount</span>
                            <span className="text-gray-800">
                              {dept.actualHeadcount}
                              {dept.headcountCap !== null && (
                                <span className="text-gray-500">
                                  {' '}
                                  / {dept.headcountCap}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all',
                                statusBarColor(dept.headcountStatus),
                              )}
                              style={{
                                width:
                                  dept.headcountUtilizationPct === null
                                    ? '0%'
                                    : `${Math.min(100, Math.max(dept.headcountUtilizationPct, 2))}%`,
                              }}
                              data-testid={`hc-bar-${dept.department}`}
                            />
                          </div>

                          {/* Details row */}
                          <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                            <div>
                              <div className="text-gray-500">Used %</div>
                              <div
                                className={cn(
                                  'font-semibold',
                                  statusTextColor(dept.budgetStatus),
                                )}
                                data-testid={`used-pct-${dept.department}`}
                              >
                                {dept.utilizationPct === null
                                  ? '—'
                                  : `${dept.utilizationPct.toFixed(1)}%`}
                              </div>
                            </div>
                            <div>
                              <div className="text-gray-500">Remaining $</div>
                              <div
                                className={cn(
                                  'font-semibold',
                                  dept.remainingBudget !== null &&
                                    dept.remainingBudget < 0
                                    ? 'text-red-600'
                                    : 'text-gray-800',
                                )}
                                data-testid={`remaining-${dept.department}`}
                              >
                                {dept.remainingBudget === null
                                  ? '—'
                                  : currencyFormatter.format(dept.remainingBudget)}
                              </div>
                            </div>
                            <div>
                              <div className="text-gray-500">HC left</div>
                              <div
                                className={cn(
                                  'font-semibold',
                                  dept.remainingHeadcount !== null &&
                                    dept.remainingHeadcount < 0
                                    ? 'text-red-600'
                                    : 'text-gray-800',
                                )}
                                data-testid={`hc-remaining-${dept.department}`}
                              >
                                {dept.remainingHeadcount === null
                                  ? '—'
                                  : dept.remainingHeadcount}
                              </div>
                            </div>
                          </div>

                          {!envelope && canEdit && (
                            <button
                              onClick={() => {
                                setShowAddForm(true);
                                setEditingId(null);
                              }}
                              className="mt-2 text-[11px] font-medium text-blue-600 hover:text-blue-700"
                              data-testid={`set-budget-${dept.department}`}
                            >
                              + Set budget envelope
                            </button>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Collapsible>

            {!canEdit && (
              <div
                className="m-4 rounded-md bg-gray-50 p-3 text-xs text-gray-500"
                data-testid="viewer-notice"
              >
                You have view-only access. Contact an owner or admin to set
                department budgets.
              </div>
            )}
          </div>
        )}

        {activeSection === 'comparison' && (
          <div className="p-4" data-testid="budget-comparison-section">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">
              Budget vs. Actual
            </h3>
            {chartData.length === 0 ? (
              <p className="text-xs text-gray-500">
                Create a budget envelope to compare against actuals.
              </p>
            ) : (
              <div
                className="rounded-md border border-gray-200 bg-white p-2"
                data-testid="budget-comparison-chart"
              >
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="department"
                      stroke="#6b7280"
                      fontSize={10}
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis
                      stroke="#6b7280"
                      fontSize={10}
                      tickFormatter={(v: number) => compactCurrency.format(v)}
                    />
                    <Tooltip
                      formatter={(value) => [
                        currencyFormatter.format(Number(value ?? 0)),
                        '',
                      ]}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar
                      dataKey="Budget"
                      fill="#3b82f6"
                      radius={[3, 3, 0, 0]}
                      isAnimationActive={false}
                    />
                    <Bar
                      dataKey="Actual"
                      fill="#10b981"
                      radius={[3, 3, 0, 0]}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <ul className="mt-3 space-y-2 text-xs" data-testid="comparison-list">
              {summary.departments
                .filter((d) => d.totalBudget !== null)
                .map((d) => (
                  <li
                    key={d.department}
                    className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2"
                    data-testid={`comparison-row-${d.department}`}
                  >
                    <span className="font-medium text-gray-700">{d.department}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-gray-500">
                        {currencyFormatter.format(d.actualSpend)} /{' '}
                        {currencyFormatter.format(d.totalBudget ?? 0)}
                      </span>
                      {statusBadge(d.budgetStatus)}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {activeSection === 'projection' && (
          <div className="p-4" data-testid="budget-projection-section">
            <h3 className="mb-1 text-sm font-semibold text-gray-700">
              12-Month Cost Projection
            </h3>
            <p className="mb-2 text-xs text-gray-500">
              Committed run-rate plus planned hires (Planned / Open Req /
              Backfill) layered in by start date.
            </p>
            {projection.every((p) => p.projected === 0) ? (
              <p className="text-xs text-gray-500" data-testid="projection-empty">
                No active or planned employees to project.
              </p>
            ) : (
              <div
                className="rounded-md border border-gray-200 bg-white p-2"
                data-testid="projection-chart"
              >
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart
                    data={projection}
                    margin={{ top: 8, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" stroke="#6b7280" fontSize={10} />
                    <YAxis
                      stroke="#6b7280"
                      fontSize={10}
                      tickFormatter={(v: number) => compactCurrency.format(v)}
                    />
                    <Tooltip
                      formatter={(value) => [
                        currencyFormatter.format(Number(value ?? 0)),
                        '',
                      ]}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      type="monotone"
                      dataKey="committed"
                      stroke="#10b981"
                      strokeWidth={2}
                      name="Committed"
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="projected"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      name="Projected"
                      dot={{ r: 3 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md bg-gray-50 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-gray-500">
                  Current run-rate
                </div>
                <div
                  className="text-sm font-semibold text-gray-900"
                  data-testid="projection-current"
                >
                  {currencyFormatter.format(projection[0]?.projected ?? 0)}
                </div>
              </div>
              <div className="rounded-md bg-gray-50 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-gray-500 flex items-center gap-1">
                  <TrendingUp size={10} />
                  Year-end projected
                </div>
                <div
                  className="text-sm font-semibold text-gray-900"
                  data-testid="projection-year-end"
                >
                  {currencyFormatter.format(
                    projection[projection.length - 1]?.projected ?? 0,
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Grand total */}
      <div className="border-t border-gray-200 px-5 py-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-gray-700">Actual comp (all)</span>
          <span className="flex items-center gap-3">
            <span className="text-gray-500">
              {summary.totals.actualHeadcount} HC
            </span>
            <span
              className="font-bold text-gray-900"
              data-testid="budget-grand-total"
            >
              {currencyFormatter.format(summary.totals.actualSpend)}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
