import { Router } from "express";
import auth from "../middleware/auth";
import { createOrg, getOrgs, updateOrg } from "../controllers/orgController";

const router = Router();

router.use(auth);

router.post("/", createOrg);
router.get("/", getOrgs);
router.patch("/:id", updateOrg);

export default router;
