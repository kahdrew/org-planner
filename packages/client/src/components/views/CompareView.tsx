import { useState, useEffect, useMemo, useCallback } from 'react';
import { useOrgStore } from '@/stores/orgStore';
import { cn } from '@/utils/cn';
import * as employeesApi from '@/api/employees';
import * as scenariosApi from '@/api/scenarios';
import type { Employee, ScenarioDiff, DiffStatus } from '@/types';

/* ------------------------------------------------------------------ */
/*  Styling helpers                                                   */
/* ------------------------------------------------------------------ */

const DIFF_BG: Record<DiffStatus, string> = {
  added: 'bg-green-50 border-green-300',
  removed: 'bg-red-50 border-red-300',
  moved: 'bg-amber-50 border-amber-300',
  changed: 'bg-blue-50 border-blue-300',
  unchanged: 'bg-white border-gray-200',
};

const DIFF_TEXT: Record<DiffStatus, string> = {
  added: 'text-green-800',
  removed: 'text-red-800 line-through',
  moved: 'text-amber-800',
  changed: 'text-blue-800',
  unchanged: 'text-gray-800',
};

const DIFF_BADGE: Record<DiffStatus, string> = {
  added: 'bg-green-100 text-green-700',
  removed: 'bg-red-100 text-red-700',
  moved: 'bg-amber-100 text-amber-700',
  changed: 'bg-blue-100 text-blue-700',
  unchanged: '',
};

/* ------------------------------------------------------------------ */
/*  Tree helpers                                                      */
/* ------------------------------------------------------------------ */

interface TreeNode {
  employee: Employee;
  diffStatus: DiffStatus;
  changes?: string[];
  children: TreeNode[];
}

