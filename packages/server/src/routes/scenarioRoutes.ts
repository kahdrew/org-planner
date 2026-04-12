import { Router } from "express";
import auth from "../middleware/auth";
import {
  createScenario,
  getScenarios,
  cloneScenario,
  deleteScenario,
  diffScenarios,
} from "../controllers/scenarioController";

const router = Router();

router.use(auth);

router.post("/orgs/:orgId/scenarios", createScenario);
router.get("/orgs/:orgId/scenarios", getScenarios);
router.post("/scenarios/:id/clone", cloneScenario);
router.delete("/scenarios/:id", deleteScenario);
router.get("/scenarios/:a/diff/:b", diffScenarios);

export default router;
