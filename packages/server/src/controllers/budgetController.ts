import { Response } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { AuthRequest } from "../middleware/auth";
import BudgetEnvelope from "../models/BudgetEnvelope";
import Employee from "../models/Employee";
import Scenario from "../models/Scenario";

const createEnvelopeSchema = z.object({
  department: z.string().trim().min(1, "Department is required"),
  totalBudget: z.number().min(0, "Total budget must be non-negative"),
  headcountCap: z.number().int().min(0, "Headcount cap must be a non-negative integer"),
});

const updateEnvelopeSchema = z.object({
  department: z.string().trim().min(1).optional(),
  totalBudget: z.number().min(0).optional(),
  headcountCap: z.number().int().min(0).optional(),
});

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * POST /api/scenarios/:id/budgets
 * Create a new department budget envelope within a scenario.
 */
export const createBudgetEnvelope = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const scenarioId = req.params.id;
    if (!isValidObjectId(scenarioId)) {
      res.status(400).json({ error: "Invalid scenario ID" });
      return;
    }

    const data = createEnvelopeSchema.parse(req.body);

    const scenario = await Scenario.findById(scenarioId);
    if (!scenario) {
      res.status(404).json({ error: "Scenario not found" });
      return;
    }

    try {
      const envelope = await BudgetEnvelope.create({
        orgId: scenario.orgId,
        scenarioId,
        department: data.department,
        totalBudget: data.totalBudget,
        headcountCap: data.headcountCap,
        createdBy: req.user!.userId,
      });
      res.status(201).json(envelope);
    } catch (createErr: unknown) {
      // Duplicate (scenarioId, department) combination
      if (
        typeof createErr === "object" &&
        createErr !== null &&
        "code" in createErr &&
        (createErr as { code?: number }).code === 11000
      ) {
        res
          .status(409)
          .json({ error: "A budget envelope already exists for this department" });
        return;
      }
      throw createErr;
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /api/scenarios/:id/budgets
 * List all budget envelopes for a scenario.
 */
export const getBudgetEnvelopes = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const scenarioId = req.params.id;
    if (!isValidObjectId(scenarioId)) {
      res.status(400).json({ error: "Invalid scenario ID" });
      return;
    }
    const envelopes = await BudgetEnvelope.find({ scenarioId }).sort({
      department: 1,
    });
    res.json(envelopes);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PATCH /api/scenarios/:id/budgets/:budgetId
 * Update a budget envelope (department, totalBudget, headcountCap).
 */
export const updateBudgetEnvelope = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id: scenarioId, budgetId } = req.params;
    if (!isValidObjectId(scenarioId) || !isValidObjectId(budgetId)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }

    const envelope = await BudgetEnvelope.findById(budgetId);
    if (!envelope || envelope.scenarioId.toString() !== scenarioId) {
      res.status(404).json({ error: "Budget envelope not found" });
      return;
    }

    const updates = updateEnvelopeSchema.parse(req.body);

    try {
      const updated = await BudgetEnvelope.findByIdAndUpdate(budgetId, updates, {
        new: true,
        runValidators: true,
      });
      res.json(updated);
    } catch (updateErr: unknown) {
      if (
        typeof updateErr === "object" &&
        updateErr !== null &&
        "code" in updateErr &&
        (updateErr as { code?: number }).code === 11000
      ) {
        res
          .status(409)
          .json({ error: "A budget envelope already exists for this department" });
        return;
      }
      throw updateErr;
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * DELETE /api/scenarios/:id/budgets/:budgetId
 * Remove a budget envelope.
 */
export const deleteBudgetEnvelope = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id: scenarioId, budgetId } = req.params;
    if (!isValidObjectId(scenarioId) || !isValidObjectId(budgetId)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }

    const envelope = await BudgetEnvelope.findById(budgetId);
    if (!envelope || envelope.scenarioId.toString() !== scenarioId) {
      res.status(404).json({ error: "Budget envelope not found" });
      return;
    }

    await BudgetEnvelope.findByIdAndDelete(budgetId);
    res.json({ message: "Budget envelope deleted" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

interface DepartmentSummary {
  department: string;
  envelopeId: string | null;
  totalBudget: number | null;
  headcountCap: number | null;
  actualSpend: number;
  actualHeadcount: number;
  remainingBudget: number | null;
  remainingHeadcount: number | null;
  utilizationPct: number | null;
  headcountUtilizationPct: number | null;
  /** "under" (<80%), "warning" (>=80 <100), or "exceeded" (>=100). null if no budget. */
  budgetStatus: "under" | "warning" | "exceeded" | null;
  headcountStatus: "under" | "warning" | "exceeded" | null;
}

interface SummaryResponse {
  departments: DepartmentSummary[];
  totals: {
    totalBudget: number;
    headcountCap: number;
    actualSpend: number;
    actualHeadcount: number;
    remainingBudget: number;
    remainingHeadcount: number;
    utilizationPct: number | null;
    headcountUtilizationPct: number | null;
  };
}

function classifyStatus(
  actual: number,
  cap: number | null
): "under" | "warning" | "exceeded" | null {
  if (cap === null) return null;
  if (cap === 0) {
    return actual > 0 ? "exceeded" : "under";
  }
  const pct = (actual / cap) * 100;
  if (pct >= 100) return "exceeded";
  if (pct >= 80) return "warning";
  return "under";
}

/**
 * GET /api/scenarios/:id/budgets/summary
 * Returns per-department actual spend + headcount vs. envelope values.
 * Includes departments that have envelopes OR employees (union),
 * plus org-wide totals.
 */
export const getBudgetSummary = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const scenarioId = req.params.id;
    if (!isValidObjectId(scenarioId)) {
      res.status(400).json({ error: "Invalid scenario ID" });
      return;
    }

    const [envelopes, employees] = await Promise.all([
      BudgetEnvelope.find({ scenarioId }).lean(),
      Employee.find({ scenarioId }).lean(),
    ]);

    // Normalize department keys (trim) so that "Engineering", "Engineering "
    // and " Engineering" group together consistently on both the envelope
    // side and the actuals side. Empty / whitespace-only values bucket into
    // "Unassigned".
    const normalizeDept = (raw: unknown): string => {
      const trimmed = typeof raw === "string" ? raw.trim() : "";
      return trimmed.length > 0 ? trimmed : "Unassigned";
    };

    const envelopeByDept = new Map<string, typeof envelopes[number]>();
    for (const env of envelopes) {
      envelopeByDept.set(normalizeDept(env.department), env);
    }

    // Aggregate employee actuals by department
    const actualsByDept = new Map<
      string,
      { spend: number; headcount: number }
    >();
    for (const emp of employees) {
      const dept = normalizeDept(emp.department);
      const entry = actualsByDept.get(dept) ?? { spend: 0, headcount: 0 };
      entry.spend += (emp.salary ?? 0) + (emp.equity ?? 0);
      entry.headcount += 1;
      actualsByDept.set(dept, entry);
    }

    // Union of departments across envelopes and actuals
    const allDepartments = new Set<string>([
      ...envelopeByDept.keys(),
      ...actualsByDept.keys(),
    ]);

    const departments: DepartmentSummary[] = Array.from(allDepartments)
      .sort()
      .map((department) => {
        const env = envelopeByDept.get(department);
        const actual = actualsByDept.get(department) ?? { spend: 0, headcount: 0 };

        const totalBudget = env ? env.totalBudget : null;
        const headcountCap = env ? env.headcountCap : null;

        const remainingBudget =
          totalBudget === null ? null : totalBudget - actual.spend;
        const remainingHeadcount =
          headcountCap === null ? null : headcountCap - actual.headcount;

        const utilizationPct =
          totalBudget === null
            ? null
            : totalBudget === 0
              ? actual.spend > 0
                ? 100
                : 0
              : (actual.spend / totalBudget) * 100;
        const headcountUtilizationPct =
          headcountCap === null
            ? null
            : headcountCap === 0
              ? actual.headcount > 0
                ? 100
                : 0
              : (actual.headcount / headcountCap) * 100;

        return {
          department,
          envelopeId: env ? env._id.toString() : null,
          totalBudget,
          headcountCap,
          actualSpend: actual.spend,
          actualHeadcount: actual.headcount,
          remainingBudget,
          remainingHeadcount,
          utilizationPct,
          headcountUtilizationPct,
          budgetStatus: classifyStatus(actual.spend, totalBudget),
          headcountStatus: classifyStatus(actual.headcount, headcountCap),
        };
      });

    const totalBudget = envelopes.reduce((s, e) => s + e.totalBudget, 0);
    const headcountCap = envelopes.reduce((s, e) => s + e.headcountCap, 0);
    const actualSpend = departments.reduce((s, d) => s + d.actualSpend, 0);
    const actualHeadcount = departments.reduce((s, d) => s + d.actualHeadcount, 0);

    const response: SummaryResponse = {
      departments,
      totals: {
        totalBudget,
        headcountCap,
        actualSpend,
        actualHeadcount,
        remainingBudget: totalBudget - actualSpend,
        remainingHeadcount: headcountCap - actualHeadcount,
        utilizationPct:
          totalBudget === 0 ? null : (actualSpend / totalBudget) * 100,
        headcountUtilizationPct:
          headcountCap === 0 ? null : (actualHeadcount / headcountCap) * 100,
      },
    };

    res.json(response);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};
