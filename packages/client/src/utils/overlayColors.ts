import type { Employee } from '@/types';
import type { OverlayMode } from '@/stores/overlayStore';

/** A neutral fallback when an employee is missing the data for the overlay. */
export const NEUTRAL_COLOR = '#d1d5db'; // gray-300

/** Distinct colors used for categorical overlays (department, etc.). */
const CATEGORICAL_PALETTE = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#8b5cf6', // violet-500
  '#f43f5e', // rose-500
  '#f59e0b', // amber-500
  '#06b6d4', // cyan-500
  '#6366f1', // indigo-500
  '#ec4899', // pink-500
  '#84cc16', // lime-500
  '#14b8a6', // teal-500
  '#ef4444', // red-500
  '#a855f7', // purple-500
];

/** Fixed colors for employment type. */
export const EMPLOYMENT_TYPE_COLORS: Record<Employee['employmentType'], string> = {
  FTE: '#3b82f6', // blue-500
  Contractor: '#f59e0b', // amber-500
  Intern: '#10b981', // emerald-500
};

/** Fixed colors for status (mirrors existing card status colors). */
export const STATUS_COLORS: Record<Employee['status'], string> = {
  Active: '#3b82f6', // blue-500
  Planned: '#f59e0b', // amber-500
  'Open Req': '#22c55e', // green-500
  Backfill: '#a855f7', // purple-500
};

/**
 * Hash a string to a stable index within a palette. Used for distinct
 * department colors that do not depend on insertion order.
 */
function hashStringToIndex(value: string, modulo: number): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = value.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % modulo;
}

/** Get a distinct color for an arbitrary category label. */
export function getCategoricalColor(label: string): string {
  if (!label) return NEUTRAL_COLOR;
  return CATEGORICAL_PALETTE[hashStringToIndex(label, CATEGORICAL_PALETTE.length)];
}

