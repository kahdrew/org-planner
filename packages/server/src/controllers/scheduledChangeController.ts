import { Response } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { AuthRequest } from "../middleware/auth";
import { checkScenarioAccess, getUserOrgRole } from "../middleware/authorization";
import ScheduledChange from "../models/ScheduledChange";
import Employee from "../models/Employee";

const scheduledChangeSchema = z.object({
  employeeId: z.string().min(1),
  effectiveDate: z.string().min(1),
  changeType: z.enum(["transfer", "promotion", "departure", "edit"]),
  changeData: z.record(z.unknown()),
});

const updateScheduledChangeSchema = z.object({
  effectiveDate: z.string().optional(),
  changeType: z.enum(["transfer", "promotion", "departure", "edit"]).optional(),
  changeData: z.record(z.unknown()).optional(),
});

function parseDateOnly(dateValue: string): Date | null {
  const [year, month, day] = dateValue.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * POST /api/scenarios/:id/scheduled-changes
 * Create a new scheduled change for an employee within a scenario.
 */
export const createScheduledChange = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scenarioId = req.params.id;
    const data = scheduledChangeSchema.parse(req.body);

    // Validate effective date is not in the past
    const effectiveDate = parseDateOnly(data.effectiveDate);
    if (!effectiveDate) {
      res.status(400).json({ error: "Invalid effective date" });
      return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (effectiveDate < today) {
      res.status(400).json({ error: "Effective date cannot be in the past" });
      return;
    }

    // Validate employeeId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(data.employeeId)) {
      res.status(400).json({ error: "Invalid employee ID" });
      return;
    }

    // Check employee exists and belongs to this scenario
    const employee = await Employee.findById(data.employeeId);
    if (!employee || employee.scenarioId.toString() !== scenarioId) {
      res.status(404).json({ error: "Employee not found in this scenario" });
      return;
    }

    const scheduledChange = await ScheduledChange.create({
      employeeId: data.employeeId,
      scenarioId,
      effectiveDate,
      changeType: data.changeType,
      changeData: data.changeData,
      createdBy: req.user!.userId,
      status: "pending",
    });

    res.status(201).json(scheduledChange);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /api/scenarios/:id/scheduled-changes
 * List all scheduled changes for a scenario (optionally filtered by status).
 */
export const getScheduledChanges = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scenarioId = req.params.id;
    const statusFilter = req.query.status as string | undefined;

    const query: Record<string, unknown> = { scenarioId };
    if (statusFilter) {
      query.status = statusFilter;
    }

    const changes = await ScheduledChange.find(query).sort({ effectiveDate: 1 });
    res.json(changes);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PATCH /api/scheduled-changes/:id
 * Update a pending scheduled change (edit effective date, type, or data).
 */
export const updateScheduledChange = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      res.status(400).json({ error: "Invalid scheduled change ID" });
      return;
    }

    const change = await ScheduledChange.findById(req.params.id);
    if (!change) {
      res.status(404).json({ error: "Scheduled change not found" });
      return;
    }

    if (change.status !== "pending") {
      res.status(400).json({ error: "Can only edit pending scheduled changes" });
      return;
    }

    // Check authorization via scenario→org chain
    const { hasAccess, scenario } = await checkScenarioAccess(
      change.scenarioId.toString(),
      req.user!.userId
    );
    if (!hasAccess) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Check role-based write access
    if (scenario) {
      const role = await getUserOrgRole(scenario.orgId.toString(), req.user!.userId);
      if (role === "viewer") {
        res.status(403).json({ error: "Insufficient permissions" });
        return;
      }
    }

    const updates = updateScheduledChangeSchema.parse(req.body);

    // If updating effective date, validate it's not in the past
    if (updates.effectiveDate) {
      const newDate = parseDateOnly(updates.effectiveDate);
      if (!newDate) {
        res.status(400).json({ error: "Invalid effective date" });
        return;
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (newDate < today) {
        res.status(400).json({ error: "Effective date cannot be in the past" });
        return;
      }
      (updates as Record<string, unknown>).effectiveDate = newDate;
    }

    const updated = await ScheduledChange.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * DELETE /api/scheduled-changes/:id
 * Cancel (soft-delete) a pending scheduled change.
 */
export const deleteScheduledChange = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      res.status(400).json({ error: "Invalid scheduled change ID" });
      return;
    }

    const change = await ScheduledChange.findById(req.params.id);
    if (!change) {
      res.status(404).json({ error: "Scheduled change not found" });
      return;
    }

    if (change.status !== "pending") {
      res.status(400).json({ error: "Can only cancel pending scheduled changes" });
      return;
    }

    // Check authorization via scenario→org chain
    const { hasAccess, scenario } = await checkScenarioAccess(
      change.scenarioId.toString(),
      req.user!.userId
    );
    if (!hasAccess) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Check role-based write access
    if (scenario) {
      const role = await getUserOrgRole(scenario.orgId.toString(), req.user!.userId);
      if (role === "viewer") {
        res.status(403).json({ error: "Insufficient permissions" });
        return;
      }
    }

    const updated = await ScheduledChange.findByIdAndUpdate(
      req.params.id,
      { status: "cancelled" },
      { new: true }
    );
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /api/scenarios/:id/scheduled-changes/apply-due
 * Apply pending scheduled changes whose effectiveDate has arrived for this scenario.
 * Authorization is enforced by requireScenarioRole middleware on the route.
 */
export const applyDueChanges = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scenarioId = req.params.id;
    const now = new Date();

    const dueChanges = await ScheduledChange.find({
      scenarioId,
      status: "pending",
      effectiveDate: { $lte: now },
    });

    const applied: string[] = [];

    for (const change of dueChanges) {
      // Apply the change data to the employee
      const employee = await Employee.findById(change.employeeId);
      if (!employee) {
        // Employee was deleted; mark as cancelled
        await ScheduledChange.findByIdAndUpdate(change._id, { status: "cancelled" });
        continue;
      }

      await Employee.findByIdAndUpdate(change.employeeId, change.changeData);
      await ScheduledChange.findByIdAndUpdate(change._id, { status: "applied" });
      applied.push(change._id.toString());
    }

    res.json({ applied, count: applied.length });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Apply due scheduled changes for a specific scenario.
 * Used internally by the auto-apply middleware — no HTTP request/response.
 */
export async function applyDueChangesForScenario(scenarioId: string): Promise<number> {
  const now = new Date();

  const dueChanges = await ScheduledChange.find({
    scenarioId,
    status: "pending",
    effectiveDate: { $lte: now },
  });

  let appliedCount = 0;

  for (const change of dueChanges) {
    const employee = await Employee.findById(change.employeeId);
    if (!employee) {
      await ScheduledChange.findByIdAndUpdate(change._id, { status: "cancelled" });
      continue;
    }

    await Employee.findByIdAndUpdate(change.employeeId, change.changeData);
    await ScheduledChange.findByIdAndUpdate(change._id, { status: "applied" });
    appliedCount++;
  }

  return appliedCount;
}
