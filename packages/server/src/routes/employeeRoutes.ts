import { Router } from "express";
import auth from "../middleware/auth";
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

router.get("/scenarios/:scenarioId/employees", getEmployees);
router.post("/scenarios/:scenarioId/employees", createEmployee);
router.post("/scenarios/:scenarioId/employees/bulk", bulkCreate);
router.patch("/employees/:id", updateEmployee);
router.delete("/employees/:id", deleteEmployee);
router.patch("/employees/:id/move", moveEmployee);

export default router;
