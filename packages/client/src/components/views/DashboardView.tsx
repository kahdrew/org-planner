import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Briefcase,
  CheckCircle2,
  DollarSign,
  TrendingUp,
  PieChart as PieIcon,
  Users,
  Clock,
} from 'lucide-react';
import { useOrgStore } from '@/stores/orgStore';
import { useBudgetStore } from '@/stores/budgetStore';
import {
  computeHeadcountTrend,
  computeCostBreakdown,
  computeEmploymentDistribution,
  computeOpenPositions,
  computeHiringVelocity,
  type BreakdownDimension,
} from '@/utils/dashboardMetrics';
import {
  computeBudgetSummary,
  computeCostProjection,
} from '@/utils/budgetMetrics';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
  notation: 'compact',
});

const fullCurrencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const EMPLOYMENT_COLORS: Record<string, string> = {
  FTE: '#3b82f6',
  Contractor: '#a855f7',
  Intern: '#10b981',
};

const DIMENSION_LABEL: Record<BreakdownDimension, string> = {
  department: 'Department',
  level: 'Level',
  location: 'Location',
};

interface WidgetProps {
  title: string;
  icon: React.ReactNode;
  testId: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  className?: string;
}

function Widget({ title, icon, testId, children, headerRight, className }: WidgetProps) {
  return (
    <section
      className={`flex flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm ${
        className ?? ''
      }`}
      data-testid={testId}
    >
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-blue-500">{icon}</span>
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        </div>
        {headerRight}
      </header>
      <div className="flex-1 min-h-[220px]">{children}</div>
    </section>
  );
}

function EmptyState() {
  return (
    <div
      className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center"
      data-testid="dashboard-empty-state"
    >
      <BarChart3 size={40} className="mb-3 text-gray-400" />
      <h2 className="text-lg font-semibold text-gray-800">No data to display</h2>
      <p className="mt-1 max-w-md text-sm text-gray-500">
        Add employees to this scenario to see analytics. Use the
        {' '}
        <span className="font-medium text-gray-700">Add Employee</span>
        {' '}
        button in the toolbar or import a CSV to get started.
      </p>
    </div>
  );
}

function NoScenarioState() {
  return (
    <div
      className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center"
      data-testid="dashboard-no-scenario"
    >
      <BarChart3 size={40} className="mb-3 text-gray-400" />
      <h2 className="text-lg font-semibold text-gray-800">Select a scenario</h2>
      <p className="mt-1 max-w-md text-sm text-gray-500">
        Choose an organization and scenario from the sidebar to view analytics.
      </p>
    </div>
  );
}

