import { Response } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { AuthRequest } from "../middleware/auth";
import ApprovalChain from "../models/ApprovalChain";

const stepSchema = z.object({
  role: z.string().trim().min(1, "Role is required"),
  approverIds: z.array(z.string()).min(1, "At least one approver is required"),
});

const conditionsSchema = z
  .object({
    minLevel: z.string().optional(),
    minCost: z.number().min(0).optional(),
  })
  .optional()
  .default({});

const createChainSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().optional(),
  steps: z.array(stepSchema).min(1, "At least one step is required"),
  conditions: conditionsSchema,
  priority: z.number().int().optional().default(0),
  isDefault: z.boolean().optional().default(false),
});

const updateChainSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  steps: z.array(stepSchema).min(1).optional(),
  conditions: conditionsSchema,
  priority: z.number().int().optional(),
  isDefault: z.boolean().optional(),
});

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * POST /api/orgs/:orgId/approval-chains
 * Create a new approval chain for an org.
 */
export const createApprovalChain = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const orgId = req.params.orgId;
    if (!isValidObjectId(orgId)) {
      res.status(400).json({ error: "Invalid organization ID" });
      return;
    }

    const data = createChainSchema.parse(req.body);

    // Validate approverIds are valid ObjectIds
    for (const step of data.steps) {
      for (const id of step.approverIds) {
        if (!isValidObjectId(id)) {
          res
            .status(400)
            .json({ error: `Invalid approver ID: ${id}` });
          return;
        }
      }
    }

    try {
      const chain = await ApprovalChain.create({
        orgId,
        name: data.name,
        description: data.description,
        steps: data.steps.map((s) => ({
          role: s.role,
          approverIds: s.approverIds.map(
            (id) => new mongoose.Types.ObjectId(id),
          ),
        })),
        conditions: data.conditions ?? {},
        priority: data.priority ?? 0,
        isDefault: data.isDefault ?? false,
        createdBy: req.user!.userId,
      });
      res.status(201).json(chain);
    } catch (createErr: unknown) {
      if (
        typeof createErr === "object" &&
        createErr !== null &&
        "code" in createErr &&
        (createErr as { code?: number }).code === 11000
      ) {
        res
          .status(409)
          .json({ error: "An approval chain with this name already exists" });
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
 * GET /api/orgs/:orgId/approval-chains
 * List all approval chains for an org.
 */
export const getApprovalChains = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const orgId = req.params.orgId;
    if (!isValidObjectId(orgId)) {
      res.status(400).json({ error: "Invalid organization ID" });
      return;
    }
    const chains = await ApprovalChain.find({ orgId }).sort({
      priority: -1,
      name: 1,
    });
    res.json(chains);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /api/orgs/:orgId/approval-chains/:chainId
 * Return a single chain.
 */
export const getApprovalChain = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { orgId, chainId } = req.params;
    if (!isValidObjectId(orgId) || !isValidObjectId(chainId)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }
    const chain = await ApprovalChain.findById(chainId);
    if (!chain || chain.orgId.toString() !== orgId) {
      res.status(404).json({ error: "Approval chain not found" });
      return;
    }
    res.json(chain);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PATCH /api/orgs/:orgId/approval-chains/:chainId
 * Update a chain.
 */
export const updateApprovalChain = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { orgId, chainId } = req.params;
    if (!isValidObjectId(orgId) || !isValidObjectId(chainId)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }

    const chain = await ApprovalChain.findById(chainId);
    if (!chain || chain.orgId.toString() !== orgId) {
      res.status(404).json({ error: "Approval chain not found" });
      return;
    }

    const updates = updateChainSchema.parse(req.body);

    if (updates.steps) {
      for (const step of updates.steps) {
        for (const id of step.approverIds) {
          if (!isValidObjectId(id)) {
            res.status(400).json({ error: `Invalid approver ID: ${id}` });
            return;
          }
        }
      }
    }

    const patch: Record<string, unknown> = {};
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.steps !== undefined) {
      patch.steps = updates.steps.map((s) => ({
        role: s.role,
        approverIds: s.approverIds.map(
          (id) => new mongoose.Types.ObjectId(id),
        ),
      }));
    }
    if (updates.conditions !== undefined) patch.conditions = updates.conditions;
    if (updates.priority !== undefined) patch.priority = updates.priority;
    if (updates.isDefault !== undefined) patch.isDefault = updates.isDefault;

    try {
      const updated = await ApprovalChain.findByIdAndUpdate(chainId, patch, {
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
          .json({ error: "An approval chain with this name already exists" });
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
 * DELETE /api/orgs/:orgId/approval-chains/:chainId
 * Delete a chain.
 */
export const deleteApprovalChain = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { orgId, chainId } = req.params;
    if (!isValidObjectId(orgId) || !isValidObjectId(chainId)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }
    const chain = await ApprovalChain.findById(chainId);
    if (!chain || chain.orgId.toString() !== orgId) {
      res.status(404).json({ error: "Approval chain not found" });
      return;
    }
    await ApprovalChain.findByIdAndDelete(chainId);
    res.json({ message: "Approval chain deleted" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};
