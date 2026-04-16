import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "./auth";
import Organization from "../models/Organization";
import Scenario from "../models/Scenario";

/**
 * Check if a string is a valid MongoDB ObjectId.
 */
function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * Middleware: Verify the authenticated user is a member (or owner) of the org
 * identified by req.params.orgId.
 *
 * Use on routes like POST /orgs/:orgId/scenarios, GET /orgs/:orgId/scenarios.
 */
export const requireOrgMembership = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const orgId = req.params.orgId || req.params.id;
    if (!orgId || !isValidObjectId(orgId)) {
      res.status(400).json({ error: "Invalid organization ID" });
      return;
    }

    const org = await Organization.findById(orgId);
    if (!org) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const userId = req.user!.userId;
    const isMember = org.memberIds.some(
      (memberId) => memberId.toString() === userId
    );
    const isOwner = org.ownerId.toString() === userId;

    if (!isMember && !isOwner) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    next();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Middleware: Verify the authenticated user is the owner of the org
 * identified by req.params.id.
 *
 * Use on routes like PATCH /orgs/:id.
 */
export const requireOrgOwnership = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const orgId = req.params.id;
    if (!orgId || !isValidObjectId(orgId)) {
      res.status(400).json({ error: "Invalid organization ID" });
      return;
    }

    const org = await Organization.findById(orgId);
    if (!org) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    if (org.ownerId.toString() !== req.user!.userId) {
      res.status(403).json({ error: "Only the owner can update the organization" });
      return;
    }

    next();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Middleware: Verify the authenticated user is a member of the org that
 * the scenario (identified by req.params.scenarioId or req.params.id) belongs to.
 *
 * Use on scenario-level routes: clone, delete, diff.
 * And on employee routes: GET/POST /scenarios/:scenarioId/employees.
 */
export const requireScenarioAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const scenarioId = req.params.scenarioId || req.params.id;
    if (!scenarioId || !isValidObjectId(scenarioId)) {
      res.status(400).json({ error: "Invalid scenario ID" });
      return;
    }

    const scenario = await Scenario.findById(scenarioId);
    if (!scenario) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const org = await Organization.findById(scenario.orgId);
    if (!org) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const userId = req.user!.userId;
    const isMember = org.memberIds.some(
      (memberId) => memberId.toString() === userId
    );
    const isOwner = org.ownerId.toString() === userId;

    if (!isMember && !isOwner) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    next();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Helper function: Check org membership for a given orgId and userId.
 * Returns true if the user is owner or member.
 */
export async function checkOrgMembership(
  orgId: string,
  userId: string
): Promise<boolean> {
  if (!isValidObjectId(orgId)) return false;

  const org = await Organization.findById(orgId);
  if (!org) return false;

  const isMember = org.memberIds.some(
    (memberId) => memberId.toString() === userId
  );
  const isOwner = org.ownerId.toString() === userId;

  return isMember || isOwner;
}

/**
 * Helper function: Check org membership via scenario→org chain.
 * Returns true if the user is owner or member of the org the scenario belongs to.
 */
export async function checkScenarioAccess(
  scenarioId: string,
  userId: string
): Promise<{ hasAccess: boolean; scenario?: InstanceType<typeof Scenario> }> {
  if (!isValidObjectId(scenarioId)) return { hasAccess: false };

  const scenario = await Scenario.findById(scenarioId);
  if (!scenario) return { hasAccess: false };

  const hasAccess = await checkOrgMembership(scenario.orgId.toString(), userId);
  return { hasAccess, scenario: hasAccess ? scenario : undefined };
}
