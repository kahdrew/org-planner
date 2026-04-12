import { useState } from 'react';
import { ChevronDown, ChevronRight, DollarSign, X } from 'lucide-react';
import { useOrgStore } from '@/stores/orgStore';
import { cn } from '@/utils/cn';
import type { Employee } from '@/types';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

interface BudgetPanelProps {
  open: boolean;
  onClose: () => void;
}

interface BucketRow {
  label: string;
  headcount: number;
  totalComp: number;
  pct: number;
}

function groupBy(
  employees: Employee[],
  keyFn: (e: Employee) => string,
  grandTotal: number,
): BucketRow[] {
  const map = new Map<string, { headcount: number; totalComp: number }>();

  for (const e of employees) {
    const key = keyFn(e) || 'Unknown';
    const entry = map.get(key) ?? { headcount: 0, totalComp: 0 };
    entry.headcount += 1;
    entry.totalComp += (e.salary ?? 0) + (e.equity ?? 0);
    map.set(key, entry);
  }

  return Array.from(map.entries())
    .map(([label, data]) => ({
      label,
      headcount: data.headcount,
      totalComp: data.totalComp,
      pct: grandTotal > 0 ? (data.totalComp / grandTotal) * 100 : 0,
    }))
    .sort((a, b) => b.totalComp - a.totalComp);
}

function BreakdownSection({
  title,
  rows,
}: {
  title: string;
  rows: BucketRow[];
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {title}
        <span className="ml-auto text-xs font-normal text-gray-400">
          {rows.length} {rows.length === 1 ? 'group' : 'groups'}
        </span>
      </button>

      {expanded && (
        <div className="space-y-1 px-4 pb-3">
          {rows.map((row) => (
            <div key={row.label} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="truncate text-gray-700">{row.label}</span>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>{row.headcount} HC</span>
                  <span className="font-medium text-gray-700">
                    {currencyFormatter.format(row.totalComp)}
                  </span>
                </div>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${Math.max(row.pct, 1)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BudgetPanel({ open, onClose }: BudgetPanelProps) {
  const employees = useOrgStore((s) => s.employees);

  if (!open) return null;

  const grandTotal = employees.reduce(
    (sum, e) => sum + (e.salary ?? 0) + (e.equity ?? 0),
    0,
  );

  const byDepartment = groupBy(employees, (e) => e.department, grandTotal);
  const byLevel = groupBy(employees, (e) => e.level, grandTotal);
  const byLocation = groupBy(employees, (e) => e.location, grandTotal);
  const byStatus = groupBy(employees, (e) => e.status, grandTotal);

  return (
    <div className="fixed inset-y-0 right-0 z-30 flex w-96 flex-col border-l border-gray-200 bg-white shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <DollarSign size={18} className="text-green-600" />
          <h2 className="text-lg font-semibold text-gray-800">Budget Breakdown</h2>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <X size={20} />
        </button>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto">
        <BreakdownSection title="By Department" rows={byDepartment} />
        <BreakdownSection title="By Level" rows={byLevel} />
        <BreakdownSection title="By Location" rows={byLocation} />
        <BreakdownSection title="By Status" rows={byStatus} />
      </div>

      {/* Grand total */}
      <div className="border-t border-gray-200 px-5 py-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">Grand Total</span>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-500">{employees.length} HC</span>
            <span className="font-bold text-gray-900">
              {currencyFormatter.format(grandTotal)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
