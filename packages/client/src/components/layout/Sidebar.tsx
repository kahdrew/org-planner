import { NavLink } from 'react-router-dom';
import { GitBranch, List, Table, Columns, GitCompare, Plus, Copy, DollarSign, Users, Clock } from 'lucide-react';
import { useOrgStore } from '@/stores/orgStore';
import { useScheduledChangeStore } from '@/stores/scheduledChangeStore';
import { cn } from '@/utils/cn';
import * as scenariosApi from '@/api/scenarios';
import PendingInvitations from '@/components/panels/PendingInvitations';

const navItems = [
  { to: '/', icon: GitBranch, label: 'Org Chart', end: true },
  { to: '/hierarchy', icon: List, label: 'Hierarchy' },
  { to: '/spreadsheet', icon: Table, label: 'Spreadsheet' },
  { to: '/kanban', icon: Columns, label: 'Kanban' },
  { to: '/compare', icon: GitCompare, label: 'Compare' },
];

interface SidebarProps {
  onToggleBudget?: () => void;
  onToggleMembers?: () => void;
  onTogglePendingChanges?: () => void;
}

export default function Sidebar({ onToggleBudget, onToggleMembers, onTogglePendingChanges }: SidebarProps) {
  const {
    orgs, currentOrg, setCurrentOrg, createOrg,
    scenarios, currentScenario, setCurrentScenario,
    fetchScenarios, fetchEmployees,
  } = useOrgStore();

  const pendingCount = useScheduledChangeStore((s) =>
    s.scheduledChanges.filter((c) => c.status === 'pending').length,
  );

  const handleOrgChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const org = orgs.find((o) => o._id === e.target.value);
    if (org) {
      setCurrentOrg(org);
      fetchScenarios(org._id);
    }
  };

  const handleScenarioChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const scenario = scenarios.find((s) => s._id === e.target.value);
    if (scenario) {
      setCurrentScenario(scenario);
      fetchEmployees(scenario._id);
    }
  };

  const handleNewOrg = async () => {
    const name = prompt('Organization name:');
    if (!name) return;
    await createOrg(name);
  };

  const handleNewScenario = async () => {
    if (!currentOrg) return;
    const name = prompt('Scenario name:');
    if (!name) return;
    const scenario = await scenariosApi.createScenario(currentOrg._id, { name });
    await fetchScenarios(currentOrg._id);
    setCurrentScenario(scenario);
  };

  const handleCloneScenario = async () => {
    if (!currentScenario || !currentOrg) return;
    const cloned = await scenariosApi.cloneScenario(currentScenario._id);
    await fetchScenarios(currentOrg._id);
    setCurrentScenario(cloned);
  };

  return (
    <aside className="flex w-64 flex-col bg-[var(--color-sidebar-bg)] text-[var(--color-sidebar-text)]">
      <div className="border-b border-slate-700 p-4">
        <h1 className="mb-4 text-lg font-bold tracking-tight">Org Planner</h1>

        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-400">
          Organization
        </label>
        <div className="mb-3 flex gap-1">
          <select
            value={currentOrg?._id ?? ''}
            onChange={handleOrgChange}
            className="flex-1 rounded bg-slate-700 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {orgs.length === 0 && <option value="">No organizations</option>}
            {orgs.map((org) => (
              <option key={org._id} value={org._id}>{org.name}</option>
            ))}
          </select>
          <button
            onClick={handleNewOrg}
            className="rounded bg-slate-700 px-2 py-1.5 text-sm text-white transition-colors hover:bg-slate-600"
            title="New Organization"
          >
            <Plus size={14} />
          </button>
        </div>

        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-400">
          Scenario
        </label>
        <select
          value={currentScenario?._id ?? ''}
          onChange={handleScenarioChange}
          className="w-full rounded bg-slate-700 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {scenarios.map((s) => (
            <option key={s._id} value={s._id}>{s.name}</option>
          ))}
        </select>
      </div>

      <PendingInvitations />

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-2 border-t border-slate-700 p-4">
        <button
          onClick={handleNewScenario}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus size={16} />
          New Scenario
        </button>
        <button
          onClick={handleCloneScenario}
          disabled={!currentScenario}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-600 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Copy size={16} />
          Clone Scenario
        </button>
        {onToggleBudget && (
          <button
            onClick={onToggleBudget}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-600 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
          >
            <DollarSign size={16} />
            Budget
          </button>
        )}
        {onToggleMembers && (
          <button
            onClick={onToggleMembers}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-600 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
          >
            <Users size={16} />
            Members
          </button>
        )}
        {onTogglePendingChanges && (
          <button
            onClick={onTogglePendingChanges}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-600 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
            data-testid="pending-changes-sidebar-btn"
          >
            <Clock size={16} />
            Scheduled Changes
            {pendingCount > 0 && (
              <span className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
                {pendingCount}
              </span>
            )}
          </button>
        )}
      </div>
    </aside>
  );
}
