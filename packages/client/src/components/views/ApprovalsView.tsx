import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Clock,
  ShieldCheck,
  Ban,
  RefreshCw,
  Settings,
  ChevronRight,
  RotateCcw,
  History,
} from 'lucide-react';
import { useOrgStore } from '@/stores/orgStore';
import { useApprovalStore } from '@/stores/approvalStore';
import { useAuthStore } from '@/stores/authStore';
import { useInvitationStore } from '@/stores/invitationStore';
import { useBudgetStore } from '@/stores/budgetStore';
import { cn } from '@/utils/cn';
import type {
  HeadcountRequest,
  HeadcountRequestStatus,
  ApprovalChain,
  ApprovalAuditAction,
  ApprovalAuditEntry,
  BudgetEnvelope,
  Employee,
  OrgMember,
  HeadcountRequestEmployeeData,
} from '@/types';
import ApprovalChainsPanel from '@/components/panels/ApprovalChainsPanel';
import BudgetImpactCard from '@/components/panels/BudgetImpactCard';
import {
  classifyStatus,
  computeBudgetSummary,
} from '@/utils/budgetMetrics';
import type { BudgetStatus } from '@/types';

type StatusFilter = HeadcountRequestStatus | 'all';

const STATUS_LABELS: Record<HeadcountRequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  changes_requested: 'Changes Requested',
};

const STATUS_COLORS: Record<HeadcountRequestStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-green-100 text-green-800 border-green-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  changes_requested: 'bg-blue-100 text-blue-800 border-blue-200',
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function formatCost(salary?: number, equity?: number): string {
  const total = (salary ?? 0) + (equity ?? 0);
  return currencyFormatter.format(total);
}

function resolveActorName(
  userId: string,
  members: OrgMember[],
  currentUserId?: string,
): string {
  if (currentUserId && userId === currentUserId) return 'You';
  const member = members.find((m) => m._id === userId);
  if (member) return member.name || member.email;
  // Fall back to a shortened id rather than the full ObjectId string.
  return `User ${userId.slice(-6)}`;
}

interface ActionDialogProps {
  action: 'approve' | 'reject' | 'request_changes';
  requestName: string;
  onSubmit: (comment: string) => Promise<void>;
  onCancel: () => void;
}

