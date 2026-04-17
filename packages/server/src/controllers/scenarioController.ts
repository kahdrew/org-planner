import { Response } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { AuthRequest } from "../middleware/auth";
import { checkScenarioAccess } from "../middleware/authorization";
import Scenario from "../models/Scenario";
import Employee from "../models/Employee";

const createScenarioSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  baseScenarioId: z.string().optional(),
});

export const createScenario = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description, baseScenarioId } = createScenarioSchema.parse(req.body);
    const scenario = await Scenario.create({
      orgId: req.params.orgId,
      name,
      description,
      baseScenarioId,
      createdBy: req.user!.userId,
    });
    res.status(201).json(scenario);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getScenarios = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scenarios = await Scenario.find({ orgId: req.params.orgId });
    res.json(scenarios);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const cloneScenario = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const source = await Scenario.findById(req.params.id);
    if (!source) {
      res.status(404).json({ error: "Scenario not found" });
      return;
    }

    const cloned = await Scenario.create({
      orgId: source.orgId,
      name: `${source.name} (Copy)`,
      description: source.description,
      baseScenarioId: source._id,
      createdBy: req.user!.userId,
    });

    const employees = await Employee.find({ scenarioId: source._id }).lean();
    const idMap = new Map<string, mongoose.Types.ObjectId>();

    for (const emp of employees) {
      idMap.set(emp._id.toString(), new mongoose.Types.ObjectId());
    }

    const clonedEmployees = employees.map((emp) => {
      const newId = idMap.get(emp._id.toString())!;
      const managerId = emp.managerId ? idMap.get(emp.managerId.toString()) ?? null : null;
      const { _id, __v, createdAt, updatedAt, ...rest } = emp as Record<string, unknown>;
      return {
        ...rest,
        _id: newId,
        scenarioId: cloned._id,
        managerId,
      };
    });

    if (clonedEmployees.length > 0) {
      await Employee.insertMany(clonedEmployees);
    }

    res.status(201).json(cloned);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteScenario = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scenario = await Scenario.findByIdAndDelete(req.params.id);
    if (!scenario) {
      res.status(404).json({ error: "Scenario not found" });
      return;
    }
    await Employee.deleteMany({ scenarioId: scenario._id });
    res.json({ message: "Scenario deleted" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

interface DiffEntry {
  employee: Record<string, unknown>;
  changes?: Record<string, { from: unknown; to: unknown }>;
}

interface DiffResult {
  added: DiffEntry[];
  removed: DiffEntry[];
  moved: DiffEntry[];
  changed: DiffEntry[];
  unchanged: DiffEntry[];
}

export const diffScenarios = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;

    // Validate scenario IDs
    if (
      !mongoose.Types.ObjectId.isValid(req.params.a) ||
      !mongoose.Types.ObjectId.isValid(req.params.b)
    ) {
      res.status(400).json({ error: "Invalid scenario ID" });
      return;
    }

    // Check that both scenarios exist
    const [scenarioA, scenarioB] = await Promise.all([
      Scenario.findById(req.params.a),
      Scenario.findById(req.params.b),
    ]);

    if (!scenarioA || !scenarioB) {
      res.status(404).json({ error: "Scenario not found" });
      return;
    }

    // Check authorization for both scenarios
    const [accessA, accessB] = await Promise.all([
      checkScenarioAccess(req.params.a, userId),
      checkScenarioAccess(req.params.b, userId),
    ]);

    if (!accessA.hasAccess) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (!accessB.hasAccess) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const employeesA = await Employee.find({ scenarioId: req.params.a }).lean();
    const employeesB = await Employee.find({ scenarioId: req.params.b }).lean();

    const mapA = new Map(employeesA.map((e) => [e._id.toString(), e]));
    const mapB = new Map(employeesB.map((e) => [e._id.toString(), e]));

    const nameKeyA = new Map<string, typeof employeesA[number]>();
    for (const e of employeesA) {
      nameKeyA.set(`${e.name}|${e.title}`, e);
    }

    const result: DiffResult = { added: [], removed: [], moved: [], changed: [], unchanged: [] };
    const matchedB = new Set<string>();

    for (const empB of employeesB) {
      const bId = empB._id.toString();
      let empA = mapA.get(bId);

      if (!empA) {
        const key = `${empB.name}|${empB.title}`;
        empA = nameKeyA.get(key);
      }

      if (!empA) {
        result.added.push({ employee: empB });
        matchedB.add(bId);
        continue;
      }

      matchedB.add(bId);
      const aId = empA._id.toString();
      mapA.delete(aId);
      nameKeyA.delete(`${empA.name}|${empA.title}`);

      const compareFields = [
        "name", "title", "department", "level", "location",
        "salary", "equity", "employmentType", "status",
        "costCenter", "hiringManager", "recruiter", "requisitionId", "order",
      ] as const;

      const managerChanged =
        (empA.managerId?.toString() ?? null) !== (empB.managerId?.toString() ?? null);

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const field of compareFields) {
        const valA = (empA as Record<string, unknown>)[field];
        const valB = (empB as Record<string, unknown>)[field];
        if (String(valA ?? "") !== String(valB ?? "")) {
          changes[field] = { from: valA, to: valB };
        }
      }

      if (managerChanged) {
        changes["managerId"] = {
          from: empA.managerId?.toString() ?? null,
          to: empB.managerId?.toString() ?? null,
        };
      }

      if (managerChanged && Object.keys(changes).length === 1) {
        result.moved.push({ employee: empB, changes });
      } else if (Object.keys(changes).length > 0) {
        result.changed.push({ employee: empB, changes });
      } else {
        result.unchanged.push({ employee: empB });
      }
    }

    for (const [, empA] of mapA) {
      result.removed.push({ employee: empA });
    }

    res.json(result);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};
