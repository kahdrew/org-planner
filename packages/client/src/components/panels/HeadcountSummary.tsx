import { Users, UserCheck, UserPlus, Briefcase, DollarSign, Clock } from 'lucide-react';
import { useOrgStore } from '@/stores/orgStore';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

interface MetricPillProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}

function MetricPill({ icon, label, value }: MetricPillProps) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-slate-700/50 px-3 py-1.5">
      <span className="text-slate-400">{icon}</span>
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm font-semibold text-white">{value}</span>
    </div>
  );
}

export default function HeadcountSummary() {
  const employees = useOrgStore((s) => s.employees);

  const total = employees.length;
  const fteCount = employees.filter((e) => e.employmentType === 'FTE').length;
  const contractorCount = employees.filter((e) => e.employmentType === 'Contractor').length;
  const openReqs = employees.filter((e) => e.status === 'Open Req').length;
  const planned = employees.filter((e) => e.status === 'Planned').length;
  const totalSalary = employees.reduce((sum, e) => sum + (e.salary ?? 0), 0);

  return (
    <div className="flex h-12 items-center gap-3 border-t border-slate-700 bg-slate-800 px-6">
      <MetricPill
        icon={<Users size={14} />}
        label="Total"
        value={total}
      />
      <MetricPill
        icon={<UserCheck size={14} />}
        label="FTE"
        value={fteCount}
      />
      <MetricPill
        icon={<Clock size={14} />}
        label="Contractors"
        value={contractorCount}
      />
      <MetricPill
        icon={<Briefcase size={14} />}
        label="Open Reqs"
        value={openReqs}
      />
      <MetricPill
        icon={<UserPlus size={14} />}
        label="Planned"
        value={planned}
      />
      <MetricPill
        icon={<DollarSign size={14} />}
        label="Salary Cost"
        value={currencyFormatter.format(totalSalary)}
      />
    </div>
  );
}
