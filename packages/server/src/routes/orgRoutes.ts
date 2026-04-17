import { Router } from "express";
import auth from "../middleware/auth";
import { createOrg, getOrgs, deleteOrg, updateOrg } from "../controllers/orgController";

const router = Router();

router.use(auth);

router.post("/", createOrg);
router.get("/", getOrgs);
router.patch("/:id", updateOrg);
router.delete("/:id", deleteOrg);

export default router;
