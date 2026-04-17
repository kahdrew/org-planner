import { useState, useEffect } from 'react';
import { Users, X, Mail, Shield, ShieldCheck, Eye, UserMinus, Crown, ChevronDown, Pencil, Trash2 } from 'lucide-react';
import { useOrgStore } from '@/stores/orgStore';
import { useInvitationStore } from '@/stores/invitationStore';
import { cn } from '@/utils/cn';
import type { OrgRole } from '@/types';

interface MembersPanelProps {
  open: boolean;
  onClose: () => void;
}

const roleIcons: Record<OrgRole, typeof Shield> = {
  owner: Crown,
  admin: ShieldCheck,
  viewer: Eye,
};

const roleColors: Record<OrgRole, string> = {
  owner: 'bg-amber-100 text-amber-800',
  admin: 'bg-blue-100 text-blue-800',
  viewer: 'bg-gray-100 text-gray-700',
};

const roleLabels: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  viewer: 'Viewer',
};

export default function MembersPanel({ open, onClose }: MembersPanelProps) {
  const currentOrg = useOrgStore((s) => s.currentOrg);
  const renameOrg = useOrgStore((s) => s.renameOrg);
  const deleteOrg = useOrgStore((s) => s.deleteOrg);
  const fetchOrgs = useOrgStore((s) => s.fetchOrgs);
  const {
    members,
    orgInvitations,
    currentRole,
    fetchMembers,
    fetchOrgInvitations,
    sendInvite,
    removeMember,
    changeMemberRole,
  } = useInvitationStore();

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('viewer');
  const [inviteError, setInviteError] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState<string | null>(null);

  // Rename org state
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');

  // Delete org state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (open && currentOrg) {
      fetchMembers(currentOrg._id);
      fetchOrgInvitations(currentOrg._id);
    }
  }, [open, currentOrg, fetchMembers, fetchOrgInvitations]);

  if (!open) return null;

  const isOwner = currentRole === 'owner';

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !inviteEmail.trim()) return;

    setInviteError('');
    setInviteLoading(true);
    try {
      await sendInvite(currentOrg._id, inviteEmail.trim(), inviteRole);
      setInviteEmail('');
      setInviteRole('viewer');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setInviteError(axiosErr.response?.data?.error || 'Failed to send invitation');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!currentOrg) return;
    if (!confirm('Are you sure you want to remove this member?')) return;
    try {
      await removeMember(currentOrg._id, userId);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      alert(axiosErr.response?.data?.error || 'Failed to remove member');
    }
  };

  const handleChangeRole = async (userId: string, newRole: OrgRole) => {
    if (!currentOrg) return;
    try {
      await changeMemberRole(currentOrg._id, userId, newRole);
      setRoleDropdownOpen(null);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      alert(axiosErr.response?.data?.error || 'Failed to change role');
    }
  };

  const handleStartRename = () => {
    if (!currentOrg) return;
    setRenameValue(currentOrg.name);
    setRenameError('');
    setIsRenaming(true);
  };

  const handleRename = async () => {
    if (!currentOrg || !renameValue.trim()) {
      setRenameError('Name cannot be empty');
      return;
    }
    try {
      await renameOrg(currentOrg._id, renameValue.trim());
      setIsRenaming(false);
      setRenameError('');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setRenameError(axiosErr.response?.data?.error || 'Failed to rename organization');
    }
  };

  const handleDeleteOrg = async () => {
    if (!currentOrg) return;
    if (deleteConfirmName !== currentOrg.name) return;

    setDeleteLoading(true);
    try {
      await deleteOrg(currentOrg._id);
      await fetchOrgs();
      onClose();
      setShowDeleteConfirm(false);
      setDeleteConfirmName('');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      alert(axiosErr.response?.data?.error || 'Failed to delete organization');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-30 flex w-96 flex-col border-l border-gray-200 bg-white shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-800">Members</h2>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Invite form (owner only) */}
        {isOwner && (
          <div className="border-b border-gray-200 p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Invite Member</h3>
            <form onSubmit={handleInvite} className="space-y-3">
              <div>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Email address"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as OrgRole)}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </select>
                <button
                  type="submit"
                  disabled={inviteLoading || !inviteEmail.trim()}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {inviteLoading ? 'Sending...' : 'Send Invite'}
                </button>
              </div>
              {inviteError && (
                <p className="text-xs text-red-600">{inviteError}</p>
              )}
            </form>
          </div>
        )}

        {/* Members list */}
        <div className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">
            Members ({members.length})
          </h3>
          <div className="space-y-2">
            {members.map((member) => {
              const RoleIcon = roleIcons[member.role];
              return (
                <div
                  key={member._id}
                  className="flex items-center justify-between rounded-md border border-gray-100 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-gray-900">
                        {member.name}
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                          roleColors[member.role]
                        )}
                      >
                        <RoleIcon size={12} />
                        {roleLabels[member.role]}
                      </span>
                    </div>
                    <p className="truncate text-xs text-gray-500">{member.email}</p>
                  </div>

                  {isOwner && member.role !== 'owner' && (
                    <div className="flex items-center gap-1">
                      {/* Role change dropdown */}
                      <div className="relative">
                        <button
                          onClick={() =>
                            setRoleDropdownOpen(
                              roleDropdownOpen === member._id ? null : member._id
                            )
                          }
                          className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                          title="Change role"
                        >
                          <ChevronDown size={16} />
                        </button>
                        {roleDropdownOpen === member._id && (
                          <div className="absolute right-0 top-full z-10 mt-1 w-32 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                            {(['admin', 'viewer'] as const).map((role) => (
                              <button
                                key={role}
                                onClick={() => handleChangeRole(member._id, role)}
                                className={cn(
                                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-gray-50',
                                  member.role === role
                                    ? 'font-medium text-blue-600'
                                    : 'text-gray-700'
                                )}
                              >
                                {roleLabels[role]}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleRemoveMember(member._id)}
                        className="rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        title="Remove member"
                      >
                        <UserMinus size={16} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Pending invitations */}
        {orgInvitations.length > 0 && (
          <div className="border-t border-gray-200 p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">
              Pending Invitations ({orgInvitations.length})
            </h3>
            <div className="space-y-2">
              {orgInvitations.map((inv) => (
                <div
                  key={inv._id}
                  className="flex items-center justify-between rounded-md border border-dashed border-gray-200 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Mail size={14} className="text-gray-400" />
                      <span className="truncate text-sm text-gray-700">
                        {inv.email}
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                          roleColors[inv.role]
                        )}
                      >
                        {roleLabels[inv.role]}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-yellow-600">Pending</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Organization Management (owner only) */}
        {isOwner && currentOrg && (
          <div className="border-t border-gray-200 p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">
              Organization Settings
            </h3>
            <div className="space-y-3">
              {/* Rename Organization */}
              {isRenaming ? (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-gray-600">
                    Organization Name
                  </label>
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename();
                      if (e.key === 'Escape') setIsRenaming(false);
                    }}
                  />
                  {renameError && (
                    <p className="text-xs text-red-600">{renameError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={handleRename}
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setIsRenaming(false)}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleStartRename}
                  className="flex w-full items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <Pencil size={14} />
                  Rename Organization
                </button>
              )}

              {/* Delete Organization */}
              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex w-full items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
                >
                  <Trash2 size={14} />
                  Delete Organization
                </button>
              ) : (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 space-y-2">
                  <p className="text-xs font-semibold text-red-800">
                    This will permanently delete the organization, all scenarios, and all employees.
                  </p>
                  <p className="text-xs text-red-700">
                    Type <span className="font-bold">{currentOrg.name}</span> to confirm:
                  </p>
                  <input
                    type="text"
                    value={deleteConfirmName}
                    onChange={(e) => setDeleteConfirmName(e.target.value)}
                    className="w-full rounded-md border border-red-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                    placeholder="Type organization name"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeleteOrg}
                      disabled={deleteLoading || deleteConfirmName !== currentOrg.name}
                      className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deleteLoading ? 'Deleting...' : 'Delete Forever'}
                    </button>
                    <button
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        setDeleteConfirmName('');
                      }}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
