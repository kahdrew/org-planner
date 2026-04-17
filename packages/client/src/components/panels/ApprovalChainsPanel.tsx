import { useEffect, useMemo, useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Save,
  ShieldCheck,
  AlertCircle,
  Star,
} from 'lucide-react';
import { useOrgStore } from '@/stores/orgStore';
import { useInvitationStore } from '@/stores/invitationStore';
import { useApprovalStore } from '@/stores/approvalStore';
import type { ApprovalStep, OrgMember } from '@/types';

interface ApprovalChainsPanelProps {
  open: boolean;
  onClose: () => void;
}

interface DraftChain {
  _id?: string;
  name: string;
  description: string;
  steps: ApprovalStep[];
  minLevel: string;
  minCost: string;
  priority: number;
  isDefault: boolean;
}

const emptyDraft = (): DraftChain => ({
  name: '',
  description: '',
  steps: [{ role: '', approverIds: [] }],
  minLevel: '',
  minCost: '',
  priority: 0,
  isDefault: false,
});

function membersMap(members: OrgMember[]): Map<string, OrgMember> {
  const m = new Map<string, OrgMember>();
  for (const member of members) m.set(member._id, member);
  return m;
}

export default function ApprovalChainsPanel({
  open,
  onClose,
}: ApprovalChainsPanelProps) {
  const currentOrg = useOrgStore((s) => s.currentOrg);
  const members = useInvitationStore((s) => s.members);
  const fetchMembers = useInvitationStore((s) => s.fetchMembers);
  const currentRole = useInvitationStore((s) => s.currentRole);
  const isAdmin = currentRole === 'owner' || currentRole === 'admin';

  const {
    chains,
    fetchChains,
    createChain,
    updateChain,
    deleteChain,
    error,
  } = useApprovalStore();

  const [draft, setDraft] = useState<DraftChain>(emptyDraft());
  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (open && currentOrg) {
      fetchChains(currentOrg._id);
      fetchMembers(currentOrg._id);
    }
  }, [open, currentOrg, fetchChains, fetchMembers]);

  const memMap = useMemo(() => membersMap(members), [members]);

  if (!open) return null;

  const startNew = () => {
    setDraft(emptyDraft());
    setMode('edit');
  };

  const startEdit = (id: string) => {
    const chain = chains.find((c) => c._id === id);
    if (!chain) return;
    setDraft({
      _id: chain._id,
      name: chain.name,
      description: chain.description ?? '',
      steps: chain.steps.map((s) => ({ ...s, approverIds: [...s.approverIds] })),
      minLevel: chain.conditions?.minLevel ?? '',
      minCost:
        typeof chain.conditions?.minCost === 'number'
          ? String(chain.conditions.minCost)
          : '',
      priority: chain.priority ?? 0,
      isDefault: chain.isDefault ?? false,
    });
    setMode('edit');
  };

  const updateStep = (
    idx: number,
    next: Partial<ApprovalStep>,
  ) => {
    setDraft((d) => {
      const steps = d.steps.map((s, i) =>
        i === idx ? { ...s, ...next } : s,
      );
      return { ...d, steps };
    });
  };

  const addStep = () => {
    setDraft((d) => ({
      ...d,
      steps: [...d.steps, { role: '', approverIds: [] }],
    }));
  };

  const removeStep = (idx: number) => {
    setDraft((d) => ({
      ...d,
      steps: d.steps.filter((_, i) => i !== idx),
    }));
  };

  const toggleApprover = (stepIdx: number, userId: string) => {
    setDraft((d) => {
      const steps = d.steps.map((s, i) => {
        if (i !== stepIdx) return s;
        const has = s.approverIds.includes(userId);
        return {
          ...s,
          approverIds: has
            ? s.approverIds.filter((id) => id !== userId)
            : [...s.approverIds, userId],
        };
      });
      return { ...d, steps };
    });
  };

  const canSave =
    draft.name.trim().length > 0 &&
    draft.steps.length > 0 &&
    draft.steps.every((s) => s.role.trim() && s.approverIds.length > 0);

  const handleSave = async () => {
    if (!currentOrg || !canSave) return;
    setSaving(true);
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
        steps: draft.steps.map((s) => ({
          role: s.role.trim(),
          approverIds: s.approverIds,
        })),
        conditions: {
          ...(draft.minLevel.trim() ? { minLevel: draft.minLevel.trim() } : {}),
          ...(draft.minCost.trim()
            ? { minCost: Number(draft.minCost) }
            : {}),
        },
        priority: Number(draft.priority) || 0,
        isDefault: draft.isDefault,
      };
      if (draft._id) {
        await updateChain(currentOrg._id, draft._id, payload);
      } else {
        await createChain(currentOrg._id, payload);
      }
      setMode('list');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!currentOrg) return;
    setDeletingId(id);
    try {
      await deleteChain(currentOrg._id, id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-[520px] max-w-full flex-col border-l border-gray-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <ShieldCheck size={18} className="text-blue-600" />
          Approval Chains
        </h2>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-5 py-2 text-sm text-red-700">
          <AlertCircle size={14} className="mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {mode === 'list' ? (
          <>
            {chains.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
                No approval chains configured yet. Add one to start routing
                headcount requests.
              </div>
            ) : (
              <div className="space-y-3">
                {chains.map((c) => (
                  <div
                    key={c._id}
                    className="rounded-lg border border-gray-200 p-4"
                    data-testid={`chain-row-${c._id}`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 font-medium text-gray-900">
                          {c.name}
                          {c.isDefault && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                              <Star size={10} /> Default
                            </span>
                          )}
                        </div>
                        {c.description && (
                          <div className="text-xs text-gray-500">
                            {c.description}
                          </div>
                        )}
                        <div className="mt-2 text-xs text-gray-600">
                          {c.steps.length} step
                          {c.steps.length === 1 ? '' : 's'} ·{' '}
                          {c.steps.map((s) => s.role).join(' → ')}
                        </div>
                        {(c.conditions?.minLevel ||
                          c.conditions?.minCost !== undefined) && (
                          <div className="mt-1 text-[11px] text-gray-500">
                            Conditions:{' '}
                            {c.conditions?.minLevel
                              ? `≥ ${c.conditions.minLevel}`
                              : ''}
                            {c.conditions?.minLevel &&
                            c.conditions?.minCost !== undefined
                              ? ' · '
                              : ''}
                            {c.conditions?.minCost !== undefined
                              ? `≥ $${c.conditions.minCost.toLocaleString()}`
                              : ''}
                          </div>
                        )}
                      </div>
                      {isAdmin && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => startEdit(c._id)}
                            className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                            data-testid={`edit-chain-${c._id}`}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(c._id)}
                            disabled={deletingId === c._id}
                            className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                            data-testid={`delete-chain-${c._id}`}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-700">
                Chain Name
              </span>
              <input
                value={draft.name}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, name: e.target.value }))
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="e.g. Standard Chain"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-700">
                Description
              </span>
              <input
                value={draft.description}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, description: e.target.value }))
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Optional"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">
                  Min Level (optional)
                </span>
                <input
                  value={draft.minLevel}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, minLevel: e.target.value }))
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  placeholder="e.g. Director"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">
                  Min Total Cost (optional)
                </span>
                <input
                  type="number"
                  min={0}
                  value={draft.minCost}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, minCost: e.target.value }))
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  placeholder="200000"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">
                  Priority
                </span>
                <input
                  type="number"
                  value={draft.priority}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      priority: Number(e.target.value),
                    }))
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex items-center gap-2 pt-6 text-sm">
                <input
                  type="checkbox"
                  checked={draft.isDefault}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, isDefault: e.target.checked }))
                  }
                />
                Use as default chain
              </label>
            </div>

            <div className="border-t pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">
                  Steps
                </span>
                <button
                  onClick={addStep}
                  className="flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                  data-testid="add-step-btn"
                >
                  <Plus size={12} /> Add Step
                </button>
              </div>
              <div className="space-y-3">
                {draft.steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="rounded-md border border-gray-200 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-700">
                        Step {idx + 1}
                      </span>
                      {draft.steps.length > 1 && (
                        <button
                          onClick={() => removeStep(idx)}
                          className="text-red-600 hover:text-red-800"
                          aria-label="Remove step"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    <input
                      value={step.role}
                      onChange={(e) => updateStep(idx, { role: e.target.value })}
                      placeholder="Role name (e.g. VP)"
                      className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                    />
                    <div className="mt-2">
                      <span className="mb-1 block text-[11px] font-medium text-gray-600">
                        Approvers
                      </span>
                      <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto rounded border border-gray-200 bg-white p-2">
                        {members.length === 0 ? (
                          <span className="text-xs text-gray-400">
                            No org members available.
                          </span>
                        ) : (
                          members.map((m) => {
                            const selected = step.approverIds.includes(m._id);
                            return (
                              <button
                                key={m._id}
                                type="button"
                                onClick={() => toggleApprover(idx, m._id)}
                                className={`rounded-full border px-2 py-0.5 text-[11px] ${
                                  selected
                                    ? 'border-blue-400 bg-blue-100 text-blue-800'
                                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                                }`}
                              >
                                {m.name || m.email}
                              </button>
                            );
                          })
                        )}
                      </div>
                      {step.approverIds.length > 0 && (
                        <div className="mt-1 text-[11px] text-gray-500">
                          Selected:{' '}
                          {step.approverIds
                            .map(
                              (id) =>
                                memMap.get(id)?.name ??
                                memMap.get(id)?.email ??
                                id,
                            )
                            .join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-gray-200 bg-white px-5 py-3">
        {mode === 'list' ? (
          <>
            <span className="text-xs text-gray-500">
              {chains.length} chain{chains.length === 1 ? '' : 's'} configured
            </span>
            {isAdmin && (
              <button
                onClick={startNew}
                className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                data-testid="new-chain-btn"
              >
                <Plus size={14} /> New Chain
              </button>
            )}
          </>
        ) : (
          <>
            <button
              onClick={() => setMode('list')}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="save-chain-btn"
            >
              <Save size={14} /> {saving ? 'Saving...' : 'Save Chain'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
