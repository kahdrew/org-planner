import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import { applyDueChangesForScenario } from "../controllers/scheduledChangeController";

/**
 * Middleware that auto-applies due scheduled changes for a scenario.
 *
 * When a user accesses a scenario (via :id or :scenarioId param),
 * this middleware checks for any pending changes whose effectiveDate
 * has arrived and applies them before the request proceeds.
 *
 * This uses lazy evaluation: changes are applied when someone accesses
 * the scenario, ensuring up-to-date data without requiring a background job.
 */
export const autoApplyScheduledChanges = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const scenarioId = req.params.scenarioId || req.params.id;
    if (!scenarioId) {
      next();
      return;
    }

    // Fire-and-forget: apply due changes but don't block the request
    // if it fails (e.g., invalid scenario ID in a non-scenario route)
    await applyDueChangesForScenario(scenarioId);

    next();
  } catch {
    // Don't block the request if auto-apply fails — log and continue
    console.error("Auto-apply scheduled changes failed for scenario:", req.params.scenarioId || req.params.id);
    next();
  }
};
