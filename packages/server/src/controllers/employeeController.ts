import { Response } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { AuthRequest } from "../middleware/auth";
import { checkScenarioAccess, getUserOrgRole } from "../middleware/authorization";
import Employee, { IEmployee } from "../models/Employee";
import AuditLog, { AuditAction } from "../models/AuditLog";

/**
 * Serialize an Employee document to a plain snapshot suitable for audit storage.
 * Strips Mongoose internals while preserving fields relevant to reconstructing history.
 */
function serializeEmployee(emp: IEmployee): Record<string, unknown> {
  const obj = emp.toObject({ depopulate: true });
  // Remove Mongoose metadata we don't need in the snapshot
  delete obj.__v;
  return obj;
}

/**
 * Write an audit log entry. Errors are swallowed to avoid breaking the
 * primary request flow if auditing fails for any reason.
 */
async function writeAuditLog(params: {
  scenarioId: mongoose.Types.ObjectId | string;
  employeeId: mongoose.Types.ObjectId | string;
  action: AuditAction;
  snapshot: Record<string, unknown>;
  changes?: Record<string, unknown>;
  performedBy: string;
  timestamp?: Date;
}): Promise<void> {
  try {
    await AuditLog.create({
      scenarioId: params.scenarioId,
      employeeId: params.employeeId,
      action: params.action,
      snapshot: params.snapshot,
      changes: params.changes,
      performedBy: params.performedBy,
      timestamp: params.timestamp ?? new Date(),
    });
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}

const employeeSchema = z.object({
  name: z.string().min(1),
  title: z.string().min(1),
  department: z.string().min(1),
  level: z.string().min(1),
  location: z.string().min(1),
  startDate: z.string().optional(),
  salary: z.number().optional(),
  equity: z.number().optional(),
  employmentType: z.enum(["FTE", "Contractor", "Intern"]),
  status: z.enum(["Active", "Planned", "Open Req", "Backfill"]),
  costCenter: z.string().optional(),
  hiringManager: z.string().optional(),
  recruiter: z.string().optional(),
  requisitionId: z.string().optional(),
  managerId: z.string().nullable().optional(),
  order: z.number().optional(),
  avatarUrl: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateEmployeeSchema = employeeSchema.partial();

const moveSchema = z.object({
  managerId: z.string().nullable(),
  order: z.number(),
});

export const getEmployees = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const employees = await Employee.find({ scenarioId: req.params.scenarioId });
    res.json(employees);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const createEmployee = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = employeeSchema.parse(req.body);
    const employee = await Employee.create({
      ...data,
      scenarioId: req.params.scenarioId,
    });

    await writeAuditLog({
      scenarioId: employee.scenarioId,
      employeeId: employee._id as mongoose.Types.ObjectId,
      action: "create",
      snapshot: serializeEmployee(employee),
      performedBy: req.user!.userId,
    });

    res.status(201).json(employee);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateEmployee = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      res.status(400).json({ error: "Invalid employee ID" });
      return;
    }

    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      res.status(404).json({ error: "Employee not found" });
      return;
    }

    // Check authorization via scenario→org chain
    const { hasAccess, scenario } = await checkScenarioAccess(
      employee.scenarioId.toString(),
      req.user!.userId
    );
    if (!hasAccess) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Check role-based write access (viewers cannot edit)
    if (scenario) {
      const role = await getUserOrgRole(scenario.orgId.toString(), req.user!.userId);
      if (role === "viewer") {
        res.status(403).json({ error: "Insufficient permissions" });
        return;
      }
    }

    const updates = updateEmployeeSchema.parse(req.body);
    const updated = await Employee.findByIdAndUpdate(req.params.id, updates, { new: true });

    if (updated) {
      await writeAuditLog({
        scenarioId: updated.scenarioId,
        employeeId: updated._id as mongoose.Types.ObjectId,
        action: "update",
        snapshot: serializeEmployee(updated),
        changes: updates,
        performedBy: req.user!.userId,
      });
    }

    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteEmployee = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      res.status(400).json({ error: "Invalid employee ID" });
      return;
    }

    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      res.status(404).json({ error: "Employee not found" });
      return;
    }

    // Check authorization via scenario→org chain
    const { hasAccess, scenario } = await checkScenarioAccess(
      employee.scenarioId.toString(),
      req.user!.userId
    );
    if (!hasAccess) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Check role-based write access (viewers cannot delete)
    if (scenario) {
      const role = await getUserOrgRole(scenario.orgId.toString(), req.user!.userId);
      if (role === "viewer") {
        res.status(403).json({ error: "Insufficient permissions" });
        return;
      }
    }

    const snapshot = serializeEmployee(employee);

    // VAL-CROSS-019: Cascade manager references — when a manager is deleted
    // their direct reports must not retain a stale managerId. We null out
    // their managerId in the same scenario so they become root-level
    // employees (a subsequent reparent can reassign them). Do this BEFORE
    // deleting the manager itself to avoid an inconsistent state if the
    // delete fails between the two operations.
    const orphanedReports = await Employee.find({
      scenarioId: employee.scenarioId,
      managerId: req.params.id,
    }).select("_id");
    const affectedReportIds = orphanedReports.map((r) =>
      (r._id as mongoose.Types.ObjectId).toString(),
    );
    if (affectedReportIds.length > 0) {
      await Employee.updateMany(
        { scenarioId: employee.scenarioId, managerId: req.params.id },
        { $set: { managerId: null } },
      );
    }

    await Employee.findByIdAndDelete(req.params.id);

    await writeAuditLog({
      scenarioId: employee.scenarioId,
      employeeId: employee._id as mongoose.Types.ObjectId,
      action: "delete",
      snapshot,
      changes: affectedReportIds.length > 0
        ? { affectedReportIds }
        : undefined,
      performedBy: req.user!.userId,
    });

    res.json({
      message: "Employee deleted",
      affectedReportIds,
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const moveEmployee = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      res.status(400).json({ error: "Invalid employee ID" });
      return;
    }

    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      res.status(404).json({ error: "Employee not found" });
      return;
    }

    // Check authorization via scenario→org chain
    const { hasAccess, scenario } = await checkScenarioAccess(
      employee.scenarioId.toString(),
      req.user!.userId
    );
    if (!hasAccess) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Check role-based write access (viewers cannot move)
    if (scenario) {
      const role = await getUserOrgRole(scenario.orgId.toString(), req.user!.userId);
      if (role === "viewer") {
        res.status(403).json({ error: "Insufficient permissions" });
        return;
      }
    }

    const { managerId, order } = moveSchema.parse(req.body);

    // Self-referential check
    if (managerId === req.params.id) {
      res.status(400).json({ error: "Cannot set employee as their own manager (self-referential cycle)" });
      return;
    }

    // If managerId is not null, validate it exists and check for cycles
    if (managerId !== null) {
      const manager = await Employee.findById(managerId);
      if (!manager || manager.scenarioId.toString() !== employee.scenarioId.toString()) {
        res.status(400).json({ error: "Invalid manager: manager not found in the same scenario" });
        return;
      }

      // Cycle detection: walk up from the proposed manager's chain;
      // if we encounter the employee being moved, it would create a cycle.
      let ancestorId: string | null = managerId;
      const visited = new Set<string>();
      while (ancestorId) {
        if (ancestorId === req.params.id) {
          res.status(400).json({ error: "Cannot move employee: this would create a cycle in the hierarchy" });
          return;
        }
        if (visited.has(ancestorId)) break; // guard against existing broken data
        visited.add(ancestorId);
        const ancestorDoc: IEmployee | null = await Employee.findById(ancestorId);
        ancestorId = ancestorDoc?.managerId ? ancestorDoc.managerId.toString() : null;
      }
    }

    const previousManagerId = employee.managerId ? employee.managerId.toString() : null;
    const previousOrder = employee.order;

    const updated = await Employee.findByIdAndUpdate(
      req.params.id,
      { managerId, order },
      { new: true }
    );

    if (updated) {
      await writeAuditLog({
        scenarioId: updated.scenarioId,
        employeeId: updated._id as mongoose.Types.ObjectId,
        action: "move",
        snapshot: serializeEmployee(updated),
        changes: {
          managerId,
          order,
          previousManagerId,
          previousOrder,
        },
        performedBy: req.user!.userId,
      });
    }

    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
};

export const bulkCreate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const schema = z.array(employeeSchema);
    const items = schema.parse(req.body);
    const employees = await Employee.insertMany(
      items.map((item) => ({ ...item, scenarioId: req.params.scenarioId }))
    );

    const timestamp = new Date();
    await Promise.all(
      employees.map((emp) =>
        writeAuditLog({
          scenarioId: emp.scenarioId,
          employeeId: emp._id as mongoose.Types.ObjectId,
          action: "bulk_create",
          snapshot: serializeEmployee(emp as unknown as IEmployee),
          performedBy: req.user!.userId,
          timestamp,
        }),
      ),
    );

    res.status(201).json(employees);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
};
