import { useState, useEffect } from 'react';
import { X, Trash2, Save, Loader2 } from 'lucide-react';
import { useOrgStore } from '@/stores/orgStore';
import { useInvitationStore } from '@/stores/invitationStore';
import { cn } from '@/utils/cn';
import type { Employee } from '@/types';

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

const EMPLOYMENT_TYPES: Employee['employmentType'][] = ['FTE', 'Contractor', 'Intern'];
const STATUS_OPTIONS: Employee['status'][] = ['Active', 'Planned', 'Open Req', 'Backfill'];

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

interface EmployeeDetailPanelProps {
  employee: Employee | null;
  isNew?: boolean;
  onClose: () => void;
}

type FormData = {
  name: string;
  title: string;
  department: string;
  level: string;
  location: string;
  employmentType: Employee['employmentType'];
  status: Employee['status'];
  startDate: string;
  salary: string;
  equity: string;
  costCenter: string;
  hiringManager: string;
  recruiter: string;
  requisitionId: string;
  managerId: string;
};

function buildFormData(employee: Employee | null): FormData {
  return {
    name: employee?.name ?? '',
    title: employee?.title ?? '',
    department: employee?.department ?? '',
    level: employee?.level ?? '',
    location: employee?.location ?? '',
    employmentType: employee?.employmentType ?? 'FTE',
    status: employee?.status ?? 'Active',
    startDate: employee?.startDate ?? '',
    salary: employee?.salary != null ? String(employee.salary) : '',
    equity: employee?.equity != null ? String(employee.equity) : '',
    costCenter: employee?.costCenter ?? '',
    hiringManager: employee?.hiringManager ?? '',
    recruiter: employee?.recruiter ?? '',
    requisitionId: employee?.requisitionId ?? '',
    managerId: employee?.managerId ?? '',
  };
}

export default function EmployeeDetailPanel({ employee, isNew, onClose }: EmployeeDetailPanelProps) {
  const { employees, currentScenario, addEmployee, updateEmployee, removeEmployee } = useOrgStore();
  const currentRole = useInvitationStore((s) => s.currentRole);
  const isViewer = currentRole === 'viewer';
  const [form, setForm] = useState<FormData>(buildFormData(employee));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setForm(buildFormData(employee));
    setConfirmDelete(false);
  }, [employee]);

  const handleChange = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload: Partial<Employee> = {
        name: form.name.trim(),
        title: form.title.trim(),
        department: form.department.trim(),
        level: form.level.trim(),
        location: form.location.trim(),
        employmentType: form.employmentType,
        status: form.status,
        startDate: form.startDate || undefined,
        salary: form.salary ? Number(form.salary) : undefined,
        equity: form.equity ? Number(form.equity) : undefined,
        costCenter: form.costCenter.trim() || undefined,
        hiringManager: form.hiringManager.trim() || undefined,
        recruiter: form.recruiter.trim() || undefined,
        requisitionId: form.requisitionId.trim() || undefined,
        managerId: form.managerId || null,
      };

      if (isNew && currentScenario) {
        await addEmployee(currentScenario._id, payload);
        onClose();
      } else if (employee) {
        await updateEmployee(employee._id, payload);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!employee) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    try {
      await removeEmployee(employee._id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const managers = employees.filter((e) => e._id !== employee?._id);

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-96 flex-col border-l border-gray-200 bg-white shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-gray-800">
          {isNew ? 'New Employee' : 'Employee Details'}
        </h2>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <X size={20} />
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <Field label="Name">
          <input
            type="text"
            value={form.name}
            onChange={(e) => handleChange('name', e.target.value)}
            className="input-field"
            placeholder="Full name"
          />
        </Field>

        <Field label="Title">
          <input
            type="text"
            value={form.title}
            onChange={(e) => handleChange('title', e.target.value)}
            className="input-field"
            placeholder="Job title"
          />
        </Field>

        <Field label="Department">
          <select
            value={form.department}
            onChange={(e) => handleChange('department', e.target.value)}
            className="input-field"
          >
            <option value="">Select department</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </Field>

        <Field label="Level">
          <input
            type="text"
            value={form.level}
            onChange={(e) => handleChange('level', e.target.value)}
            className="input-field"
            placeholder="e.g. IC3, M1, Director"
          />
        </Field>

        <Field label="Location">
          <input
            type="text"
            value={form.location}
            onChange={(e) => handleChange('location', e.target.value)}
            className="input-field"
            placeholder="City or Remote"
          />
        </Field>

        <Field label="Employment Type">
          <select
            value={form.employmentType}
            onChange={(e) => handleChange('employmentType', e.target.value)}
            className="input-field"
          >
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </Field>

        <Field label="Status">
          <select
            value={form.status}
            onChange={(e) => handleChange('status', e.target.value)}
            className="input-field"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>

        <Field label="Start Date">
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => handleChange('startDate', e.target.value)}
            className="input-field"
          />
        </Field>

        <Field label="Salary">
          <input
            type="number"
            value={form.salary}
            onChange={(e) => handleChange('salary', e.target.value)}
            className="input-field"
            placeholder="0"
            min={0}
          />
          {form.salary && (
            <span className="mt-1 text-xs text-gray-500">
              {currencyFormatter.format(Number(form.salary))}
            </span>
          )}
        </Field>

        <Field label="Equity">
          <input
            type="number"
            value={form.equity}
            onChange={(e) => handleChange('equity', e.target.value)}
            className="input-field"
            placeholder="0"
            min={0}
          />
          {form.equity && (
            <span className="mt-1 text-xs text-gray-500">
              {currencyFormatter.format(Number(form.equity))}
            </span>
          )}
        </Field>

        <Field label="Cost Center">
          <input
            type="text"
            value={form.costCenter}
            onChange={(e) => handleChange('costCenter', e.target.value)}
            className="input-field"
            placeholder="Cost center"
          />
        </Field>

        <Field label="Hiring Manager">
          <input
            type="text"
            value={form.hiringManager}
            onChange={(e) => handleChange('hiringManager', e.target.value)}
            className="input-field"
            placeholder="Hiring manager name"
          />
        </Field>

        <Field label="Recruiter">
          <input
            type="text"
            value={form.recruiter}
            onChange={(e) => handleChange('recruiter', e.target.value)}
            className="input-field"
            placeholder="Recruiter name"
          />
        </Field>

        <Field label="Requisition ID">
          <input
            type="text"
            value={form.requisitionId}
            onChange={(e) => handleChange('requisitionId', e.target.value)}
            className="input-field"
            placeholder="REQ-0000"
          />
        </Field>

        <Field label="Manager">
          <select
            value={form.managerId}
            onChange={(e) => handleChange('managerId', e.target.value)}
            className="input-field"
          >
            <option value="">No manager (top-level)</option>
            {managers.map((m) => (
              <option key={m._id} value={m._id}>
                {m.name} — {m.title}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-gray-200 px-5 py-4">
        {isViewer ? (
          <p className="flex-1 text-center text-sm text-gray-400">
            Viewer role — read-only access
          </p>
        ) : (
          <>
            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors',
                saving || !form.name.trim()
                  ? 'cursor-not-allowed bg-blue-300'
                  : 'bg-blue-600 hover:bg-blue-700'
              )}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {isNew ? 'Create Employee' : 'Save Changes'}
            </button>

            {!isNew && employee && (
              <button
                onClick={handleDelete}
                disabled={saving}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  confirmDelete
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'border border-red-300 text-red-600 hover:bg-red-50'
                )}
              >
                <Trash2 size={16} />
                {confirmDelete ? 'Confirm' : 'Delete'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}