function ActionDialog({
  action,
  requestName,
  onSubmit,
  onCancel,
}: ActionDialogProps) {
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const title = {
    approve: 'Approve Request',
    reject: 'Reject Request',
    request_changes: 'Request Changes',
  }[action];
  const buttonColor = {
    approve: 'bg-green-600 hover:bg-green-700',
    reject: 'bg-red-600 hover:bg-red-700',
    request_changes: 'bg-blue-600 hover:bg-blue-700',
  }[action];
  const commentRequired = action !== 'approve';

  const handle = async () => {
    if (commentRequired && !comment.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(comment.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="mb-1 text-lg font-semibold text-gray-900">{title}</h3>
        <p className="mb-4 text-sm text-gray-600">
          Request for <span className="font-medium">{requestName}</span>
        </p>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          {action === 'approve' ? 'Comment (optional)' : 'Reason (required)'}
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder={
            action === 'approve'
              ? 'Looks good to me...'
              : 'Please explain your decision'
          }
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handle}
            disabled={submitting || (commentRequired && !comment.trim())}
            className={cn(
              'rounded-md px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50',
              buttonColor,
            )}
          >
            {submitting ? 'Working...' : title}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ResubmitDialogProps {
  request: HeadcountRequest;
  onSubmit: (data: HeadcountRequestEmployeeData) => Promise<void>;
  onCancel: () => void;
}

/**
 * Inline edit-and-resubmit form shown to the submitter when their request
 * is in `changes_requested` status. On submit, the chain restarts from
 * step 0 on the server.
 */
function ResubmitDialog({
  request,
  onSubmit,
  onCancel,
}: ResubmitDialogProps) {
  const [form, setForm] = useState({
    salary:
      request.employeeData.salary !== undefined
        ? String(request.employeeData.salary)
        : '',
    equity:
      request.employeeData.equity !== undefined
        ? String(request.employeeData.equity)
        : '',
    title: request.employeeData.title,
    level: request.employeeData.level,
    department: request.employeeData.department,
    justification: request.employeeData.justification ?? '',
  });
  const [submitting, setSubmitting] = useState(false);

  const handle = async () => {
    setSubmitting(true);
    try {
      const payload: HeadcountRequestEmployeeData = {
        ...request.employeeData,
        title: form.title.trim(),
        level: form.level.trim(),
        department: form.department.trim(),
        ...(form.salary ? { salary: Number(form.salary) } : {}),
        ...(form.equity ? { equity: Number(form.equity) } : {}),
        ...(form.justification.trim()
          ? { justification: form.justification.trim() }
          : {}),
      };
      await onSubmit(payload);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
        data-testid="resubmit-dialog"
      >
        <h3 className="mb-1 text-lg font-semibold text-gray-900">
          Edit & Resubmit
        </h3>
        <p className="mb-4 text-sm text-gray-600">
          Update the request and resubmit. Approval will restart from step 1.
        </p>
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-700">
              Title
            </span>
            <input
              value={form.title}
              onChange={(e) =>
                setForm((f) => ({ ...f, title: e.target.value }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-700">
                Level
              </span>
              <input
                value={form.level}
                onChange={(e) =>
                  setForm((f) => ({ ...f, level: e.target.value }))
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-700">
                Department
              </span>
              <input
                value={form.department}
                onChange={(e) =>
                  setForm((f) => ({ ...f, department: e.target.value }))
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-700">
                Salary
              </span>
              <input
                type="number"
                min={0}
                value={form.salary}
                onChange={(e) =>
                  setForm((f) => ({ ...f, salary: e.target.value }))
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                data-testid="resubmit-salary"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-700">
                Equity
              </span>
              <input
                type="number"
                min={0}
                value={form.equity}
                onChange={(e) =>
                  setForm((f) => ({ ...f, equity: e.target.value }))
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-700">
              Updated justification
            </span>
            <textarea
              value={form.justification}
              onChange={(e) =>
                setForm((f) => ({ ...f, justification: e.target.value }))
              }
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handle}
            disabled={submitting}
            className="flex items-center gap-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="resubmit-confirm-btn"
          >
            <RotateCcw size={14} />
            {submitting ? 'Resubmitting...' : 'Resubmit'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface RequestDetailProps {
  request: HeadcountRequest;
  chain: ApprovalChain | undefined;
  employees: Employee[];
  envelopes: BudgetEnvelope[];
  members: OrgMember[];
  currentUserId?: string;
  /** True if the current user is an approver for the current step. */
  actionable: boolean;
  onClose: () => void;
  onResubmit?: () => void;
  onAction?: (kind: 'approve' | 'reject' | 'request_changes') => void;
}

function formatChangeValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') {
    return new Intl.NumberFormat('en-US').format(value);
  }
  return String(value);
}

function RequestDetail({
  request,
  chain,
  employees,
  envelopes,
  members,
  currentUserId,
  actionable,
  onClose,
  onResubmit,
  onAction,
}: RequestDetailProps) {
  // Resolve the employee targeted by a comp-change request for delta display.
  const targetEmployee =
    request.requestType === 'comp_change' && request.targetEmployeeId
      ? employees.find((e) => e._id === request.targetEmployeeId) ?? null
      : null;

  const currentTotal =
    (targetEmployee?.salary ?? 0) + (targetEmployee?.equity ?? 0);
  const newTotal =
    (request.employeeData.salary ?? 0) + (request.employeeData.equity ?? 0);
  const deltaTotal = newTotal - currentTotal;

  // Additional cost for budget impact:
  //  - new_hire: full projected comp
  //  - comp_change: delta vs. current
  const additionalCost = targetEmployee ? deltaTotal : newTotal;
  const additionalHeadcount =
    request.requestType === 'comp_change' ? 0 : 1;

  const isSubmitter = !!currentUserId && request.requestedBy === currentUserId;
  const canResubmit =
    isSubmitter && request.status === 'changes_requested' && !!onResubmit;

  // Track which audit entries are resubmissions, used to badge them.
  const audit: ApprovalAuditEntry[] = request.audit ?? [];

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-[520px] max-w-full flex-col border-l border-gray-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Request Details
        </h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm text-gray-800">
        {/* Request type tag */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
              request.requestType === 'comp_change'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-700',
            )}
            data-testid="request-type-badge"
          >
            {request.requestType === 'comp_change'
              ? 'Comp Change'
              : 'New Hire'}
          </span>
        </div>

        <div>
          <div className="text-xs font-medium uppercase text-gray-500">
            Role / Department
          </div>
          <div className="text-base font-medium">
            {request.employeeData.name} — {request.employeeData.title}
          </div>
          <div className="text-gray-600">
            {request.employeeData.department} · {request.employeeData.level} ·{' '}
            {request.employeeData.location}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-gray-500">Employment Type</div>
            <div>{request.employeeData.employmentType}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Projected Cost</div>
            <div>
              {formatCost(
                request.employeeData.salary,
                request.employeeData.equity,
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Salary</div>
            <div>
              {request.employeeData.salary !== undefined
                ? currencyFormatter.format(request.employeeData.salary)
                : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Equity</div>
            <div>
              {request.employeeData.equity !== undefined
                ? currencyFormatter.format(request.employeeData.equity)
                : '—'}
            </div>
          </div>
        </div>

        {/* Comp change delta */}
        {targetEmployee && (
          <div
            className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900"
            data-testid="comp-change-delta-detail"
          >
            <div className="mb-2 font-medium">
              Compensation Change: {targetEmployee.name}
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-[10px] uppercase text-blue-700">
                  Current
                </div>
                <div className="font-semibold">
                  {currencyFormatter.format(currentTotal)}
                </div>
                <div className="text-[11px] text-blue-700">
                  {targetEmployee.title} · {targetEmployee.level}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-blue-700">
                  Proposed
                </div>
                <div className="font-semibold">
                  {currencyFormatter.format(newTotal)}
                </div>
                <div className="text-[11px] text-blue-700">
                  {request.employeeData.title} · {request.employeeData.level}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-blue-700">
                  Delta
                </div>
                <div
                  className={cn(
                    'font-bold',
                    deltaTotal > 0
                      ? 'text-green-700'
                      : deltaTotal < 0
                        ? 'text-red-700'
                        : 'text-blue-900',
                  )}
                  data-testid="comp-change-delta-value"
                >
                  {deltaTotal >= 0 ? '+' : '-'}
                  {currencyFormatter.format(Math.abs(deltaTotal))}
                </div>
              </div>
            </div>
          </div>
        )}

        {request.employeeData.justification && (
          <div>
            <div className="text-xs text-gray-500">Justification</div>
            <div className="whitespace-pre-line rounded bg-gray-50 px-3 py-2 text-gray-700">
              {request.employeeData.justification}
            </div>
          </div>
        )}

        {/* Budget impact */}
        <BudgetImpactCard
          department={request.employeeData.department}
          employees={employees}
          envelopes={envelopes}
          additionalCost={additionalCost}
          additionalHeadcount={additionalHeadcount}
          excludeEmployeeId={
            request.requestType === 'comp_change'
              ? (request.targetEmployeeId ?? null)
              : null
          }
          variant="detailed"
          title="Department Budget Impact"
        />

        <div>
          <div className="mb-2 text-xs font-medium uppercase text-gray-500">
            Approval Progress
          </div>
          <div className="space-y-2">
            {chain?.steps.map((step, idx) => {
              const completed =
                request.status === 'approved' ||
                idx < request.currentStep ||
                (request.status === 'rejected' && idx < request.currentStep);
              const current =
                request.status === 'pending' && idx === request.currentStep;
              return (
                <div
                  key={idx}
                  className={cn(
                    'flex items-center gap-2 rounded border px-3 py-2',
                    completed && 'border-green-200 bg-green-50',
                    current && 'border-amber-200 bg-amber-50',
                    !completed && !current && 'border-gray-200 bg-white',
                  )}
                >
                  {completed ? (
                    <CheckCircle2 size={16} className="text-green-600" />
                  ) : current ? (
                    <Clock size={16} className="text-amber-600" />
                  ) : (
                    <ChevronRight size={16} className="text-gray-400" />
                  )}
                  <span className="text-sm font-medium">{step.role}</span>
                  {current && (
                    <span className="ml-auto text-xs text-amber-700">
                      Awaiting approval
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {canResubmit && (
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <RotateCcw size={14} /> Changes requested — your action
            </div>
            <p className="mb-2 text-xs text-blue-800">
              An approver has asked for changes. Update the request and
              resubmit to restart the chain from step 1.
            </p>
            <button
              type="button"
              onClick={onResubmit}
              className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              data-testid="open-resubmit-btn"
            >
              <RotateCcw size={12} /> Edit &amp; Resubmit
            </button>
          </div>
        )}

        <div>
          <div className="mb-2 text-xs font-medium uppercase text-gray-500">
            Audit Trail
          </div>
          <ol
            className="space-y-2 border-l border-gray-200 pl-4"
            data-testid="audit-trail"
          >
            {audit.map((entry, idx) => {
              const label: Record<ApprovalAuditAction, string> = {
                submit: 'Submitted',
                approve: 'Approved',
                reject: 'Rejected',
                request_changes: 'Requested Changes',
                resubmit: 'Resubmitted',
                auto_apply: 'Auto-applied',
              };
              const actorName = resolveActorName(
                entry.performedBy,
                members,
                currentUserId,
              );
              const isResubmit = entry.action === 'resubmit';
              return (
                <li
                  key={idx}
                  className="text-xs text-gray-700"
                  data-testid={`audit-entry-${idx}`}
                >
                  <div className="font-medium">
                    {label[entry.action]}
                    {entry.stepRole ? ` · ${entry.stepRole}` : ''}
                    {isResubmit && (
                      <span
                        className="ml-2 inline-flex items-center gap-0.5 rounded bg-blue-100 px-1 py-0.5 text-[10px] font-medium text-blue-700"
                        data-testid={`audit-resubmit-badge-${idx}`}
                      >
                        <History size={10} /> chain restarted
                      </span>
                    )}
                  </div>
                  <div
                    className="text-gray-600"
                    data-testid={`audit-actor-${idx}`}
                  >
                    by{' '}
                    <span className="font-medium text-gray-800">
                      {actorName}
                    </span>
                    <span className="mx-1 text-gray-400">·</span>
                    <span className="text-gray-500">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                  </div>
                  {entry.comment && (
                    <div className="mt-1 rounded bg-gray-50 px-2 py-1 italic text-gray-700">
                      “{entry.comment}”
                    </div>
                  )}
                  {isResubmit && entry.changes && entry.changes.length > 0 && (
                    <ul
                      className="mt-1 space-y-0.5 rounded border border-blue-100 bg-blue-50 px-2 py-1"
                      data-testid={`audit-edit-history-${idx}`}
                    >
                      {entry.changes.map((chg, cIdx) => (
                        <li
                          key={`${chg.field}-${cIdx}`}
                          className="flex flex-wrap gap-1 text-[11px] text-blue-900"
                          data-testid={`audit-edit-history-${idx}-${chg.field}`}
                        >
                          <span className="font-semibold capitalize">
                            {chg.field}:
                          </span>
                          <span className="text-blue-700 line-through">
                            {formatChangeValue(chg.from)}
                          </span>
                          <span className="text-blue-500">→</span>
                          <span className="font-medium text-blue-900">
                            {formatChangeValue(chg.to)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {/* Action footer for approvers + self-approval guard (VAL-APPROVAL-013) */}
      {request.status === 'pending' && (
        <div
          className="border-t border-gray-200 bg-gray-50 px-5 py-3"
          data-testid="request-detail-actions"
        >
          {currentUserId && request.requestedBy === currentUserId ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-gray-600">
                You submitted this request.
              </span>
              <button
                type="button"
                disabled
                className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-400"
                title="Cannot approve your own request"
                aria-label="Cannot approve your own request"
                data-testid="detail-self-approve-disabled"
              >
                <Ban size={12} /> Approve
              </button>
            </div>
          ) : actionable ? (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onAction?.('request_changes')}
                className="flex items-center gap-1 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                data-testid="detail-request-changes-btn"
              >
                <MessageSquare size={12} /> Request Changes
              </button>
              <button
                type="button"
                onClick={() => onAction?.('reject')}
                className="flex items-center gap-1 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                data-testid="detail-reject-btn"
              >
                <XCircle size={12} /> Reject
              </button>
              <button
                type="button"
                onClick={() => onAction?.('approve')}
                className="flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                data-testid="detail-approve-btn"
              >
                <CheckCircle2 size={12} /> Approve
              </button>
            </div>
          ) : (
            <div className="text-xs text-gray-500">
              Not awaiting your action on this request.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ApprovalsView() {
  const { currentOrg, currentScenario, employees, fetchEmployees } =
    useOrgStore();
  const currentUser = useAuthStore((s) => s.user);
  const currentRole = useInvitationStore((s) => s.currentRole);
  const members = useInvitationStore((s) => s.members);
  const fetchMembers = useInvitationStore((s) => s.fetchMembers);
  const isAdmin = currentRole === 'owner' || currentRole === 'admin';

  const envelopes = useBudgetStore((s) => s.envelopes);
  const fetchEnvelopes = useBudgetStore((s) => s.fetchEnvelopes);

  const {
    chains,
    requests,
    pendingApprovals,
    fetchChains,
    fetchOrgRequests,
    fetchPendingApprovals,
    approveRequest,
    rejectRequest,
    requestChanges,
    resubmitRequest,
    bulkApprove,
    bulkReject,
    loading,
  } = useApprovalStore();

  const [filter, setFilter] = useState<StatusFilter>('pending');
  /**
   * When viewing the "pending" tab, defaults to showing only items the
   * current user can act on (VAL-APPROVAL-005). Toggle to see all pending.
   */
  const [pendingScope, setPendingScope] = useState<'mine' | 'all'>('mine');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<
    | null
    | {
        kind: 'approve' | 'reject' | 'request_changes';
        requestId: string;
        requestName: string;
      }
  >(null);
  const [bulkDialog, setBulkDialog] = useState<null | 'approve' | 'reject'>(
    null,
  );
  const [showChainsPanel, setShowChainsPanel] = useState(false);
  const [resubmitId, setResubmitId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentOrg) return;
    fetchChains(currentOrg._id);
    fetchOrgRequests(currentOrg._id);
    fetchPendingApprovals(currentOrg._id);
    fetchMembers(currentOrg._id).catch(() => {});
  }, [
    currentOrg,
    fetchChains,
    fetchOrgRequests,
    fetchPendingApprovals,
    fetchMembers,
  ]);

  useEffect(() => {
    if (currentScenario) {
      fetchEnvelopes(currentScenario._id).catch(() => {});
    }
  }, [currentScenario, fetchEnvelopes]);

  const pendingApprovalIds = useMemo(
    () => new Set(pendingApprovals.map((p) => p._id)),
    [pendingApprovals],
  );

  const canActOnRequest = (r: HeadcountRequest): boolean => {
    if (r.status !== 'pending') return false;
    return pendingApprovalIds.has(r._id);
  };

  // Precompute department-level budget summary so per-row warnings don't
  // recompute on every render (VAL-BUDGET-004).
  const budgetSummaryByDept = useMemo(() => {
    const summary = computeBudgetSummary(envelopes, employees);
    const map = new Map<
      string,
      { totalBudget: number | null; actualSpend: number; headcountCap: number | null; actualHeadcount: number }
    >();
    for (const d of summary.departments) {
      map.set(d.department.trim(), {
        totalBudget: d.totalBudget,
        actualSpend: d.actualSpend,
        headcountCap: d.headcountCap,
        actualHeadcount: d.actualHeadcount,
      });
    }
    return map;
  }, [envelopes, employees]);

  /**
   * Classify a request's projected impact on its department's budget and
   * headcount cap. Returns the worst of (projected spend, projected HC)
   * statuses. 'exceeded' wins over 'warning'; null means no envelope.
   */
  const getRequestBudgetStatus = (
    r: HeadcountRequest,
  ): BudgetStatus | null => {
    const deptKey = (r.employeeData.department ?? '').trim() || 'Unassigned';
    const dept = budgetSummaryByDept.get(deptKey);
    if (!dept) return null;
    const proposedComp =
      (r.employeeData.salary ?? 0) + (r.employeeData.equity ?? 0);
    let addSpend: number;
    let addHc: number;
    if (r.requestType === 'comp_change') {
      const target = r.targetEmployeeId
        ? employees.find((e) => e._id === r.targetEmployeeId)
        : null;
      const currentComp = target
        ? (target.salary ?? 0) + (target.equity ?? 0)
        : 0;
      addSpend = proposedComp - currentComp;
      addHc = 0;
    } else {
      addSpend = proposedComp;
      addHc = 1;
    }
    const spendStatus = classifyStatus(
      dept.actualSpend + addSpend,
      dept.totalBudget,
    );
    const hcStatus = classifyStatus(
      dept.actualHeadcount + addHc,
      dept.headcountCap,
    );
    const rank = (s: BudgetStatus | null): number =>
      s === 'exceeded' ? 3 : s === 'warning' ? 2 : s === 'under' ? 1 : 0;
    return rank(spendStatus) >= rank(hcStatus) ? spendStatus : hcStatus;
  };

  const filteredRequests = useMemo(() => {
    let list =
      filter === 'all' ? requests : requests.filter((r) => r.status === filter);
    // VAL-APPROVAL-005: on the "Pending" tab, default to the user's own
    // queue — items they can act on as an approver for the current step,
    // plus their own submissions (which they can see but not approve).
    // Items pending at steps they are not responsible for (and did not
    // submit) are hidden. Toggle to "All pending" to see everything.
    if (filter === 'pending' && pendingScope === 'mine') {
      list = list.filter(
        (r) =>
          pendingApprovalIds.has(r._id) ||
          r.requestedBy === currentUser?._id,
      );
    }
    return list;
  }, [requests, filter, pendingScope, pendingApprovalIds, currentUser]);

  const chainsById = useMemo(() => {
    const m = new Map<string, ApprovalChain>();
    for (const c of chains) m.set(c._id, c);
    return m;
  }, [chains]);

  const counts = useMemo(() => {
    const result: Record<HeadcountRequestStatus | 'all', number> = {
      all: requests.length,
      pending: 0,
      approved: 0,
      rejected: 0,
      changes_requested: 0,
    };
    for (const r of requests) {
      result[r.status] = (result[r.status] ?? 0) + 1;
    }
    return result;
  }, [requests]);

  const actionablePendingCount = pendingApprovals.length;

  const selectedIds = Array.from(selected);
  const selectedActionable = selectedIds.filter((id) => {
    const r = requests.find((x) => x._id === id);
    if (!r || r.status !== 'pending') return false;
    return pendingApprovalIds.has(id);
  });

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const actionableInView = filteredRequests
      .filter((r) => canActOnRequest(r))
      .map((r) => r._id);
    setSelected((prev) => {
      const anyUnselected = actionableInView.some((id) => !prev.has(id));
      if (anyUnselected) return new Set([...prev, ...actionableInView]);
      const next = new Set(prev);
      for (const id of actionableInView) next.delete(id);
      return next;
    });
  };

  const handleAction = async (
    action: 'approve' | 'reject' | 'request_changes',
    id: string,
    comment: string,
  ) => {
    if (action === 'approve') await approveRequest(id, comment);
    else if (action === 'reject') await rejectRequest(id, comment);
    else await requestChanges(id, comment);
    if (action === 'approve' && currentScenario) {
      fetchEmployees(currentScenario._id);
    }
    setActionDialog(null);
  };

  const handleBulk = async (
    action: 'approve' | 'reject',
    comment: string,
  ) => {
    if (selectedActionable.length === 0) {
      setBulkDialog(null);
      return;
    }
    if (action === 'approve') {
      await bulkApprove(selectedActionable, comment);
    } else {
      await bulkReject(selectedActionable, comment);
    }
    if (currentScenario) fetchEmployees(currentScenario._id);
    setSelected(new Set());
    setBulkDialog(null);
  };

  const handleResubmit = async (data: HeadcountRequestEmployeeData) => {
    if (!resubmitId) return;
    await resubmitRequest(resubmitId, data);
    setResubmitId(null);
    if (currentOrg) {
      await fetchOrgRequests(currentOrg._id);
      await fetchPendingApprovals(currentOrg._id);
    }
  };

  const detailRequest = detailId
    ? requests.find((r) => r._id === detailId)
    : null;

  const resubmitRequestObj = resubmitId
    ? requests.find((r) => r._id === resubmitId)
    : null;

  if (!currentOrg) {
    return (
      <div className="p-10 text-center text-gray-500">
        Select an organization to view approvals.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Approvals</h1>
          <p className="text-sm text-gray-500">
            Review and act on headcount requests across the organization
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchOrgRequests(currentOrg._id);
              fetchPendingApprovals(currentOrg._id);
            }}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            data-testid="refresh-approvals"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowChainsPanel(true)}
              className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              data-testid="configure-chains-btn"
            >
              <Settings size={14} />
              Configure Chains
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-6 py-2">
        {(
          ['pending', 'approved', 'rejected', 'changes_requested', 'all'] as StatusFilter[]
        ).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium',
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
            )}
            data-testid={`filter-${f}`}
          >
            {f === 'all' ? 'All' : STATUS_LABELS[f as HeadcountRequestStatus]}
            <span className="ml-1 text-[10px] opacity-80">
              (
              {f === 'pending' && pendingScope === 'mine'
                ? actionablePendingCount
                : counts[f]}
              )
            </span>
          </button>
        ))}
        {filter === 'pending' && (
          <div
            className="ml-auto flex items-center gap-2 text-xs text-gray-600"
            data-testid="pending-scope-toggle"
          >
            <span>Show:</span>
            <button
              type="button"
              onClick={() => setPendingScope('mine')}
              className={cn(
                'rounded-full px-2 py-0.5',
                pendingScope === 'mine'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
              )}
              data-testid="pending-scope-mine"
            >
              My queue ({actionablePendingCount})
            </button>
            <button
              type="button"
              onClick={() => setPendingScope('all')}
              className={cn(
                'rounded-full px-2 py-0.5',
                pendingScope === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
              )}
              data-testid="pending-scope-all"
            >
              All pending ({counts.pending})
            </button>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedActionable.length > 0 && (
        <div className="flex items-center justify-between border-b border-blue-200 bg-blue-50 px-6 py-2">
          <span className="text-sm text-blue-900">
            {selectedActionable.length} request
            {selectedActionable.length === 1 ? '' : 's'} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setBulkDialog('approve')}
              className="flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
              data-testid="bulk-approve-btn"
            >
              <CheckCircle2 size={14} />
              Approve Selected
            </button>
            <button
              onClick={() => setBulkDialog('reject')}
              className="flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
              data-testid="bulk-reject-btn"
            >
              <XCircle size={14} />
              Reject Selected
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-auto bg-gray-50 p-6">
        {loading && requests.length === 0 ? (
          <div className="text-center text-gray-500">Loading...</div>
        ) : filteredRequests.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">
            No{' '}
            {filter === 'all'
              ? ''
              : STATUS_LABELS[
                  filter as HeadcountRequestStatus
                ].toLowerCase()}{' '}
            headcount requests.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select all actionable"
                      onChange={toggleSelectAll}
                      checked={
                        filteredRequests.length > 0 &&
                        filteredRequests.filter((r) => canActOnRequest(r))
                          .length > 0 &&
                        filteredRequests
                          .filter((r) => canActOnRequest(r))
                          .every((r) => selected.has(r._id))
                      }
                    />
                  </th>
                  <th className="px-3 py-2">Candidate</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Department</th>
                  <th className="px-3 py-2">Level</th>
                  <th className="px-3 py-2">Cost</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Step</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((r) => {
                  const chain = chainsById.get(r.chainId);
                  const totalSteps = chain?.steps.length ?? 0;
                  const actionable = canActOnRequest(r);
                  const isOwnRequest =
                    currentUser?._id === r.requestedBy;
                  const awaitingChanges =
                    r.status === 'changes_requested' && isOwnRequest;
                  return (
                    <tr
                      key={r._id}
                      className="border-t border-gray-100 hover:bg-gray-50"
                      data-testid={`request-row-${r._id}`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.employeeData.name}`}
                          disabled={!actionable}
                          checked={selected.has(r._id)}
                          onChange={() => toggleSelected(r._id)}
                        />
                      </td>
                      <td
                        className="relative cursor-pointer px-3 py-2 font-medium text-gray-900"
                        onClick={() => setDetailId(r._id)}
                      >
                        {actionable && (
                          <span
                            className="absolute left-1 top-1/2 -translate-y-1/2 animate-pulse"
                            aria-hidden="true"
                            title="Awaiting your action"
                            data-testid={`pending-dot-${r._id}`}
                          >
                            <span className="inline-block h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_0_2px_rgba(245,158,11,0.25)]" />
                          </span>
                        )}
                        <span
                          className={cn(actionable && 'pl-3')}
                        >
                          {r.employeeData.name}
                        </span>
                        <div className="text-xs text-gray-500">
                          {r.employeeData.title}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            'inline-block rounded px-2 py-0.5 text-[10px] font-medium',
                            r.requestType === 'comp_change'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-700',
                          )}
                          data-testid={`request-type-${r._id}`}
                        >
                          {r.requestType === 'comp_change'
                            ? 'Comp Change'
                            : 'New Hire'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {r.employeeData.department}
                      </td>
                      <td className="px-3 py-2">{r.employeeData.level}</td>
                      <td className="px-3 py-2 text-gray-700">
                        <div className="flex items-center gap-1.5">
                          <span>
                            {formatCost(
                              r.employeeData.salary,
                              r.employeeData.equity,
                            )}
                          </span>
                          {(() => {
                            const s = getRequestBudgetStatus(r);
                            if (s === 'exceeded') {
                              return (
                                <span
                                  className="inline-flex items-center gap-0.5 rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700"
                                  title="This request would put the department over budget or headcount cap."
                                  data-testid={`budget-exceeded-${r._id}`}
                                >
                                  <AlertTriangle size={10} /> Over
                                </span>
                              );
                            }
                            if (s === 'warning') {
                              return (
                                <span
                                  className="inline-flex items-center gap-0.5 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                                  title="This request would push utilization into the warning band (80-99%)."
                                  data-testid={`budget-warning-${r._id}`}
                                >
                                  <AlertTriangle size={10} /> At risk
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            'inline-block rounded border px-2 py-0.5 text-xs font-medium',
                            STATUS_COLORS[r.status],
                          )}
                          data-testid={`status-${r._id}`}
                        >
                          {STATUS_LABELS[r.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {totalSteps > 0
                          ? `${Math.min(r.currentStep + 1, totalSteps)} / ${totalSteps}`
                          : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          {actionable ? (
                            <>
                              <button
                                onClick={() =>
                                  setActionDialog({
                                    kind: 'approve',
                                    requestId: r._id,
                                    requestName: r.employeeData.name,
                                  })
                                }
                                className="rounded border border-green-300 px-2 py-1 text-xs text-green-700 hover:bg-green-50"
                                data-testid={`approve-${r._id}`}
                              >
                                <CheckCircle2 size={12} className="inline" />
                              </button>
                              <button
                                onClick={() =>
                                  setActionDialog({
                                    kind: 'reject',
                                    requestId: r._id,
                                    requestName: r.employeeData.name,
                                  })
                                }
                                className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                                data-testid={`reject-${r._id}`}
                              >
                                <XCircle size={12} className="inline" />
                              </button>
                              <button
                                onClick={() =>
                                  setActionDialog({
                                    kind: 'request_changes',
                                    requestId: r._id,
                                    requestName: r.employeeData.name,
                                  })
                                }
                                className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                                data-testid={`changes-${r._id}`}
                              >
                                <MessageSquare size={12} className="inline" />
                              </button>
                            </>
                          ) : awaitingChanges ? (
                            <button
                              onClick={() => setResubmitId(r._id)}
                              className="flex items-center gap-1 rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                              data-testid={`resubmit-${r._id}`}
                            >
                              <RotateCcw size={12} /> Edit &amp; Resubmit
                            </button>
                          ) : isOwnRequest && r.status === 'pending' ? (
                            <button
                              disabled
                              className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-400"
                              title="You cannot approve your own request"
                              data-testid={`self-approve-blocked-${r._id}`}
                            >
                              <Ban size={12} className="inline" /> Own Request
                            </button>
                          ) : (
                            <button
                              onClick={() => setDetailId(r._id)}
                              className="text-xs text-gray-500 hover:underline"
                            >
                              View
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailRequest && (
        <RequestDetail
          request={detailRequest}
          chain={chainsById.get(detailRequest.chainId)}
          employees={employees}
          envelopes={envelopes}
          members={members}
          currentUserId={currentUser?._id}
          actionable={canActOnRequest(detailRequest)}
          onClose={() => setDetailId(null)}
          onResubmit={
            detailRequest.status === 'changes_requested' &&
            currentUser?._id === detailRequest.requestedBy
              ? () => setResubmitId(detailRequest._id)
              : undefined
          }
          onAction={(kind) =>
            setActionDialog({
              kind,
              requestId: detailRequest._id,
              requestName: detailRequest.employeeData.name,
            })
          }
        />
      )}

      {actionDialog && (
        <ActionDialog
          action={actionDialog.kind}
          requestName={actionDialog.requestName}
          onSubmit={(comment) =>
            handleAction(actionDialog.kind, actionDialog.requestId, comment)
          }
          onCancel={() => setActionDialog(null)}
        />
      )}

      {bulkDialog && (
        <ActionDialog
          action={bulkDialog}
          requestName={`${selectedActionable.length} selected`}
          onSubmit={(comment) => handleBulk(bulkDialog, comment)}
          onCancel={() => setBulkDialog(null)}
        />
      )}

      {resubmitRequestObj && (
        <ResubmitDialog
          request={resubmitRequestObj}
          onSubmit={handleResubmit}
          onCancel={() => setResubmitId(null)}
        />
      )}

      {showChainsPanel && (
        <ApprovalChainsPanel
          open
          onClose={() => setShowChainsPanel(false)}
        />
      )}

      {/* Convenience empty-state visual */}
      {!loading && requests.length === 0 && isAdmin && chains.length === 0 && (
        <div className="absolute bottom-6 right-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 shadow-lg">
          <div className="flex items-center gap-2 font-medium">
            <ShieldCheck size={16} />
            Configure your first approval chain to get started.
          </div>
          <button
            onClick={() => setShowChainsPanel(true)}
            className="mt-2 rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
          >
            Open Settings
          </button>
        </div>
      )}
    </div>
  );
}
