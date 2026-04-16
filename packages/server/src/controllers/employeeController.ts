import { Response } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { AuthRequest } from "../middleware/auth";
import { checkScenarioAccess } from "../middleware/authorization";
import Employee from "../models/Employee";

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
    const { hasAccess } = await checkScenarioAccess(
      employee.scenarioId.toString(),
      req.user!.userId
    );
    if (!hasAccess) {
      res.status(403).json({ error: "Forbidden" });
      return;
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
    const { hasAccess } = await checkScenarioAccess(
      employee.scenarioId.toString(),
      req.user!.userId
    );
    if (!hasAccess) {
      res.status(403).json({ error: "Forbidden" });
      return;
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
    const { hasAccess } = await checkScenarioAccess(
      employee.scenarioId.toString(),
      req.user!.userId
    );
    if (!hasAccess) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { managerId, order } = moveSchema.parse(req.body);
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
