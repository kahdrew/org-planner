import { Response } from "express";
import { z } from "zod";
import { AuthRequest } from "../middleware/auth";
import AuditLog from "../models/AuditLog";
import Employee from "../models/Employee";
import ScheduledChange from "../models/ScheduledChange";

/**
 * GET /api/scenarios/:id/timeline
 * Returns all audit log events for the scenario, sorted by timestamp ascending.
 * Used to populate timeline markers (hires, departures, reorgs, edits).
 */
export const getTimeline = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scenarioId = req.params.id;

    const events = await AuditLog.find({ scenarioId })
      .sort({ timestamp: 1 })
      .lean();

    // Also fetch pending scheduled changes as future events
    const pendingChanges = await ScheduledChange.find({
      scenarioId,
      status: "pending",
    })
      .sort({ effectiveDate: 1 })
      .lean();

    const futureMarkers = pendingChanges.map((change) => ({
      _id: change._id,
      scenarioId: change.scenarioId,
      employeeId: change.employeeId,
      action: "scheduled" as const,
      changeType: change.changeType,
      changeData: change.changeData,
      timestamp: change.effectiveDate,
      isFuture: true,
    }));

    res.json({ events, futureMarkers });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /api/scenarios/:id/history?date=ISO
 * Returns the org state (all employees) at a specific point in time.
 * 
 * Algorithm:
 * 1. Get all audit log entries up to and including the given date.
 * 2. For each employee, reconstruct their state at that point by
 *    taking the last snapshot before/at the date.
 * 3. Employees created after the date are excluded.
 * 4. Employees deleted before or at the date are excluded.
 */
export const getHistoryAtDate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scenarioId = req.params.id;
    const dateStr = req.query.date as string;

    if (!dateStr) {
      // No date provided — return current state
      const employees = await Employee.find({ scenarioId }).lean();
      res.json(employees);
      return;
    }

    const dateSchema = z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: "Invalid date format",
    });

    const parsed = dateSchema.safeParse(dateStr);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid date format" });
      return;
    }

    const targetDate = new Date(parsed.data);

    // Get all audit log entries up to and including targetDate
    const logs = await AuditLog.find({
      scenarioId,
      timestamp: { $lte: targetDate },
    })
      .sort({ timestamp: 1 })
      .lean();

    // Build the state at targetDate: track the last known state of each employee
    const employeeStates = new Map<string, Record<string, unknown>>();
    const deletedEmployees = new Set<string>();

    for (const log of logs) {
      const empId = log.employeeId.toString();

      switch (log.action) {
        case "create":
        case "bulk_create":
          deletedEmployees.delete(empId);
          employeeStates.set(empId, { ...log.snapshot });
          break;

        case "update":
        case "move":
          if (employeeStates.has(empId)) {
            const current = employeeStates.get(empId)!;
            employeeStates.set(empId, { ...current, ...log.changes });
          } else {
            // Employee exists but no create log (pre-existing before audit started)
            employeeStates.set(empId, { ...log.snapshot });
          }
          break;

        case "delete":
          deletedEmployees.add(empId);
          employeeStates.delete(empId);
          break;
      }
    }

    // If there are no audit logs, check if the date is current or future —
    // fall back to current employees
    if (logs.length === 0) {
      const now = new Date();
      if (targetDate >= now) {
        const employees = await Employee.find({ scenarioId }).lean();
        res.json(employees);
        return;
      }
      // Date is in the past but no audit logs → return empty (no history)
      res.json([]);
      return;
    }

    const result = Array.from(employeeStates.values());
    res.json(result);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};
