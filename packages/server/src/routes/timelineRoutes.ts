import { Router } from "express";
import auth from "../middleware/auth";
import { requireScenarioAccess } from "../middleware/authorization";
import { autoApplyScheduledChanges } from "../middleware/autoApplyScheduledChanges";
import { getTimeline, getHistoryAtDate } from "../controllers/timelineController";

const router = Router();

router.use(auth);

// GET /api/scenarios/:id/timeline — list audit events and future scheduled-change markers
router.get(
  "/scenarios/:id/timeline",
  requireScenarioAccess,
  autoApplyScheduledChanges,
  getTimeline,
);

// GET /api/scenarios/:id/history?date=ISO — reconstruct org state at a point in time
router.get(
  "/scenarios/:id/history",
  requireScenarioAccess,
  autoApplyScheduledChanges,
  getHistoryAtDate,
);

export default router;
