import { Router } from "express";
import { streamOrgEvents, pollOrgEvents } from "../controllers/sseController";

const router = Router();

/**
 * SSE routes intentionally do NOT use the global `auth` middleware because
 * browser EventSource cannot send custom headers. The controllers accept
 * a token via `Authorization: Bearer ...` or `?access_token=...`.
 */
// Polling fallback must be declared first so the more specific `/poll`
// path is not swallowed by the `/events` SSE handler if a user agent
// probes with a trailing slash.
router.get("/orgs/:orgId/events/poll", pollOrgEvents);
router.get("/orgs/:orgId/events", streamOrgEvents);

export default router;
