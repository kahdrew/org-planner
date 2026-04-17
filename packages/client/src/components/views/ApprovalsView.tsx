import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  MessageSquare,
  Clock,
  ShieldCheck,
  Ban,
  RefreshCw,
  Settings,
  ChevronRight,
} from 'lucide-react';
import { useOrgStore } from '@/stores/orgStore';
import { useApprovalStore } from '@/stores/approvalStore';
import { useAuthStore } from '@/stores/authStore';
import { useInvitationStore } from '@/stores/invitationStore';
import { cn } from '@/utils/cn';
import type {
  HeadcountRequest,
  HeadcountRequestStatus,
  ApprovalChain,
  ApprovalAuditAction,
} from '@/types';
import ApprovalChainsPanel from '@/components/panels/ApprovalChainsPanel';

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

function RequestDetail({
  request,
  chain,
  onClose,
}: {
  request: HeadcountRequest;
  chain: ApprovalChain | undefined;
  onClose: () => void;
}) {
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
        <div>
          <div className="text-xs font-medium uppercase text-gray-500">
            Role / Department
          </div>
          <div className="text-base font-medium">
            {request.employeeData.name} — {request.employeeData.title}
          </div>
          <div className="text-gray-600">
            {request.employeeData.department} ·{' '}
            {request.employeeData.level} · {request.employeeData.location}
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
        {request.employeeData.justification && (
          <div>
            <div className="text-xs text-gray-500">Justification</div>
            <div className="whitespace-pre-line rounded bg-gray-50 px-3 py-2 text-gray-700">
              {request.employeeData.justification}
            </div>
          </div>
        )}

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

        <div>
          <div className="mb-2 text-xs font-medium uppercase text-gray-500">
            Audit Trail
          </div>
          <ol
            className="space-y-2 border-l border-gray-200 pl-4"
            data-testid="audit-trail"
          >
            {request.audit.map((entry, idx) => {
              const label: Record<ApprovalAuditAction, string> = {
                submit: 'Submitted',
                approve: 'Approved',
                reject: 'Rejected',
                request_changes: 'Requested Changes',
                resubmit: 'Resubmitted',
                auto_apply: 'Auto-applied',
              };
              return (
                <li key={idx} className="text-xs text-gray-700">
                  <div className="font-medium">
                    {label[entry.action]}
                    {entry.stepRole ? ` · ${entry.stepRole}` : ''}
                  </div>
                  <div className="text-gray-500">
                    {new Date(entry.timestamp).toLocaleString()}
                  </div>
                  {entry.comment && (
                    <div className="mt-1 rounded bg-gray-50 px-2 py-1 italic text-gray-700">
                      “{entry.comment}”
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

export default function ApprovalsView() {
  const { currentOrg, currentScenario, fetchEmployees } = useOrgStore();
  const currentUser = useAuthStore((s) => s.user);
  const currentRole = useInvitationStore((s) => s.currentRole);
  const isAdmin = currentRole === 'owner' || currentRole === 'admin';

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
    bulkApprove,
    bulkReject,
    loading,
  } = useApprovalStore();

  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<
    | null
    | {
        kind: 'approve' | 'reject' | 'request_changes';
        requestId: string;
        requestName: string;
      }
  > (null);
  const [bulkDialog, setBulkDialog] = useState<
    null | 'approve' | 'reject'
  >(null);
  const [showChainsPanel, setShowChainsPanel] = useState(false);

  useEffect(() => {
    if (!currentOrg) return;
    fetchChains(currentOrg._id);
    fetchOrgRequests(currentOrg._id);
    fetchPendingApprovals(currentOrg._id);
  }, [currentOrg, fetchChains, fetchOrgRequests, fetchPendingApprovals]);

  const filteredRequests = useMemo(() => {
    if (filter === 'all') return requests;
    return requests.filter((r) => r.status === filter);
  }, [requests, filter]);

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

  const selectedIds = Array.from(selected);
  const selectedActionable = selectedIds.filter((id) => {
    const r = requests.find((x) => x._id === id);
    if (!r || r.status !== 'pending') return false;
    return pendingApprovals.some((p) => p._id === id);
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
      .filter(
        (r) =>
          r.status === 'pending' &&
          pendingApprovals.some((p) => p._id === r._id),
      )
      .map((r) => r._id);
    setSelected((prev) => {
      const anyUnselected = actionableInView.some((id) => !prev.has(id));
      if (anyUnselected) return new Set([...prev, ...actionableInView]);
      const next = new Set(prev);
      for (const id of actionableInView) next.delete(id);
      return next;
    });
  };

  const canActOnRequest = (r: HeadcountRequest): boolean => {
    if (r.status !== 'pending') return false;
    return pendingApprovals.some((p) => p._id === r._id);
  };

  const handleAction = async (
    action: 'approve' | 'reject' | 'request_changes',
    id: string,
    comment: string,
  ) => {
    if (action === 'approve') await approveRequest(id, comment);
    else if (action === 'reject') await rejectRequest(id, comment);
    else await requestChanges(id, comment);
    // When approved as final step, an employee is created — refresh scenario employees.
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

  const detailRequest = detailId
    ? requests.find((r) => r._id === detailId)
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
          <h1 className="text-xl font-semibold text-gray-900">
            Approvals
          </h1>
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
            <span className="ml-1 text-[10px] opacity-80">({counts[f]})</span>
          </button>
        ))}
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
            No {filter === 'all' ? '' : STATUS_LABELS[filter as HeadcountRequestStatus].toLowerCase()}{' '}
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
                        filteredRequests
                          .filter((r) => canActOnRequest(r))
                          .every((r) => selected.has(r._id))
                      }
                    />
                  </th>
                  <th className="px-3 py-2">Candidate</th>
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
                        className="cursor-pointer px-3 py-2 font-medium text-gray-900"
                        onClick={() => setDetailId(r._id)}
                      >
                        {r.employeeData.name}
                        <div className="text-xs text-gray-500">
                          {r.employeeData.title}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {r.employeeData.department}
                      </td>
                      <td className="px-3 py-2">{r.employeeData.level}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {formatCost(r.employeeData.salary, r.employeeData.equity)}
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
                          ) : isOwnRequest && r.status === 'pending' ? (
                            <button
                              disabled
                              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-400"
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
          onClose={() => setDetailId(null)}
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
