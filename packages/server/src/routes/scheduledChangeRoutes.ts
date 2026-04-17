import { Router } from "express";
import auth from "../middleware/auth";
import { requireScenarioAccess, requireScenarioRole } from "../middleware/authorization";
import { autoApplyScheduledChanges } from "../middleware/autoApplyScheduledChanges";
import {
  createScheduledChange,
  getScheduledChanges,
  updateScheduledChange,
  deleteScheduledChange,
  applyDueChanges,
} from "../controllers/scheduledChangeController";

const router = Router();

router.use(auth);

// Scenario-scoped endpoints
router.post("/scenarios/:id/scheduled-changes", requireScenarioRole("owner", "admin"), createScheduledChange);
router.get("/scenarios/:id/scheduled-changes", requireScenarioAccess, autoApplyScheduledChanges, getScheduledChanges);

// Scenario-scoped apply due changes (requires admin/owner role)
router.post("/scenarios/:id/scheduled-changes/apply-due", requireScenarioRole("owner", "admin"), applyDueChanges);

// Scheduled change-level endpoints (authorization checked in controller)
router.patch("/scheduled-changes/:id", updateScheduledChange);
router.delete("/scheduled-changes/:id", deleteScheduledChange);

export default router;
