import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useOrgStore } from '@/stores/orgStore';
import { useApprovalStore } from '@/stores/approvalStore';
import { useAuthStore } from '@/stores/authStore';
import { useInvitationStore } from '@/stores/invitationStore';
import { cn } from '@/utils/cn';
import type {
  ApprovalAuditAction,
  ApprovalAuditEntry,
  HeadcountRequest,
  OrgMember,
} from '@/types';

const EVENT_LABEL: Record<ApprovalAuditAction, string> = {
  submit: 'submitted',
  approve: 'approved',
  reject: 'rejected',
  request_changes: 'requested changes on',
  resubmit: 'resubmitted',
  auto_apply: 'auto-applied',
};

interface NotificationEvent {
  id: string;
  requestId: string;
  requestName: string;
  action: ApprovalAuditAction;
  actorName: string;
  timestamp: string;
  isRelevantToMe: boolean;
}

function formatRelativeTime(ts: string): string {
  const then = new Date(ts).getTime();
  if (Number.isNaN(then)) return '';
  const now = Date.now();
  const diff = Math.max(0, Math.floor((now - then) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function resolveActor(
  id: string,
  members: OrgMember[],
  currentUserId?: string,
): string {
  if (currentUserId && id === currentUserId) return 'You';
  const member = members.find((m) => m._id === id);
  if (member) return member.name || member.email;
  return `User ${id.slice(-6)}`;
}

function deriveEvents(
  requests: HeadcountRequest[],
  members: OrgMember[],
  currentUserId: string | undefined,
  limit = 15,
): NotificationEvent[] {
  const events: NotificationEvent[] = [];
  for (const r of requests) {
    const audit: ApprovalAuditEntry[] = r.audit ?? [];
    audit.forEach((entry, idx) => {
      const isRelevantToMe =
        r.requestedBy === currentUserId || entry.performedBy === currentUserId;
      events.push({
        id: `${r._id}-${idx}`,
        requestId: r._id,
        requestName: r.employeeData.name,
        action: entry.action,
        actorName: resolveActor(entry.performedBy, members, currentUserId),
        timestamp: entry.timestamp,
        isRelevantToMe,
      });
    });
  }
  return events
    .sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      return tb - ta;
    })
    .slice(0, limit);
}

/**
 * Notification bell with a dropdown listing recent approval events for the
 * current org (VAL-APPROVAL-010). The badge count shows the number of
 * requests currently awaiting the signed-in user's action.
 */
export default function NotificationBell() {
  const currentOrg = useOrgStore((s) => s.currentOrg);
  const currentUser = useAuthStore((s) => s.user);
  const members = useInvitationStore((s) => s.members);
  const fetchMembers = useInvitationStore((s) => s.fetchMembers);
  const requests = useApprovalStore((s) => s.requests);
  const pendingApprovals = useApprovalStore((s) => s.pendingApprovals);
  const fetchOrgRequests = useApprovalStore((s) => s.fetchOrgRequests);
  const fetchPendingApprovals = useApprovalStore(
    (s) => s.fetchPendingApprovals,
  );

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Keep the bell populated regardless of which view the user is on.
  useEffect(() => {
    if (!currentOrg?._id) return;
    fetchOrgRequests(currentOrg._id).catch(() => {});
    fetchPendingApprovals(currentOrg._id).catch(() => {});
    fetchMembers(currentOrg._id).catch(() => {});
  }, [currentOrg?._id, fetchOrgRequests, fetchPendingApprovals, fetchMembers]);

  useEffect(() => {
    if (!open) return;
    const handleClickAway = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickAway);
    return () => document.removeEventListener('mousedown', handleClickAway);
  }, [open]);

  const events = useMemo(
    () => deriveEvents(requests ?? [], members ?? [], currentUser?._id),
    [requests, members, currentUser?._id],
  );
  const badgeCount = pendingApprovals?.length ?? 0;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'relative rounded-md p-1.5 transition-colors hover:bg-gray-100',
          open ? 'bg-gray-100 text-gray-900' : 'text-gray-500',
        )}
        title={
          badgeCount > 0
            ? `${badgeCount} request${badgeCount === 1 ? '' : 's'} awaiting your action`
            : 'Recent approval events'
        }
        aria-label="Notifications"
        aria-expanded={open}
        data-testid="notification-bell-btn"
      >
        <Bell size={18} />
        {badgeCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white shadow-[0_0_0_2px_white]"
            data-testid="notification-bell-badge"
          >
            {badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg"
          role="dialog"
          aria-label="Notifications"
          data-testid="notification-dropdown"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <span>Notifications</span>
            <span
              className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700"
              data-testid="notification-dropdown-badge"
            >
              {badgeCount} awaiting
            </span>
          </div>
          {events.length === 0 ? (
            <div
              className="px-3 py-6 text-center text-sm text-gray-500"
              data-testid="notification-empty"
            >
              No recent approval events.
            </div>
          ) : (
            <ul
              className="max-h-80 divide-y divide-gray-100 overflow-y-auto text-sm"
              data-testid="notification-list"
            >
              {events.map((evt) => (
                <li
                  key={evt.id}
                  className={cn(
                    'flex flex-col gap-0.5 px-3 py-2',
                    evt.isRelevantToMe ? 'bg-blue-50' : 'hover:bg-gray-50',
                  )}
                  data-testid={`notification-item-${evt.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-xs text-gray-700">
                      <span className="font-semibold text-gray-900">
                        {evt.actorName}
                      </span>{' '}
                      <span className="text-gray-600">
                        {EVENT_LABEL[evt.action]}
                      </span>{' '}
                      <span className="truncate font-medium text-gray-800">
                        {evt.requestName}
                      </span>
                    </div>
                    <span
                      className="shrink-0 text-[10px] text-gray-500"
                      data-testid={`notification-time-${evt.id}`}
                      title={new Date(evt.timestamp).toLocaleString()}
                    >
                      {formatRelativeTime(evt.timestamp)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
