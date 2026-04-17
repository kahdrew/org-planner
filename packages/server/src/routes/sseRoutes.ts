import { Router } from "express";
import { streamOrgEvents } from "../controllers/sseController";

const router = Router();

/**
 * SSE routes intentionally do NOT use the global `auth` middleware because
 * browser EventSource cannot send custom headers. The controller accepts
 * a token via `Authorization: Bearer ...` or `?access_token=...`.
 */
router.get("/orgs/:orgId/events", streamOrgEvents);

export default router;
