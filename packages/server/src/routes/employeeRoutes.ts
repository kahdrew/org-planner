import { Router } from "express";
import auth from "../middleware/auth";
import { requireScenarioAccess, requireScenarioRole } from "../middleware/authorization";
import {
  getEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  moveEmployee,
  bulkCreate,
} from "../controllers/employeeController";

const router = Router();

router.use(auth);

router.get("/scenarios/:scenarioId/employees", requireScenarioAccess, getEmployees);
router.post("/scenarios/:scenarioId/employees", requireScenarioRole("owner", "admin"), createEmployee);
router.post("/scenarios/:scenarioId/employees/bulk", requireScenarioRole("owner", "admin"), bulkCreate);
router.patch("/employees/:id", updateEmployee);
router.delete("/employees/:id", deleteEmployee);
router.patch("/employees/:id/move", moveEmployee);

export default router;
