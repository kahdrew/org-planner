import { Router } from "express";
import auth from "../middleware/auth";
import { requireOrgMembership, requireScenarioAccess } from "../middleware/authorization";
import {
  createScenario,
  getScenarios,
  cloneScenario,
  deleteScenario,
  diffScenarios,
} from "../controllers/scenarioController";

const router = Router();

router.use(auth);

router.post("/orgs/:orgId/scenarios", requireOrgMembership, createScenario);
router.get("/orgs/:orgId/scenarios", requireOrgMembership, getScenarios);
router.post("/scenarios/:id/clone", requireScenarioAccess, cloneScenario);
router.delete("/scenarios/:id", requireScenarioAccess, deleteScenario);
router.get("/scenarios/:a/diff/:b", diffScenarios);

export default router;
