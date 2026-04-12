import { Response } from "express";
import { z } from "zod";
import { AuthRequest } from "../middleware/auth";
import Organization from "../models/Organization";

const createOrgSchema = z.object({
  name: z.string().min(1),
});

const updateOrgSchema = z.object({
  name: z.string().min(1).optional(),
});

export const createOrg = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name } = createOrgSchema.parse(req.body);
    const userId = req.user!.userId;
    const org = await Organization.create({
      name,
      ownerId: userId,
      memberIds: [userId],
    });
    res.status(201).json(org);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getOrgs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const orgs = await Organization.find({ memberIds: userId });
    res.json(orgs);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateOrg = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const updates = updateOrgSchema.parse(req.body);
    const org = await Organization.findById(req.params.id);
    if (!org) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }
    if (org.ownerId.toString() !== req.user!.userId) {
      res.status(403).json({ error: "Only the owner can update the organization" });
      return;
    }
    Object.assign(org, updates);
    await org.save();
    res.json(org);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
};
