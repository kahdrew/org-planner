import { Router } from "express";
import auth from "../middleware/auth";
import { requireScenarioAccess } from "../middleware/authorization";
import { queryAi } from "../controllers/aiController";

const router = Router();

router.use(auth);

/**
 * Stream an AI response for a natural-language query against the scenario's
 * org data. All members of the owning org (including viewers) may query —
 * the endpoint is strictly read-only.
 */
router.post("/scenarios/:id/ai/query", requireScenarioAccess, queryAi);

export default router;