export default function DashboardView() {
  const employees = useOrgStore((s) => s.employees);
  const currentScenario = useOrgStore((s) => s.currentScenario);
  const envelopes = useBudgetStore((s) => s.envelopes);
  const fetchEnvelopes = useBudgetStore((s) => s.fetchEnvelopes);
  const clearEnvelopes = useBudgetStore((s) => s.clearEnvelopes);
  const [dimension, setDimension] = useState<BreakdownDimension>('department');

  // Refresh envelopes when scenario changes so the dashboard is always
  // scenario-aware. Clears when there is no current scenario.
  useEffect(() => {
    if (currentScenario?._id) {
      fetchEnvelopes(currentScenario._id);
    } else {
      clearEnvelopes();
    }
  }, [currentScenario?._id, fetchEnvelopes, clearEnvelopes]);

  const budgetSummary = useMemo(
    () => computeBudgetSummary(envelopes, employees),
    [envelopes, employees],
  );
  const costProjection = useMemo(
    () => computeCostProjection(employees, 12),
    [employees],
  );

  const headcountTrend = useMemo(() => computeHeadcountTrend(employees), [employees]);
  const velocity = useMemo(() => computeHiringVelocity(employees), [employees]);
  const breakdown = useMemo(
    () => computeCostBreakdown(employees, dimension),
    [employees, dimension],
  );
  const distribution = useMemo(
    () => computeEmploymentDistribution(employees),
    [employees],
  );
  const openPositions = useMemo(() => computeOpenPositions(employees), [employees]);

  const totalComp = useMemo(
    () =>
      employees.reduce((sum, e) => sum + (e.salary ?? 0) + (e.equity ?? 0), 0),
    [employees],
  );

  if (!currentScenario) {
    return (
      <div className="h-full p-6">
        <NoScenarioState />
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <div className="h-full p-6" data-testid="dashboard-view">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-sm text-gray-500">
            Overview of headcount, cost, and hiring for
            {' '}
            <span className="font-medium text-gray-700">{currentScenario.name}</span>.
          </p>
        </div>
        <EmptyState />
      </div>
    );
  }

  const distributionTotal = distribution.reduce((s, r) => s + r.value, 0);

  return (
    <div className="h-full overflow-auto p-6" data-testid="dashboard-view">
      {/* Heading */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
        <p className="text-sm text-gray-500">
          Overview for
          {' '}
          <span className="font-medium text-gray-700">{currentScenario.name}</span>.
        </p>
      </div>

      {/* Summary tiles */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="dashboard-summary">
        <SummaryTile
          icon={<Users size={16} />}
          label="Headcount"
          value={String(employees.length)}
          testId="summary-headcount"
        />
        <SummaryTile
          icon={<Briefcase size={16} />}
          label="Open Positions"
          value={String(openPositions.total)}
          testId="summary-open-positions"
        />
        <SummaryTile
          icon={<PieIcon size={16} />}
          label="Total Comp"
          value={fullCurrencyFormatter.format(totalComp)}
          testId="summary-total-comp"
        />
        <SummaryTile
          icon={<TrendingUp size={16} />}
          label="Hires (12 mo)"
          value={String(velocity.reduce((s, p) => s + p.count, 0))}
          testId="summary-hires"
        />
      </div>

      {/* Widget grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Headcount Trend */}
        <Widget
          title="Headcount Trends"
          icon={<TrendingUp size={16} />}
          testId="widget-headcount-trends"
          className="lg:col-span-2"
        >
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={headcountTrend} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" stroke="#6b7280" fontSize={12} />
              <YAxis allowDecimals={false} stroke="#6b7280" fontSize={12} />
              <Tooltip
                formatter={(value) => [Number(value ?? 0), 'Headcount']}
                contentStyle={{ fontSize: 12 }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
                name="Headcount"
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="sr-only" data-testid="widget-headcount-trends-latest">
            {headcountTrend[headcountTrend.length - 1]?.count ?? 0}
          </div>
        </Widget>

        {/* Cost Breakdown */}
        <Widget
          title="Cost Breakdown"
          icon={<BarChart3 size={16} />}
          testId="widget-cost-breakdown"
          headerRight={
            <select
              value={dimension}
              onChange={(e) => setDimension(e.target.value as BreakdownDimension)}
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-blue-500 focus:outline-none"
              data-testid="cost-breakdown-dimension"
              aria-label="Breakdown dimension"
            >
              {(Object.keys(DIMENSION_LABEL) as BreakdownDimension[]).map((d) => (
                <option key={d} value={d}>
                  By {DIMENSION_LABEL[d]}
                </option>
              ))}
            </select>
          }
        >
          {breakdown.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              No data
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={breakdown}
                margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" stroke="#6b7280" fontSize={12} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis
                  tickFormatter={(v: number) => currencyFormatter.format(v)}
                  stroke="#6b7280"
                  fontSize={12}
                />
                <Tooltip
                  formatter={(value) => [
                    fullCurrencyFormatter.format(Number(value ?? 0)),
                    'Total Comp',
                  ]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Widget>

        {/* Employment Distribution */}
        <Widget
          title="Employment Distribution"
          icon={<PieIcon size={16} />}
          testId="widget-employment-distribution"
        >
          {distributionTotal === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              No data
            </div>
          ) : (
            <div className="flex h-full items-center gap-3">
              <div className="flex-1">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={distribution}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={40}
                      isAnimationActive={false}
                      label={(entry) => {
                        const name = (entry as { name?: string }).name ?? '';
                        const value = Number(
                          (entry as { value?: number }).value ?? 0,
                        );
                        return value > 0 ? `${name}: ${value}` : '';
                      }}
                    >
                      {distribution.map((row) => (
                        <Cell key={row.name} fill={EMPLOYMENT_COLORS[row.name] ?? '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="min-w-[120px] space-y-1.5 text-sm" aria-label="Employment distribution legend">
                {distribution.map((row) => (
                  <li
                    key={row.name}
                    className="flex items-center justify-between gap-2"
                    data-testid={`distribution-row-${row.name}`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor: EMPLOYMENT_COLORS[row.name] ?? '#94a3b8',
                        }}
                        aria-hidden
                      />
                      <span className="text-gray-700">{row.name}</span>
                    </span>
                    <span className="font-semibold text-gray-900">{row.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Widget>

        {/* Open Positions */}
        <Widget
          title="Open Positions"
          icon={<Briefcase size={16} />}
          testId="widget-open-positions"
          headerRight={
            <span
              className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700"
              data-testid="open-positions-total"
            >
              {openPositions.total}
            </span>
          }
        >
          <div className="mb-2 flex gap-2 text-xs">
            <span
              className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 font-medium text-amber-700"
              data-testid="open-positions-open-req"
            >
              Open Req: {openPositions.openReqCount}
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-md bg-purple-100 px-2 py-0.5 font-medium text-purple-700"
              data-testid="open-positions-backfill"
            >
              Backfill: {openPositions.backfillCount}
            </span>
          </div>
          {openPositions.list.length === 0 ? (
            <p className="text-sm text-gray-500">No open positions.</p>
          ) : (
            <ul
              className="max-h-[220px] space-y-1.5 overflow-y-auto pr-2 text-sm"
              data-testid="open-positions-list"
            >
              {openPositions.list.map((p) => (
                <li
                  key={p._id}
                  className="flex items-start justify-between rounded-md border border-gray-100 px-3 py-2"
                  data-testid={`open-position-${p._id}`}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-gray-800">{p.title}</div>
                    <div className="truncate text-xs text-gray-500">
                      {p.department || 'Unassigned'}
                      {p.name && ` · ${p.name}`}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      p.status === 'Open Req'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-purple-100 text-purple-700'
                    }`}
                  >
                    {p.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Widget>

        {/* Hiring Velocity */}
        <Widget
          title="Hiring Velocity"
          icon={<Clock size={16} />}
          testId="widget-hiring-velocity"
          className="lg:col-span-2"
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={velocity} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" stroke="#6b7280" fontSize={12} />
              <YAxis allowDecimals={false} stroke="#6b7280" fontSize={12} />
              <Tooltip
                formatter={(value) => [Number(value ?? 0), 'New hires']}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar
                dataKey="count"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
                name="New hires"
              />
            </BarChart>
          </ResponsiveContainer>
        </Widget>

        {/* Budget vs Actual */}
        <Widget
          title="Budget vs. Actual by Department"
          icon={<DollarSign size={16} />}
          testId="widget-budget-comparison"
          className="lg:col-span-2"
          headerRight={
            <span
              className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700"
              data-testid="budget-envelope-count"
            >
              {envelopes.length} envelope{envelopes.length === 1 ? '' : 's'}
            </span>
          }
        >
          {budgetSummary.departments.filter((d) => d.totalBudget !== null)
            .length === 0 ? (
            <div
              className="flex h-full items-center justify-center text-sm text-gray-500"
              data-testid="budget-comparison-empty"
            >
              No budget envelopes set. Open the Budget panel to add one.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={budgetSummary.departments
                  .filter((d) => d.totalBudget !== null)
                  .map((d) => ({
                    department: d.department,
                    Budget: d.totalBudget ?? 0,
                    Actual: d.actualSpend,
                  }))}
                margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="department"
                  stroke="#6b7280"
                  fontSize={12}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  tickFormatter={(v: number) => currencyFormatter.format(v)}
                  stroke="#6b7280"
                  fontSize={12}
                />
                <Tooltip
                  formatter={(value) => [
                    fullCurrencyFormatter.format(Number(value ?? 0)),
                    '',
                  ]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="Budget"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="Actual"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Widget>

        {/* Cost Projection */}
        <Widget
          title="Cost Projection (12 months)"
          icon={<TrendingUp size={16} />}
          testId="widget-cost-projection"
          className="lg:col-span-2"
        >
          {costProjection.every((p) => p.projected === 0) ? (
            <div
              className="flex h-full items-center justify-center text-sm text-gray-500"
              data-testid="cost-projection-empty"
            >
              Add Active or Planned employees to project future spend.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart
                data={costProjection}
                margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" stroke="#6b7280" fontSize={12} />
                <YAxis
                  tickFormatter={(v: number) => currencyFormatter.format(v)}
                  stroke="#6b7280"
                  fontSize={12}
                />
                <Tooltip
                  formatter={(value) => [
                    fullCurrencyFormatter.format(Number(value ?? 0)),
                    '',
                  ]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="committed"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  name="Committed"
                />
                <Line
                  type="monotone"
                  dataKey="projected"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  isAnimationActive={false}
                  name="Projected"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Widget>

        {/* Budget alerts list */}
        <Widget
          title="Budget Alerts"
          icon={<AlertTriangle size={16} />}
          testId="widget-budget-alerts"
          className="lg:col-span-2"
        >
          {budgetSummary.departments.filter(
            (d) => d.budgetStatus === 'warning' || d.budgetStatus === 'exceeded',
          ).length === 0 ? (
            <div
              className="flex items-center gap-2 text-sm text-emerald-700"
              data-testid="budget-alerts-empty"
            >
              <CheckCircle2 size={16} /> All departments are on track.
            </div>
          ) : (
            <ul className="space-y-2 text-sm" data-testid="budget-alerts-list">
              {budgetSummary.departments
                .filter(
                  (d) =>
                    d.budgetStatus === 'warning' ||
                    d.budgetStatus === 'exceeded',
                )
                .map((d) => (
                  <li
                    key={d.department}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 ${
                      d.budgetStatus === 'exceeded'
                        ? 'border-red-200 bg-red-50'
                        : 'border-amber-200 bg-amber-50'
                    }`}
                    data-testid={`budget-alert-${d.department}`}
                  >
                    <span className="flex items-center gap-2">
                      {d.budgetStatus === 'exceeded' ? (
                        <AlertCircle size={14} className="text-red-600" />
                      ) : (
                        <AlertTriangle size={14} className="text-amber-600" />
                      )}
                      <span className="font-medium text-gray-800">
                        {d.department}
                      </span>
                    </span>
                    <span className="text-xs text-gray-600">
                      {fullCurrencyFormatter.format(d.actualSpend)} /{' '}
                      {fullCurrencyFormatter.format(d.totalBudget ?? 0)}
                      {d.utilizationPct !== null && (
                        <span className="ml-2 font-semibold">
                          ({d.utilizationPct.toFixed(0)}%)
                        </span>
                      )}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Widget>
      </div>
    </div>
  );
}

interface SummaryTileProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  testId: string;
}

function SummaryTile({ icon, label, value, testId }: SummaryTileProps) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm"
      data-testid={testId}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-600">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[11px] font-medium uppercase tracking-wide text-gray-500">
          {label}
        </div>
        <div className="truncate text-base font-semibold text-gray-900">{value}</div>
      </div>
    </div>
  );
}
