import { useEffect } from 'react';
import { Mail, Check, X } from 'lucide-react';
import { useInvitationStore } from '@/stores/invitationStore';
import { useOrgStore } from '@/stores/orgStore';

export default function PendingInvitations() {
  const { myInvitations, myInvitationsLoading, fetchMyInvitations, acceptInvitation, declineInvitation } =
    useInvitationStore();
  const fetchOrgs = useOrgStore((s) => s.fetchOrgs);

  useEffect(() => {
    fetchMyInvitations();
  }, [fetchMyInvitations]);

  if (myInvitationsLoading || myInvitations.length === 0) return null;

  const handleAccept = async (invitationId: string) => {
    await acceptInvitation(invitationId);
    // Refresh orgs so the new org appears in sidebar
    fetchOrgs();
  };

  const handleDecline = async (invitationId: string) => {
    await declineInvitation(invitationId);
  };

  return (
    <div className="border-b border-slate-700 p-4">
      <h3 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
        <Mail size={14} />
        Invitations ({myInvitations.length})
      </h3>
      <div className="space-y-2">
        {myInvitations.map((inv) => {
          const orgName =
            typeof inv.orgId === 'object' && inv.orgId !== null
              ? inv.orgId.name
              : 'Organization';
          return (
            <div
              key={inv._id}
              className="rounded-md bg-slate-700/50 p-2.5"
            >
              <div className="mb-1.5 text-sm text-white">{orgName}</div>
              <div className="mb-2 text-xs text-slate-400">
                Role: <span className="capitalize text-slate-300">{inv.role}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAccept(inv._id)}
                  className="flex flex-1 items-center justify-center gap-1 rounded bg-green-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-green-700"
                >
                  <Check size={12} />
                  Accept
                </button>
                <button
                  onClick={() => handleDecline(inv._id)}
                  className="flex flex-1 items-center justify-center gap-1 rounded bg-slate-600 px-2 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-500"
                >
                  <X size={12} />
                  Decline
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