function buildTree(
  employees: Employee[],
  diffMap: Map<string, { status: DiffStatus; changes?: string[] }>,
): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const emp of employees) {
    const diff = diffMap.get(emp._id) ?? diffMap.get(emp.name) ?? { status: 'unchanged' as DiffStatus };
    nodeMap.set(emp._id, {
      employee: emp,
      diffStatus: diff.status,
      changes: diff.changes,
      children: [],
    });
  }

  for (const emp of employees) {
    const node = nodeMap.get(emp._id)!;
    if (emp.managerId && nodeMap.has(emp.managerId)) {
      nodeMap.get(emp.managerId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/* ------------------------------------------------------------------ */
/*  Tree node component                                               */
/* ------------------------------------------------------------------ */

function TreeNodeItem({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [expanded, setExpanded] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const hasChildren = node.children.length > 0;
  const hasChanges = node.changes && node.changes.length > 0;

  return (
    <div>
      <div
        className={cn(
          'mb-1 flex items-center gap-2 rounded border px-3 py-1.5 transition-colors',
          DIFF_BG[node.diffStatus],
          (hasChildren || hasChanges) && 'cursor-pointer hover:opacity-80',
        )}
        style={{ marginLeft: depth * 20 }}
        onClick={() => {
          if (hasChanges) setShowDetails((v) => !v);
          if (hasChildren) setExpanded((v) => !v);
        }}
      >
        {hasChildren ? (
          <span className="w-3 text-xs text-gray-500">{expanded ? '▼' : '▶'}</span>
        ) : (
          <span className="w-3" />
        )}

        <div className="min-w-0 flex-1">
          <span className={cn('text-sm font-medium', DIFF_TEXT[node.diffStatus])}>
            {node.employee.name}
          </span>
          <span className="ml-2 text-xs text-gray-500">{node.employee.title}</span>
        </div>

        {node.diffStatus !== 'unchanged' && (
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              DIFF_BADGE[node.diffStatus],
            )}
          >
            {node.diffStatus}
          </span>
        )}
      </div>

      {/* Change details panel */}
      {showDetails && hasChanges && (
        <div
          className="mb-1 rounded bg-gray-50 px-3 py-2 text-xs text-gray-600"
          style={{ marginLeft: depth * 20 + 24 }}
        >
          <p className="mb-1 font-medium text-gray-700">Changes:</p>
          <ul className="list-inside list-disc space-y-0.5">
            {node.changes!.map((change, i) => (
              <li key={i}>{change}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Children */}
      {expanded &&
        node.children.map((child) => (
          <TreeNodeItem key={child.employee._id} node={child} depth={depth + 1} />
        ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CompareView                                                       */
/* ------------------------------------------------------------------ */

export default function CompareView() {
  const scenarios = useOrgStore((s) => s.scenarios);

  const [scenarioAId, setScenarioAId] = useState('');
  const [scenarioBId, setScenarioBId] = useState('');
  const [employeesA, setEmployeesA] = useState<Employee[]>([]);
  const [employeesB, setEmployeesB] = useState<Employee[]>([]);
  const [diff, setDiff] = useState<ScenarioDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ---- fetch comparison data ---- */
  const loadComparison = useCallback(async () => {
    if (!scenarioAId || !scenarioBId) return;
    if (scenarioAId === scenarioBId) {
      setError('Please select two different scenarios to compare.');
      return;
    }

    setLoading(true);
    setError(null);
    setDiff(null);

    try {
      const [empsA, empsB, diffResult] = await Promise.all([
        employeesApi.getEmployees(scenarioAId),
        employeesApi.getEmployees(scenarioBId),
        scenariosApi.diffScenarios(scenarioAId, scenarioBId),
      ]);
      setEmployeesA(empsA);
      setEmployeesB(empsB);
      setDiff(diffResult);
    } catch {
      setError('Failed to load comparison data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [scenarioAId, scenarioBId]);

  useEffect(() => {
    if (scenarioAId && scenarioBId && scenarioAId !== scenarioBId) {
      loadComparison();
    }
  }, [scenarioAId, scenarioBId, loadComparison]);

  /* ---- build diff trees ---- */
  const { treeA, treeB, summary } = useMemo(() => {
    if (!diff) return { treeA: [], treeB: [], summary: null };

    // Build lookup by employee ID and name (fallback)
    const diffMapA = new Map<string, { status: DiffStatus; changes?: string[] }>();
    const diffMapB = new Map<string, { status: DiffStatus; changes?: string[] }>();

    for (const entry of diff.removed) {
      diffMapA.set(entry.employee._id, { status: 'removed', changes: entry.changes });
      diffMapA.set(entry.employee.name, { status: 'removed', changes: entry.changes });
    }
    for (const entry of diff.added) {
      diffMapB.set(entry.employee._id, { status: 'added', changes: entry.changes });
      diffMapB.set(entry.employee.name, { status: 'added', changes: entry.changes });
    }
    for (const entry of diff.moved) {
      const val = { status: 'moved' as DiffStatus, changes: entry.changes };
      diffMapA.set(entry.employee._id, val);
      diffMapA.set(entry.employee.name, val);
      diffMapB.set(entry.employee._id, val);
      diffMapB.set(entry.employee.name, val);
    }
    for (const entry of diff.changed) {
      const val = { status: 'changed' as DiffStatus, changes: entry.changes };
      diffMapA.set(entry.employee._id, val);
      diffMapA.set(entry.employee.name, val);
      diffMapB.set(entry.employee._id, val);
      diffMapB.set(entry.employee.name, val);
    }
    for (const entry of diff.unchanged) {
      const val = { status: 'unchanged' as DiffStatus };
      diffMapA.set(entry.employee._id, val);
      diffMapA.set(entry.employee.name, val);
      diffMapB.set(entry.employee._id, val);
      diffMapB.set(entry.employee.name, val);
    }

    return {
      treeA: buildTree(employeesA, diffMapA),
      treeB: buildTree(employeesB, diffMapB),
      summary: {
        added: diff.added.length,
        removed: diff.removed.length,
        moved: diff.moved.length,
        changed: diff.changed.length,
      },
    };
  }, [diff, employeesA, employeesB]);

  const scenarioAName = scenarios.find((s) => s._id === scenarioAId)?.name ?? 'Unknown';
  const scenarioBName = scenarios.find((s) => s._id === scenarioBId)?.name ?? 'Unknown';

  /* ---- render ---- */
  return (
    <div className="flex h-full flex-col">
      {/* Scenario selectors */}
      <div className="mb-4 flex items-center gap-4">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-600">
            Scenario A
          </label>
          <select
            value={scenarioAId}
            onChange={(e) => setScenarioAId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Select scenario…</option>
            {scenarios.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-5 text-lg font-bold text-gray-400">vs</div>

        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-600">
            Scenario B
          </label>
          <select
            value={scenarioBId}
            onChange={(e) => setScenarioBId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Select scenario…</option>
            {scenarios.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Empty state */}
      {(!scenarioAId || !scenarioBId) && !error ? (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
          Select two scenarios to compare
        </div>
      ) : loading ? (
        /* Loading state */
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            Loading comparison…
          </div>
        </div>
      ) : diff && summary ? (
        <>
          {/* Summary banner */}
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-gray-200 bg-gray-100 px-4 py-3 text-sm">
            <span className="font-medium text-gray-700">Diff Summary:</span>
            <span className="rounded bg-green-100 px-2 py-0.5 font-medium text-green-700">
              +{summary.added} added
            </span>
            <span className="rounded bg-red-100 px-2 py-0.5 font-medium text-red-700">
              -{summary.removed} removed
            </span>
            <span className="rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-700">
              {summary.moved} moved
            </span>
            <span className="rounded bg-blue-100 px-2 py-0.5 font-medium text-blue-700">
              {summary.changed} changed
            </span>
          </div>

          {/* Legend */}
          <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded border border-green-300 bg-green-50" />
              Added
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded border border-red-300 bg-red-50" />
              Removed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded border border-amber-300 bg-amber-50" />
              Moved
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded border border-blue-300 bg-blue-50" />
              Changed
            </span>
          </div>

          {/* Side-by-side panels */}
          <div className="grid flex-1 grid-cols-2 gap-4 overflow-hidden">
            {/* Panel A */}
            <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200">
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
                <h3 className="text-sm font-semibold text-gray-700">
                  Scenario A: {scenarioAName}
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {treeA.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">No employees</p>
                ) : (
                  treeA.map((node) => (
                    <TreeNodeItem key={node.employee._id} node={node} />
                  ))
                )}
              </div>
            </div>

            {/* Panel B */}
            <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200">
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
                <h3 className="text-sm font-semibold text-gray-700">
                  Scenario B: {scenarioBName}
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {treeB.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">No employees</p>
                ) : (
                  treeB.map((node) => (
                    <TreeNodeItem key={node.employee._id} node={node} />
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