/** Clamp a number between 0 and 1. */
function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * Interpolate a hex color from green (#22c55e) through yellow (#f59e0b)
 * to red (#ef4444) as `t` goes from 0 to 1.
 */
export function gradientGreenToRed(t: number): string {
  const v = clamp01(t);
  // Piecewise interpolation green -> yellow -> red
  const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
  let r: number;
  let g: number;
  let b: number;
  if (v < 0.5) {
    const x = v / 0.5;
    // green (#22c55e → 34, 197, 94) to yellow (#f59e0b → 245, 158, 11)
    r = lerp(34, 245, x);
    g = lerp(197, 158, x);
    b = lerp(94, 11, x);
  } else {
    const x = (v - 0.5) / 0.5;
    // yellow to red (#ef4444 → 239, 68, 68)
    r = lerp(245, 239, x);
    g = lerp(158, 68, x);
    b = lerp(11, 68, x);
  }
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Compute the inclusive salary range across the given employees. Returns null
 * when no employee has a numeric salary. */
export function computeSalaryRange(employees: Employee[]): { min: number; max: number } | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let found = false;
  for (const e of employees) {
    if (typeof e.salary === 'number' && Number.isFinite(e.salary)) {
      found = true;
      if (e.salary < min) min = e.salary;
      if (e.salary > max) max = e.salary;
    }
  }
  if (!found) return null;
  return { min, max };
}

/**
 * Compute the inclusive tenure range (in days) for the given employees,
 * relative to `now`. Returns null when no employee has a valid startDate.
 */
export function computeTenureRange(
  employees: Employee[],
  now: Date = new Date(),
): { minDays: number; maxDays: number } | null {
  const nowMs = now.getTime();
  let minDays = Number.POSITIVE_INFINITY;
  let maxDays = Number.NEGATIVE_INFINITY;
  let found = false;
  for (const e of employees) {
    if (!e.startDate) continue;
    const ms = new Date(e.startDate).getTime();
    if (Number.isNaN(ms)) continue;
    const days = Math.max(0, (nowMs - ms) / 86400000);
    found = true;
    if (days < minDays) minDays = days;
    if (days > maxDays) maxDays = days;
  }
  if (!found) return null;
  return { minDays, maxDays };
}

/** Extra context needed to resolve gradient-style overlays. */
export interface OverlayContext {
  salaryRange?: { min: number; max: number } | null;
  tenureRange?: { minDays: number; maxDays: number } | null;
  now?: Date;
}

export interface OverlayColorResult {
  /** The main color to apply (typically as a background or left border). */
  color: string;
  /** Short human-readable label for tooltips / legend matching. */
  label: string;
  /** True when the color is the neutral fallback (missing data). */
  isNeutral: boolean;
}

/**
 * Resolve the overlay color for a single employee given the active mode.
 * When mode is 'none' or the employee is missing the required data, returns
 * the neutral color.
 */
export function getOverlayColor(
  employee: Employee,
  mode: OverlayMode,
  context: OverlayContext = {},
): OverlayColorResult {
  switch (mode) {
    case 'none':
      return { color: NEUTRAL_COLOR, label: 'No overlay', isNeutral: true };

    case 'salary': {
      const range = context.salaryRange;
      if (
        !range ||
        typeof employee.salary !== 'number' ||
        !Number.isFinite(employee.salary)
      ) {
        return { color: NEUTRAL_COLOR, label: 'No salary', isNeutral: true };
      }
      const span = Math.max(range.max - range.min, 1);
      const t = (employee.salary - range.min) / span;
      return {
        color: gradientGreenToRed(t),
        label: `Salary ${new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        }).format(employee.salary)}`,
        isNeutral: false,
      };
    }

    case 'tenure': {
      const range = context.tenureRange;
      if (!range || !employee.startDate) {
        return { color: NEUTRAL_COLOR, label: 'No start date', isNeutral: true };
      }
      const now = context.now ?? new Date();
      const ms = new Date(employee.startDate).getTime();
      if (Number.isNaN(ms)) {
        return { color: NEUTRAL_COLOR, label: 'No start date', isNeutral: true };
      }
      const days = Math.max(0, (now.getTime() - ms) / 86400000);
      const span = Math.max(range.maxDays - range.minDays, 1);
      const t = (days - range.minDays) / span;
      // Longer tenure → "hotter" color
      return {
        color: gradientGreenToRed(t),
        label: `Tenure ${Math.floor(days)}d`,
        isNeutral: false,
      };
    }

    case 'department': {
      if (!employee.department) {
        return { color: NEUTRAL_COLOR, label: 'No department', isNeutral: true };
      }
      return {
        color: getCategoricalColor(employee.department),
        label: employee.department,
        isNeutral: false,
      };
    }

    case 'employmentType': {
      return {
        color: EMPLOYMENT_TYPE_COLORS[employee.employmentType] ?? NEUTRAL_COLOR,
        label: employee.employmentType,
        isNeutral: false,
      };
    }

    case 'status': {
      return {
        color: STATUS_COLORS[employee.status] ?? NEUTRAL_COLOR,
        label: employee.status,
        isNeutral: false,
      };
    }

    default:
      return { color: NEUTRAL_COLOR, label: 'No overlay', isNeutral: true };
  }
}

/** Build the OverlayContext from the current employees. */
export function buildOverlayContext(
  employees: Employee[],
  now: Date = new Date(),
): OverlayContext {
  return {
    salaryRange: computeSalaryRange(employees),
    tenureRange: computeTenureRange(employees, now),
    now,
  };
}

export interface LegendEntry {
  color: string;
  label: string;
}

/**
 * Build a legend description for the active overlay mode. Gradient modes
 * return `type: 'gradient'` with min/max samples; categorical modes return
 * `type: 'categorical'` with one entry per category found in `employees`.
 */
export function buildLegend(
  mode: OverlayMode,
  employees: Employee[],
  context: OverlayContext = buildOverlayContext(employees),
):
  | { type: 'none' }
  | {
      type: 'gradient';
      title: string;
      minLabel: string;
      maxLabel: string;
      stops: string[];
    }
  | {
      type: 'categorical';
      title: string;
      entries: LegendEntry[];
    } {
  switch (mode) {
    case 'none':
      return { type: 'none' };

    case 'salary': {
      const range = context.salaryRange;
      if (!range) {
        return {
          type: 'gradient',
          title: 'Salary Band',
          minLabel: 'No data',
          maxLabel: 'No data',
          stops: [gradientGreenToRed(0), gradientGreenToRed(0.5), gradientGreenToRed(1)],
        };
      }
      const fmt = (v: number) =>
        new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        }).format(v);
      return {
        type: 'gradient',
        title: 'Salary Band',
        minLabel: fmt(range.min),
        maxLabel: fmt(range.max),
        stops: [gradientGreenToRed(0), gradientGreenToRed(0.5), gradientGreenToRed(1)],
      };
    }

    case 'tenure': {
      const range = context.tenureRange;
      if (!range) {
        return {
          type: 'gradient',
          title: 'Tenure',
          minLabel: 'No data',
          maxLabel: 'No data',
          stops: [gradientGreenToRed(0), gradientGreenToRed(0.5), gradientGreenToRed(1)],
        };
      }
      const toLabel = (days: number) => {
        if (days < 30) return `${Math.round(days)}d`;
        if (days < 365) return `${Math.round(days / 30)}mo`;
        return `${(days / 365).toFixed(1)}y`;
      };
      return {
        type: 'gradient',
        title: 'Tenure',
        minLabel: toLabel(range.minDays),
        maxLabel: toLabel(range.maxDays),
        stops: [gradientGreenToRed(0), gradientGreenToRed(0.5), gradientGreenToRed(1)],
      };
    }

    case 'department': {
      const seen = new Set<string>();
      for (const e of employees) {
        if (e.department) seen.add(e.department);
      }
      const entries = Array.from(seen)
        .sort()
        .map((dept) => ({ color: getCategoricalColor(dept), label: dept }));
      return { type: 'categorical', title: 'Department', entries };
    }

    case 'employmentType': {
      const entries: LegendEntry[] = (
        ['FTE', 'Contractor', 'Intern'] as Employee['employmentType'][]
      ).map((t) => ({ color: EMPLOYMENT_TYPE_COLORS[t], label: t }));
      return { type: 'categorical', title: 'Employment Type', entries };
    }

    case 'status': {
      const entries: LegendEntry[] = (
        ['Active', 'Planned', 'Open Req', 'Backfill'] as Employee['status'][]
      ).map((s) => ({ color: STATUS_COLORS[s], label: s }));
      return { type: 'categorical', title: 'Status', entries };
    }

    default:
      return { type: 'none' };
  }
}
