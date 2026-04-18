import { Response } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { AuthRequest } from "../middleware/auth";
import { checkScenarioAccess, getUserOrgRole } from "../middleware/authorization";
import ScheduledChange from "../models/ScheduledChange";
import Employee, { IEmployee } from "../models/Employee";
import AuditLog, { AuditAction } from "../models/AuditLog";
import { emitScenarioScopedEvent } from "../sse/emit";
import type { SseEventType } from "../sse/eventBus";

/**
 * Serialize an Employee document to a plain snapshot suitable for SSE payloads.
 * Matches the shape produced by employeeController so SSE consumers see a
 * consistent event payload regardless of which mutation path fired.
 */
function serializeEmployeeForSse(emp: IEmployee): Record<string, unknown> {
  const obj = emp.toObject({ depopulate: true });
  delete obj.__v;
  return obj;
}

/**
 * Map a scheduled change's `changeData` to the appropriate SSE event type.
 * Changes that re-parent an employee emit `employee.moved`; everything else
 * is a generic `employee.updated`.
 */
function sseEventTypeFor(changeData: Record<string, unknown>): SseEventType {
  if (Object.prototype.hasOwnProperty.call(changeData, "managerId")) {
    return "employee.moved";
  }
  return "employee.updated";
}

/**
 * Determine the appropriate audit action for an applied scheduled change.
 * If the change modifies the employee's `managerId`, it's a "move";
 * otherwise it's treated as a regular "update".
 */
function auditActionFor(changeData: Record<string, unknown>): AuditAction {
  if (Object.prototype.hasOwnProperty.call(changeData, "managerId")) {
    return "move";
  }
  return "update";
}

/**
 * Write an audit log entry for a scheduled change that was just applied.
 * Errors are swallowed so we never break change application on audit failure.
 *
 * `performedBy` falls back to the user who originally scheduled the change
 * when the caller (e.g. auto-apply middleware without a user context)
 * doesn't provide one — this keeps the audit trail complete.
 */
async function writeScheduledChangeAudit(params: {
  scenarioId: mongoose.Types.ObjectId;
  employeeId: mongoose.Types.ObjectId;
  changeData: Record<string, unknown>;
  snapshot: Record<string, unknown>;
  performedBy: string;
}): Promise<void> {
  try {
    await AuditLog.create({
      scenarioId: params.scenarioId,
      employeeId: params.employeeId,
      action: auditActionFor(params.changeData),
      snapshot: params.snapshot,
      changes: params.changeData,
      performedBy: params.performedBy,
      timestamp: new Date(),
    });
  } catch (err) {
    console.error("Failed to write audit log for scheduled change:", err);
  }
}

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
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  // Guard against invalid dates like 2026-02-31 that would roll over.
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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
    const today = startOfTodayUtc();
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
      const today = startOfTodayUtc();
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

      const changeData = change.changeData as Record<string, unknown>;
      const previousManagerId = employee.managerId
        ? employee.managerId.toString()
        : null;
      const previousOrder = employee.order;
      const updated = await Employee.findByIdAndUpdate(
        change.employeeId,
        changeData,
        { new: true },
      );
      await ScheduledChange.findByIdAndUpdate(change._id, { status: "applied" });

      if (updated) {
        const snapshot = updated.toObject({ depopulate: true }) as unknown as Record<string, unknown>;
        delete snapshot.__v;
        await writeScheduledChangeAudit({
          scenarioId: change.scenarioId,
          employeeId: change.employeeId,
          changeData,
          snapshot,
          performedBy: req.user!.userId,
        });

        // Fan out to SSE clients so realtime consumers see the applied
        // scheduled change (e.g. timeline slider, org chart, dashboards).
        const eventType = sseEventTypeFor(changeData);
        const payload: Record<string, unknown> =
          eventType === "employee.moved"
            ? {
                employee: serializeEmployeeForSse(updated),
                previousManagerId,
                previousOrder,
              }
            : { employee: serializeEmployeeForSse(updated) };
        await emitScenarioScopedEvent(change.scenarioId, eventType, payload);
      }

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
 *
 * Each applied change also emits an AuditLog entry so the timeline/history
 * endpoints stay in sync with the actual employee mutations. The
 * `performedBy` argument identifies the user triggering the apply (e.g.
 * the current request user). When unavailable, we fall back to the user
 * who originally scheduled the change so the audit trail is never empty.
 */
export async function applyDueChangesForScenario(
  scenarioId: string,
  performedBy?: string,
): Promise<number> {
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

    const changeData = change.changeData as Record<string, unknown>;
    const previousManagerId = employee.managerId
      ? employee.managerId.toString()
      : null;
    const previousOrder = employee.order;
    const updated = await Employee.findByIdAndUpdate(
      change.employeeId,
      changeData,
      { new: true },
    );
    await ScheduledChange.findByIdAndUpdate(change._id, { status: "applied" });

    if (updated) {
      const snapshot = updated.toObject({ depopulate: true }) as unknown as Record<string, unknown>;
      delete snapshot.__v;
      await writeScheduledChangeAudit({
        scenarioId: change.scenarioId,
        employeeId: change.employeeId,
        changeData,
        snapshot,
        performedBy: performedBy ?? change.createdBy.toString(),
      });

      // Fan out to SSE clients so realtime consumers see the applied
      // scheduled change (e.g. timeline slider, org chart, dashboards).
      const eventType = sseEventTypeFor(changeData);
      const payload: Record<string, unknown> =
        eventType === "employee.moved"
          ? {
              employee: serializeEmployeeForSse(updated),
              previousManagerId,
              previousOrder,
            }
          : { employee: serializeEmployeeForSse(updated) };
      await emitScenarioScopedEvent(change.scenarioId, eventType, payload);
    }

    appliedCount++;
  }

  return appliedCount;
}
