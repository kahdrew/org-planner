import { Router } from "express";
import auth from "../middleware/auth";
import { requireOrgMembership, requireOrgRole, requireScenarioRole } from "../middleware/authorization";
import {
  createScenario,
  getScenarios,
  cloneScenario,
  deleteScenario,
  diffScenarios,
} from "../controllers/scenarioController";

const router = Router();

router.use(auth);

router.post("/orgs/:orgId/scenarios", requireOrgRole("owner", "admin"), createScenario);
router.get("/orgs/:orgId/scenarios", requireOrgMembership, getScenarios);
router.post("/scenarios/:id/clone", requireScenarioRole("owner", "admin"), cloneScenario);
router.delete("/scenarios/:id", requireScenarioRole("owner", "admin"), deleteScenario);
router.get("/scenarios/:a/diff/:b", diffScenarios);

export default router;
