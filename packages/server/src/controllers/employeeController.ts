import { Response } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { AuthRequest } from "../middleware/auth";
import { checkScenarioAccess, getUserOrgRole } from "../middleware/authorization";
import Employee, { IEmployee } from "../models/Employee";

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

    await Employee.findByIdAndDelete(req.params.id);
    res.json({ message: "Employee deleted" });
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

    const updated = await Employee.findByIdAndUpdate(
      req.params.id,
      { managerId, order },
      { new: true }
    );
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
    res.status(201).json(employees);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
};
