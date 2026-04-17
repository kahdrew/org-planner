import { Router } from "express";
import auth from "../middleware/auth";
import { requireScenarioAccess, requireScenarioRole } from "../middleware/authorization";
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
router.get("/scenarios/:id/scheduled-changes", requireScenarioAccess, getScheduledChanges);

// Scheduled change-level endpoints (authorization checked in controller)
router.patch("/scheduled-changes/:id", updateScheduledChange);
router.delete("/scheduled-changes/:id", deleteScheduledChange);

// Apply due changes (admin action)
router.post("/scheduled-changes/apply-due", applyDueChanges);

export default router;
