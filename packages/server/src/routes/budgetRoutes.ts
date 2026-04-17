import { Router } from "express";
import auth from "../middleware/auth";
import {
  requireScenarioAccess,
  requireScenarioRole,
} from "../middleware/authorization";
import {
  createBudgetEnvelope,
  getBudgetEnvelopes,
  updateBudgetEnvelope,
  deleteBudgetEnvelope,
  getBudgetSummary,
} from "../controllers/budgetController";

const router = Router();

router.use(auth);

// Any org member (including viewer) may read envelopes & summary
router.get(
  "/scenarios/:id/budgets",
  requireScenarioAccess,
  getBudgetEnvelopes,
);
router.get(
  "/scenarios/:id/budgets/summary",
  requireScenarioAccess,
  getBudgetSummary,
);

// Only owner/admin may create, update, or delete envelopes
router.post(
  "/scenarios/:id/budgets",
  requireScenarioRole("owner", "admin"),
  createBudgetEnvelope,
);
router.patch(
  "/scenarios/:id/budgets/:budgetId",
  requireScenarioRole("owner", "admin"),
  updateBudgetEnvelope,
);
router.delete(
  "/scenarios/:id/budgets/:budgetId",
  requireScenarioRole("owner", "admin"),
  deleteBudgetEnvelope,
);

export default router;
